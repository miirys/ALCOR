import {
  toComponentName,
  RUNTIME_PROVIDED_VARIABLE_DEFINITIONS,
} from '@gitlab-org/flow-builder/flow';
import type { Flow, FlowId, Edge, Node, NodeId, EdgeId } from '../types';
import { parseContextPath } from './contextPath';
import { canReach, getDownstreamNodes } from './graph';

export { toComponentName };

function getNodes(flow: Flow): Node[] {
  return Object.values(flow.nodes);
}

function getEdges(flow: Flow): Edge[] {
  return Object.values(flow.edges);
}

export function getNode(flow: Flow, nodeId: NodeId): Node | undefined {
  return flow.nodes[nodeId];
}

export function getEdge(flow: Flow, edgeId: EdgeId): Edge | undefined {
  return flow.edges[edgeId];
}

/**
 * Check if adding an edge from sourceId to targetId would create a cycle.
 *
 * A cycle would be created if there's already a path from targetId back to sourceId,
 * because adding sourceId → targetId would complete the loop.
 *
 * @param flow - The flow graph to check
 * @param sourceId - The proposed source node of the new edge
 * @param targetId - The proposed target node of the new edge
 * @returns true if adding this edge would create a cycle, false otherwise
 */
function wouldCreateCycle(flow: Flow, sourceId: string, targetId: string): boolean {
  // Check if there's already a path from target to source
  // If yes, adding source -> target would create a cycle
  return canReach(flow, targetId as NodeId, sourceId as NodeId);
}

/**
 * Get all nodes that are reachable from the entry point.
 *
 * This includes the entry point itself and all nodes that can be reached
 * by following edges from the entry point.
 *
 * @param flow - The flow graph to traverse
 * @returns Set of node IDs reachable from the entry point (empty if no entry point)
 */
function getReachableNodes(flow: Flow): Set<string> {
  const { entryPoint } = flow;
  if (!entryPoint || !flow.nodes[entryPoint]) {
    return new Set();
  }

  // Get all downstream nodes from the entry point
  const downstream = getDownstreamNodes(flow, entryPoint);

  // Include the entry point itself
  const reachable = new Set<string>([entryPoint, ...downstream]);

  return reachable;
}

/**
 * Validate that the flow is well-formed
 */
export interface FlowValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export function validateFlow(flow: Flow): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  const nodes = getNodes(flow);
  const edges = getEdges(flow);

  // Check entry point exists
  if (flow.entryPoint && !flow.nodes[flow.entryPoint]) {
    errors.push({
      type: 'error',
      message: `Entry point "${flow.entryPoint}" does not exist`,
    });
  }

  // Check for unreachable nodes
  const reachable = getReachableNodes(flow);
  for (const node of nodes) {
    if (!reachable.has(node.id) && flow.entryPoint) {
      errors.push({
        type: 'warning',
        message: `Node "${node.id}" is not reachable from entry point`,
        nodeId: node.id,
      });
    }
  }

  // Check edges reference valid nodes
  for (const edge of edges) {
    if (!flow.nodes[edge.source]) {
      errors.push({
        type: 'error',
        message: `Edge "${edge.id}" references non-existent source node "${edge.source}"`,
        edgeId: edge.id,
      });
    }

    if (!flow.nodes[edge.target]) {
      errors.push({
        type: 'error',
        message: `Edge "${edge.id}" references non-existent target node "${edge.target}"`,
        edgeId: edge.id,
      });
    }
  }

  // Check Node Names (Labels) - component name derivation & uniqueness
  const componentNameMap = new Map<string, { id: NodeId; label: string }[]>();

  for (const node of nodes) {
    const derived = toComponentName(node.label);

    // Ensure label produces a non-empty component name
    if (derived === '') {
      errors.push({
        type: 'error',
        message: `Node name "${node.label}" must produce a valid component name (letters, numbers, or underscores)`,
        nodeId: node.id,
      });
    } else {
      // Group by derived component name for collision check
      if (!componentNameMap.has(derived)) {
        componentNameMap.set(derived, []);
      }
      componentNameMap.get(derived)?.push({ id: node.id, label: node.label });
    }
  }

  // Report component name collisions
  for (const [derived, entries] of componentNameMap) {
    if (entries.length > 1) {
      const labels = entries.map((e) => `"${e.label}"`).join(', ');
      for (const entry of entries) {
        errors.push({
          type: 'error',
          message: `${labels} all derive to "${derived}"`,
          nodeId: entry.id,
        });
      }
    }
  }

  // Check for duplicate node IDs (shouldn't happen with record, but good to verify)
  const nodeIds = nodes.map((n) => n.id);
  const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
  for (const id of duplicateIds) {
    errors.push({
      type: 'error',
      message: `Duplicate node ID: "${id}"`,
      nodeId: id,
    });
  }

  // Validate flow inputs when present
  if (flow.inputs) {
    const inputNames = new Set<string>();
    for (const input of flow.inputs) {
      if (!input.name || input.name.trim() === '') {
        errors.push({
          type: 'error',
          message: 'Flow input name cannot be empty',
        });
      } else {
        if (!/^[a-zA-Z0-9_]+$/.test(input.name)) {
          errors.push({
            type: 'error',
            message: `Flow input name "${input.name}" must contain only letters, numbers, and underscores`,
          });
        }

        if (inputNames.has(input.name)) {
          errors.push({
            type: 'error',
            message: `Duplicate flow input name: "${input.name}"`,
          });
        }
        inputNames.add(input.name);
      }
    }
  }

  return errors;
}

export function createEmptyFlow(): Flow {
  return {
    id: 'default' as FlowId,
    entryPoint: null,
    edges: {},
    nodes: {},
    inputs: [],
  };
}

export type FlowValidationResult = {
  valid: boolean;
  errors?: string[];
};

export function validateAddEdge(flow: Flow, edge: Edge): FlowValidationResult {
  // Edge already exists
  if (flow.edges[edge.id]) {
    return { valid: false, errors: [`Edge with ID "${edge.id}" already exists`] };
  }

  // Nodes must exist
  const sourceNode = flow.nodes[edge.source];
  const targetNode = flow.nodes[edge.target];

  if (!sourceNode) {
    return { valid: false, errors: [`Source node "${edge.source}" not found`] };
  }

  if (!targetNode) {
    return { valid: false, errors: [`Target node "${edge.target}" not found`] };
  }

  // Prevent self-loops
  if (edge.source === edge.target) {
    return { valid: false, errors: ['Cannot connect a node to itself'] };
  }

  // Check for cycles
  if (wouldCreateCycle(flow, edge.source, edge.target)) {
    return { valid: false, errors: ['Connection would create a cycle'] };
  }

  return { valid: true };
}

export function getOrphanedEdges(flow: Flow, nodeId: NodeId): EdgeId[] {
  return Object.values(flow.edges)
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => edge.id);
}

// ============================================================================
// Context Input Detection
// ============================================================================

/**
 * Represents a required context input for flow execution
 */
export interface RequiredContextInput {
  /** The variable name (e.g., "goal", "project_id") */
  name: string;
  /** Human-readable label */
  label: string;
  /** Whether this is typically multi-line content */
  multiline: boolean;
  /** Placeholder text for the input */
  placeholder: string;
}

/**
 * Returns the effective flow inputs for the Execution Console.
 *
 * Uses declared `flow.inputs` as the primary source (preserving metadata like
 * description and format). Additionally scans node parameterBindings to discover
 * any undeclared context references, which are appended with default metadata.
 */
export function getEffectiveFlowInputs(flow: Flow): RequiredContextInput[] {
  if (!flow.inputs) return [];

  // Start with declared inputs — preserves description, multiline, etc.
  const result = new Map<string, RequiredContextInput>();
  for (const field of flow.inputs) {
    result.set(field.name, {
      name: field.name,
      label: field.description || formatPropertyLabel(field.name),
      multiline: field.format === 'multiline',
      placeholder: getInputPlaceholder(field.name),
    });
  }

  // Discover undeclared context references from parameterBindings.
  // Binding referencePaths use ID-based paths (e.g. "context:{nodeId}.field"),
  // so we only need to check against node IDs, not labels.
  const nodes = Object.values(flow.nodes);
  const nodeIds = new Set<string>(nodes.map((n) => n.id));
  const runtimeRoots = new Set(
    RUNTIME_PROVIDED_VARIABLE_DEFINITIONS.map((d) => d.key.split('.')[0]),
  );

  for (const node of nodes) {
    const config = node.config as
      | { parameterBindings?: { kind: string; referencePath?: string }[] }
      | undefined;

    for (const binding of config?.parameterBindings ?? []) {
      if (binding.kind === 'reference' && binding.referencePath) {
        const ref = parseContextPath(binding.referencePath);
        if (ref && !result.has(ref.root) && !nodeIds.has(ref.root) && !runtimeRoots.has(ref.root)) {
          result.set(ref.root, {
            name: ref.root,
            label: formatPropertyLabel(ref.root),
            multiline: false,
            placeholder: getInputPlaceholder(ref.root),
          });
        }
      }
    }
  }

  return Array.from(result.values());
}

/**
 * Converts a snake_case or camelCase variable name to a human-readable label.
 * e.g. "file_path" → "File Path", "fileName" → "File Name"
 */
export function formatPropertyLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Returns appropriate placeholder text for a context input
 */
function getInputPlaceholder(name: string): string {
  const placeholders: Record<string, string> = {
    goal: 'Describe what you want the agent to accomplish...',
    task: 'Describe the task to perform...',
    project_id: 'e.g., 12345 or gitlab-org/gitlab',
    namespace_id: 'e.g., 67890 or gitlab-org',
    file_path: 'e.g., src/main.ts',
    branch: 'e.g., main or feature/my-branch',
    mr_iid: 'e.g., 123',
    issue_iid: 'e.g., 456',
    url: 'e.g., https://gitlab.com/...',
  };

  const lowerName = name.toLowerCase();

  // Check for exact match
  if (placeholders[lowerName]) {
    return placeholders[lowerName];
  }

  // Check for partial matches
  for (const [key, placeholder] of Object.entries(placeholders)) {
    if (lowerName.includes(key)) {
      return placeholder;
    }
  }

  // Default placeholder
  return `Enter ${formatPropertyLabel(name).toLowerCase()}...`;
}

/**
 * Validates that all required context inputs have values
 */
export function validateContextInputs(
  required: RequiredContextInput[],
  provided: Record<string, string>,
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const input of required) {
    const value = provided[input.name];
    if (!value || value.trim() === '') {
      missing.push(input.label);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
