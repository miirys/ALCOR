import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { isCatalogFlowUri } from '@gitlab-org/flow-builder/flow';
import {
  useExecutionStore,
  usePersistenceStore,
  useUIStore,
  useGraphStore,
  useSessionStore,
} from '../stores';
import type { EdgeId, Flow, FlowInputField, NodeId, Node } from '../types';
import type { MutationResult } from '../types/stores';
import { createNodeFromDefinition, validateNodeConfig } from '../utils';
import { validateAllBindings, type NodeBindingValidation } from '../utils/bindingValidation';
import {
  validateAllEdgeConditions,
  type EdgeConditionValidation,
} from '../utils/edgeConditionValidation';
import { generateEdgeId } from '../utils/id';
import { irNodesToVueFlowNodes } from '../adapters/VueFlowAdapter';

/**
 * Wraps a graph mutation to mark dirty on success.
 * This makes the side effect explicit and testable.
 */
function withDirtyTracking<TArgs extends unknown[], TResult extends MutationResult>(
  mutation: (...args: TArgs) => TResult,
  markDirty: () => void,
): (...args: TArgs) => TResult {
  return (...args: TArgs): TResult => {
    const result = mutation(...args);
    if (result.success) {
      markDirty();
    }
    return result;
  };
}

export function useFlow() {
  const graphStore = useGraphStore();
  const uiStore = useUIStore();
  const persistenceStore = usePersistenceStore();
  const executionStore = useExecutionStore();
  const sessionStore = useSessionStore();

  // ─────────────────────────────────────────────────────────────────
  // Destructure reactive refs from each store
  // ─────────────────────────────────────────────────────────────────

  const {
    flow,
    nodes,
    edges,
    nodeCount,
    edgeCount,
    validationErrors,
    hasErrors,
    hasWarnings,
    isValid,
  } = storeToRefs(graphStore);

  const { selectedElementId, selectedElement, panelOpen } = storeToRefs(uiStore);

  const {
    currentUri,
    currentSummary,
    isDirty,
    lastSavedAt,
    saveError,
    loadError,
    nodeTypeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    definitionsLoaded,
  } = storeToRefs(persistenceStore);

  const { sessionInfo, loading: sessionLoading, error: sessionError } = storeToRefs(sessionStore);

  const {
    isExecuting,
    events: executionEvents,
    status: executionStatus,
    error: executionError,
    trace: executionTrace,
    isPanelOpen: executionPanelOpen,
    context: executionContextData,
    executionContext,
  } = storeToRefs(executionStore);

  // ─────────────────────────────────────────────────────────────────
  // Derived State
  // ─────────────────────────────────────────────────────────────────

  const vueFlowNodes = computed(() =>
    irNodesToVueFlowNodes(nodes.value, nodeTypeDefinitions.value, flow.value),
  );

  const isCatalogFlow = computed(() => isCatalogFlowUri(currentUri.value));

  const executionContextReady = computed(() => executionContextData.value?.isReady ?? false);

  const flowInputs = computed(() => flow.value.inputs ?? []);
  // Binding validation — validates all tool node parameter bindings.
  // Re-runs on every reactive change to flow/definitions. The upstream cache
  // deduplicates graph traversals across nodes within a single pass (e.g. two
  // tool nodes sharing an ancestor only walk that subgraph once), but does not
  // persist across re-evaluations. Acceptable for current flow sizes.
  const bindingValidation = computed(() =>
    validateAllBindings(
      flow.value,
      nodeTypeDefinitions.value,
      toolDefinitions.value,
      runtimeProvidedVariableDefinitions.value,
    ),
  );

  const canExecute = computed(() => bindingValidation.value.canExecute);

  function getNodeValidation(nodeId: NodeId): NodeBindingValidation | undefined {
    return bindingValidation.value.nodeValidations.get(nodeId);
  }

  // Edge condition validation — advisory. Surfaces typos and references to
  // non-upstream nodes in routing conditions. Does NOT gate execution.
  const edgeConditionValidations = computed(() =>
    validateAllEdgeConditions(
      flow.value,
      nodeTypeDefinitions.value,
      toolDefinitions.value,
      runtimeProvidedVariableDefinitions.value,
    ),
  );

  const edgeConditionWarningsById = computed(() => {
    const map = new Map<EdgeId, EdgeConditionValidation>();
    for (const v of edgeConditionValidations.value) {
      if (v.status.state !== 'valid' && v.status.state !== 'no-condition') {
        map.set(v.edgeId, v);
      }
    }
    return map;
  });

  function getEdgeConditionWarning(edgeId: EdgeId): EdgeConditionValidation | undefined {
    return edgeConditionWarningsById.value.get(edgeId);
  }

  /**
   * Unified flow validation summary. Combines structural issues from
   * `validateFlow` with advisory edge condition warnings. Read by any
   * consumer that wants the full picture; does not affect save gating
   * (edge condition warnings are advisory per the design).
   */
  const flowValidationSummary = computed(() => ({
    structural: validationErrors.value,
    edgeConditions: Array.from(edgeConditionWarningsById.value.values()),
  }));

  // ─────────────────────────────────────────────────────────────────
  // Dirty Tracking Helper
  // ─────────────────────────────────────────────────────────────────

  const markDirty = (): void => {
    persistenceStore.markDirty();
  };

  // ─────────────────────────────────────────────────────────────────
  // Wrapped Mutations (with dirty tracking)
  // ─────────────────────────────────────────────────────────────────

  const trackedUpdateNode = withDirtyTracking(graphStore.updateNode, markDirty);
  const trackedBatchUpdateNodes = withDirtyTracking(graphStore.batchUpdateNodes, markDirty);
  const trackedAddEdge = withDirtyTracking(graphStore.addEdge, markDirty);
  const trackedUpdateEdge = withDirtyTracking(graphStore.updateEdge, markDirty);
  const trackedSetEntryPoint = withDirtyTracking(graphStore.setEntryPoint, markDirty);

  function setFlowInputs(inputs: FlowInputField[]): void {
    graphStore.setFlowInputs(inputs);
    markDirty();
  }

  // ─────────────────────────────────────────────────────────────────
  // Coordinated Actions
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a node with dirty tracking.
   * Uses definitions from persistence store for validation.
   */
  function addNode(node: Node): MutationResult {
    const validation = validateNodeConfig(node, nodeTypeDefinitions.value);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const result = graphStore.addNode(node);
    if (result.success) {
      markDirty();
    }
    return result;
  }

  /**
   * Create a node from a type definition.
   * Coordinates between graph store (data) and persistence store (definitions).
   */
  function createNode(type: string, position: { x: number; y: number }): MutationResult {
    const definition = nodeTypeDefinitions.value.find((d) => d.type === type);
    if (!definition) {
      return { success: false, errors: [`Unknown node type: ${type}`] };
    }

    const node = createNodeFromDefinition(definition, position);
    return addNode(node);
  }

  /**
   * Connect two nodes with a new edge.
   */
  function connectNodes(sourceId: NodeId, targetId: NodeId): MutationResult {
    const edge = {
      id: generateEdgeId(),
      source: sourceId,
      target: targetId,
    };
    return trackedAddEdge(edge);
  }

  /**
   * Remove a node and clean up selection if needed.
   */
  function removeNode(nodeId: NodeId): MutationResult {
    const result = graphStore.removeNode(nodeId);
    if (result.success) {
      markDirty();
      uiStore.unmarkCustomTool(nodeId);
      uiStore.validateSelection();
    }
    return result;
  }

  /**
   * Remove an edge and clean up selection if needed.
   */
  function removeEdge(edgeId: EdgeId): MutationResult {
    const result = graphStore.removeEdge(edgeId);
    if (result.success) {
      markDirty();
      uiStore.validateSelection();
    }
    return result;
  }

  /**
   * Load a flow and reset UI state.
   */
  function loadFlow(newFlow: Flow): void {
    graphStore.loadFlow(newFlow);
    uiStore.clearSelection();
    persistenceStore.markClean();
  }

  /**
   * Reset to empty flow.
   */
  function reset(): void {
    graphStore.reset();
    uiStore.clearSelection();
    persistenceStore.markClean();
  }

  /**
   * Save a flow and start execution
   */
  async function executeFlow(inputContext: Record<string, string>) {
    // Check binding validation before execution
    const validation = bindingValidation.value;
    if (!validation.canExecute) {
      executionStore.error = `Cannot execute: ${validation.totalErrors} binding error(s) found. Fix required parameters and broken references before running.`;
      executionStore.isPanelOpen = true;
      return {
        success: false,
        error: executionStore.error,
      };
    }

    // Save if dirty before executing
    if (isDirty.value) {
      const saveResult = await persistenceStore.saveToBackend();
      if (!saveResult.success) {
        const reason = saveResult.issues[0]?.message ?? 'unknown error';
        return { success: false, error: `Save failed: ${reason}` };
      }
    }

    return executionStore.startExecution(inputContext);
  }

  // ─────────────────────────────────────────────────────────────────
  // Return unified API
  // ─────────────────────────────────────────────────────────────────

  return {
    // === Graph State ===
    flow,
    nodes,
    edges,
    nodeCount,
    edgeCount,
    validationErrors,
    hasErrors,
    hasWarnings,
    isValid,

    // === UI State ===
    selectedElementId,
    selectedElement,

    // === Persistence State ===
    currentUri,
    currentSummary,
    isDirty,
    lastSavedAt,
    saveError,
    loadError,
    nodeTypeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    definitionsLoaded,

    // === Session State ===
    sessionInfo,
    sessionLoading,
    sessionError,
    fetchSessionInfo: sessionStore.fetchSessionInfo,

    // === Execution State ===
    isExecuting,
    executionEvents,
    executionStatus,
    executionError,
    executionTrace,
    executionPanelOpen,
    executionContext,
    executionContextReady,

    // === Derived ===
    vueFlowNodes,
    isCatalogFlow,
    flowInputs,
    bindingValidation,
    canExecute,
    getNodeValidation,
    edgeConditionValidations,
    edgeConditionWarningsById,
    getEdgeConditionWarning,
    flowValidationSummary,

    // === Custom Tool Tracking ===
    isCustomToolNode: uiStore.isCustomToolNode,

    // === Node Operations ===
    addNode,
    updateNode: trackedUpdateNode,
    removeNode,
    batchUpdateNodes: trackedBatchUpdateNodes,
    getNode: graphStore.getNode,
    createNode,

    // === Edge Operations ===
    addEdge: trackedAddEdge,
    updateEdge: trackedUpdateEdge,
    removeEdge,
    getEdge: graphStore.getEdge,
    connectNodes,

    // === Entry Point ===
    setEntryPoint: trackedSetEntryPoint,

    // === Flow Inputs ===
    setFlowInputs,

    // === UI State ===
    panelOpen,
    select: uiStore.select,
    openPanel: uiStore.openPanel,
    closePanel: uiStore.closePanel,

    // === Flow Management ===
    loadFlow,
    reset,

    // === Persistence Actions ===
    saveToBackend: persistenceStore.saveToBackend,
    loadFromBackend: persistenceStore.loadFromBackend,
    setCurrentUri: persistenceStore.setCurrentUri,

    // === Execution Actions ===
    executeFlow,
    cancelExecution: executionStore.stopExecution,
    resetExecution: executionStore.clear,
    toggleExecutionPanel: executionStore.togglePanel,
    fetchExecutionContext: executionStore.fetchContext,
  };
}
