import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Flow, FlowInputField, Node, Edge, NodeId, EdgeId, ParameterBinding } from '../types';
import type { MutationResult } from '../types/stores';
import { createEmptyFlow, getOrphanedEdges, validateAddEdge, validateFlow } from '../utils';
import { buildContextPath, parseContextPath } from '../utils/contextPath';

export const useGraphStore = defineStore('graph', () => {
  // ─────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────
  const flow = ref<Flow>(createEmptyFlow());

  // ─────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────
  const nodes = computed(() => Object.values(flow.value.nodes));
  const edges = computed(() => Object.values(flow.value.edges));
  const nodeCount = computed(() => nodes.value.length);
  const edgeCount = computed(() => edges.value.length);

  const validationErrors = computed(() => validateFlow(flow.value));
  const hasErrors = computed(() => validationErrors.value.some((e) => e.type === 'error'));
  const hasWarnings = computed(() => validationErrors.value.some((e) => e.type === 'warning'));
  const isValid = computed(() => !hasErrors.value);

  // ─────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────

  /** Replace the entire flow (used by persistence layer) */
  function loadFlow(newFlow: Flow): void {
    flow.value = newFlow;
  }

  /** Reset to empty flow */
  function reset(): void {
    flow.value = createEmptyFlow();
  }

  /**
   * Snapshot the current flow state (for undo/redo)
   * Returns a deep clone suitable for history stack
   *
   * TODO: These snapshot/restore methods are scaffolding for a future history stack.
   * When implementing undo/redo, dirty tracking in persistenceStore will need to be
   * enhanced to compare against the last-saved snapshot rather than using a simple
   * boolean flag. This ensures that undoing back to the saved state correctly
   * returns isDirty to false.
   */
  function snapshot(): Flow {
    return JSON.parse(JSON.stringify(flow.value));
  }

  /** Restore from a snapshot (for undo/redo) */
  function restore(snapshotFlow: Flow): void {
    flow.value = snapshotFlow;
  }

  function addNode(node: Node): MutationResult {
    if (flow.value.nodes[node.id]) {
      return { success: false, errors: [`Node with ID "${node.id}" already exists`] };
    }

    flow.value.nodes[node.id] = node;

    if (!flow.value.entryPoint && Object.keys(flow.value.nodes).length === 1) {
      flow.value.entryPoint = node.id;
    }

    return { success: true };
  }

  function updateNode(nodeId: NodeId, updates: Partial<Omit<Node, 'id'>>): MutationResult {
    const node = flow.value.nodes[nodeId];
    if (!node) {
      return { success: false, errors: [`Node "${nodeId}" not found`] };
    }

    Object.assign(node, updates);
    return { success: true };
  }

  function removeNode(nodeId: NodeId): MutationResult {
    if (!flow.value.nodes[nodeId]) {
      return { success: false, errors: [`Node "${nodeId}" not found`] };
    }

    delete flow.value.nodes[nodeId];

    // Clean up orphaned edges
    getOrphanedEdges(flow.value, nodeId).forEach((id) => {
      delete flow.value.edges[id];
    });

    // Clear entry point if it was this node
    if (flow.value.entryPoint === nodeId) {
      flow.value.entryPoint = null;
    }

    return { success: true };
  }

  function batchUpdateNodes(updates: Record<NodeId, Partial<Omit<Node, 'id'>>>): MutationResult {
    const errors: string[] = [];

    for (const [nodeId, nodeUpdates] of Object.entries(updates)) {
      const result = updateNode(nodeId as NodeId, nodeUpdates);
      if (!result.success) {
        errors.push(...(result.errors || []));
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  function addEdge(edge: Edge): MutationResult {
    const validation = validateAddEdge(flow.value, edge);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    flow.value.edges[edge.id] = edge;
    return { success: true };
  }

  function updateEdge(
    edgeId: EdgeId,
    updates: Partial<Omit<Edge, 'id' | 'source' | 'target'>>,
  ): MutationResult {
    const edge = flow.value.edges[edgeId];
    if (!edge) {
      return { success: false, errors: [`Edge "${edgeId}" not found`] };
    }

    Object.assign(edge, updates);
    return { success: true };
  }

  function removeEdge(edgeId: EdgeId): MutationResult {
    if (!flow.value.edges[edgeId]) {
      return { success: false, errors: [`Edge "${edgeId}" not found`] };
    }

    delete flow.value.edges[edgeId];
    return { success: true };
  }

  function setEntryPoint(nodeId: NodeId | null): MutationResult {
    if (nodeId && !flow.value.nodes[nodeId]) {
      return { success: false, errors: [`Node "${nodeId}" not found`] };
    }

    flow.value.entryPoint = nodeId;
    return { success: true };
  }

  function setFlowInputs(inputs: FlowInputField[]): void {
    // Detect name-renames by matching array position. We only do this when the
    // length is unchanged — an add or delete shifts positions so a positional
    // diff would misread them as renames. This matches the StartNodeForm UX
    // where each action (add/delete/update-field) is a separate call.
    const previous = flow.value.inputs ?? [];
    if (inputs.length === previous.length) {
      const renames = new Map<string, string>();
      for (let i = 0; i < inputs.length; i += 1) {
        const oldName = previous[i]?.name;
        const newName = inputs[i]?.name;
        if (oldName && newName && oldName !== newName) {
          renames.set(oldName, newName);
        }
      }
      if (renames.size > 0) cascadeInputRenames(renames);
    }
    flow.value.inputs = inputs;
  }

  /**
   * Rewrite every `parameterBindings[*].referencePath` whose root matches a
   * renamed workflow input. Applying the map in a single pass correctly
   * handles simultaneous renames (including a → b / b → a swaps) — each
   * binding is only ever rewritten from its original value.
   */
  function cascadeInputRenames(renames: Map<string, string>): void {
    for (const node of Object.values(flow.value.nodes)) {
      const config = node.config as { parameterBindings?: ParameterBinding[] } | undefined;
      if (config?.parameterBindings) {
        config.parameterBindings = config.parameterBindings.map((b) =>
          rewriteBindingPath(b, renames),
        );
      }
    }
  }

  function rewriteBindingPath(
    binding: ParameterBinding,
    renames: Map<string, string>,
  ): ParameterBinding {
    if (binding.kind !== 'reference' || !binding.referencePath) return binding;
    const parsed = parseContextPath(binding.referencePath);
    if (!parsed) return binding;
    const newRoot = renames.get(parsed.root);
    if (!newRoot) return binding;
    return { ...binding, referencePath: buildContextPath(newRoot, parsed.field) };
  }

  function getNode(nodeId: NodeId): Node | undefined {
    return flow.value.nodes[nodeId];
  }

  function getEdge(edgeId: EdgeId): Edge | undefined {
    return flow.value.edges[edgeId];
  }

  return {
    // State
    flow,

    // Getters
    nodes,
    edges,
    nodeCount,
    edgeCount,
    validationErrors,
    hasErrors,
    hasWarnings,
    isValid,

    // Actions
    loadFlow,
    reset,
    snapshot,
    restore,
    addNode,
    updateNode,
    removeNode,
    batchUpdateNodes,
    addEdge,
    updateEdge,
    removeEdge,
    setEntryPoint,
    setFlowInputs,
    getNode,
    getEdge,
  };
});
