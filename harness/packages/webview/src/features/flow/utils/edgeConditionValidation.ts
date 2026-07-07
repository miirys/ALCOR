import type {
  Edge,
  EdgeId,
  Flow,
  NodeId,
  NodeTypeDefinition,
  RuntimeProvidedVariableDefinition,
  ToolDefinition,
} from '../types';
import { parseContextPath, parseReferencePath } from './contextPath';
import { buildAvailableOutputs, type UpstreamCache } from './outputCatalog';
import { getUpstreamNodes } from './graph';

export type EdgeConditionStatus =
  | { state: 'valid' }
  | { state: 'no-condition' }
  | { state: 'malformed'; reason: string }
  | { state: 'unknown-root'; root: string; suggestion?: string }
  | { state: 'invalid-format'; raw: string };

export interface EdgeConditionValidation {
  edgeId: EdgeId;
  status: EdgeConditionStatus;
  /** Human-readable message; null when state is 'valid' or 'no-condition'. */
  message: string | null;
}

interface ParsedEdgeCondition {
  input?: unknown;
  value?: unknown;
  routes?: unknown;
}

/**
 * Validate every conditional edge in the flow. Returns one entry per edge —
 * unconditional edges report state: 'no-condition' (callers can filter).
 */
export function validateAllEdgeConditions(
  flow: Flow,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
): EdgeConditionValidation[] {
  const upstreamCache: UpstreamCache = new Map();
  return Object.values(flow.edges).map((edge) =>
    validateEdgeCondition(
      flow,
      edge,
      nodeDefinitions,
      toolDefinitions,
      runtimeProvidedVariableDefinitions,
      upstreamCache,
    ),
  );
}

export function validateEdgeCondition(
  flow: Flow,
  edge: Edge,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
  upstreamCache?: UpstreamCache,
): EdgeConditionValidation {
  if (!edge.condition) {
    return { edgeId: edge.id, status: { state: 'no-condition' }, message: null };
  }

  const parsed = safeParseCondition(edge.condition);
  if (!parsed) {
    return {
      edgeId: edge.id,
      status: { state: 'malformed', reason: 'Condition is not valid JSON' },
      message: 'Routing condition could not be parsed',
    };
  }

  const input = typeof parsed.input === 'string' ? parsed.input.trim() : '';
  return validateConditionInput(
    edge.id,
    edge.source,
    input,
    flow,
    nodeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    upstreamCache,
  );
}

/**
 * Validate a raw condition-input string against the source node's reachable
 * variables. Useful for real-time UI feedback before a condition is persisted.
 */
export function validateConditionInput(
  edgeId: EdgeId,
  sourceNodeId: NodeId,
  input: string,
  flow: Flow,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
  upstreamCache?: UpstreamCache,
): EdgeConditionValidation {
  const trimmed = input.trim();
  if (!trimmed) {
    return { edgeId, status: { state: 'valid' }, message: null };
  }

  const parsed = parseReferencePath(trimmed);
  if (!parsed) {
    return {
      edgeId,
      status: { state: 'invalid-format', raw: trimmed },
      message: `"${trimmed}" must start with "context:" or "status:"`,
    };
  }

  const { root } = parsed;
  const knownRoots = collectKnownRoots(
    flow,
    sourceNodeId,
    nodeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    upstreamCache,
  );

  if (knownRoots.ids.has(root) || knownRoots.labels.has(root) || knownRoots.variables.has(root)) {
    return { edgeId, status: { state: 'valid' }, message: null };
  }

  const suggestion = nearestSuggestion(root, [...knownRoots.labels, ...knownRoots.variables]);

  const sourceLabel = flow.nodes[sourceNodeId]?.label ?? 'this edge';
  const message = suggestion
    ? `"${root}" is not reachable from ${sourceLabel} — did you mean "${suggestion}"?`
    : `"${root}" is not a known upstream node or workflow input for ${sourceLabel}`;

  return {
    edgeId,
    status: { state: 'unknown-root', root, suggestion },
    message,
  };
}

function safeParseCondition(raw: string): ParsedEdgeCondition | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ParsedEdgeCondition) : null;
  } catch {
    return null;
  }
}

interface KnownRoots {
  ids: Set<string>;
  labels: Set<string>;
  variables: Set<string>;
}

function collectKnownRoots(
  flow: Flow,
  sourceNodeId: NodeId,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
  upstreamCache?: UpstreamCache,
): KnownRoots {
  const ids = new Set<string>();
  const labels = new Set<string>();
  const variables = new Set<string>();

  const upstreamIds = upstreamCache?.get(sourceNodeId) ?? getUpstreamNodes(flow, sourceNodeId);
  upstreamCache?.set(sourceNodeId, upstreamIds);

  // The edge's source node itself can be referenced (condition is evaluated at source).
  ids.add(sourceNodeId);
  const sourceLabel = flow.nodes[sourceNodeId]?.label;
  if (sourceLabel) labels.add(sourceLabel);

  for (const upstreamId of upstreamIds) {
    ids.add(upstreamId);
    const upstreamLabel = flow.nodes[upstreamId]?.label;
    if (upstreamLabel) labels.add(upstreamLabel);
  }

  // Workflow inputs and runtime variables — but only when the source is reachable from START.
  const outputs = buildAvailableOutputs(
    flow,
    sourceNodeId,
    nodeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    upstreamCache,
  );
  for (const out of outputs) {
    if (out.sourceNodeType === 'workflow') {
      const parsed = parseContextPath(out.path);
      if (parsed) variables.add(parsed.root);
    }
  }

  return { ids, labels, variables };
}

/**
 * Suggest the closest candidate within edit-distance 2.
 * Returns undefined when no candidate is close enough or several tie.
 */
function nearestSuggestion(target: string, candidates: string[]): string | undefined {
  const MAX_DISTANCE = 2;
  let best: { value: string; distance: number } | null = null;
  let tied = false;

  for (const candidate of candidates) {
    if (candidate !== target) {
      const distance = levenshtein(target.toLowerCase(), candidate.toLowerCase());
      if (distance <= MAX_DISTANCE) {
        if (!best || distance < best.distance) {
          best = { value: candidate, distance };
          tied = false;
        } else if (distance === best.distance) {
          tied = true;
        }
      }
    }
  }

  return best && !tied ? best.value : undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current.slice();
  }

  return previous[b.length];
}
