import type { JSONSchema7 } from 'json-schema';
import type {
  Flow,
  Node,
  NodeId,
  NodeTypeDefinition,
  RuntimeProvidedVariableDefinition,
  ToolDefinition,
} from '../types';
import { buildContextPath } from './contextPath';
import { getUpstreamNodes } from './graph';
import { formatPropertyLabel } from './flow';

/**
 * A single available output that can be wired as an input reference.
 */
export interface AvailableOutput {
  /**
   * Stable context path using node ID (e.g. "context:abc-123.final_answer").
   * This is what gets stored in ParameterBinding.referencePath.
   * Survives node renames. Workflow context vars use names (e.g. "context:goal").
   */
  path: string;

  /**
   * Human-readable context path using node label (e.g. "context:analyzer.final_answer").
   * For display only — never stored. For workflow context vars, same as path.
   */
  displayPath: string;

  /** Human-readable label (e.g. "Analyzer → Final Answer") */
  label: string;

  /** The node this output comes from */
  sourceNodeId: NodeId;
  sourceNodeLabel: string;

  /** JSON Schema type of this output (for type-compatibility checking) */
  schemaType: string | string[] | undefined;

  /** Description from the schema, if available */
  description?: string;

  /** The node type (e.g. 'agent', 'tool', 'ai-task') or 'workflow' for context vars */
  sourceNodeType: string;

  /** For runtime-provided variables: whether the runtime guarantees the value is present */
  availability?: 'always' | 'conditional';
}

/**
 * Cache for upstream node lookups, scoped to a single validation pass.
 * Created by `validateAllBindings` and passed through to avoid redundant
 * graph traversals when validating multiple nodes in the same flow.
 */
export type UpstreamCache = Map<NodeId, Set<NodeId>>;

/**
 * Builds the complete catalog of outputs available to a given node.
 *
 * Includes:
 * 1. Outputs from all upstream nodes (reachable via edges)
 * 2. Workflow-level context variables (context:goal, etc.) — only when the
 *    entry point is upstream, meaning this node is reachable from the start.
 *
 * Does NOT include outputs from the node itself or downstream nodes.
 *
 * @param upstreamCache - Optional cache to avoid redundant graph traversals
 *   when calling this function for multiple nodes in the same flow.
 */
export function buildAvailableOutputs(
  flow: Flow,
  targetNodeId: NodeId,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
  upstreamCache?: UpstreamCache,
): AvailableOutput[] {
  const outputs: AvailableOutput[] = [];

  let upstreamIds = upstreamCache?.get(targetNodeId);
  if (!upstreamIds) {
    upstreamIds = getUpstreamNodes(flow, targetNodeId);
    upstreamCache?.set(targetNodeId, upstreamIds);
  }

  for (const upstreamId of upstreamIds) {
    const node = flow.nodes[upstreamId];
    if (node) {
      const nodeOutputs = getNodeOutputPaths(node, nodeDefinitions, toolDefinitions);
      for (const output of nodeOutputs) {
        outputs.push({
          path: buildContextPath(upstreamId, output.key),
          displayPath: buildContextPath(node.label, output.key),
          label: `${node.label} → ${output.label}`,
          sourceNodeId: upstreamId,
          sourceNodeLabel: node.label,
          schemaType: output.type,
          description: output.description,
          sourceNodeType: node.type,
        });
      }
    }
  }

  // Workflow-level context variables are available when the node is reachable
  // from START — either it IS the entry point, or the entry point is upstream.
  const entryPointIsUpstream =
    flow.entryPoint !== null &&
    (flow.entryPoint === targetNodeId || upstreamIds.has(flow.entryPoint));

  if (entryPointIsUpstream) {
    const seen = new Set<string>();

    // Surface explicitly defined flow inputs first
    for (const input of flow.inputs ?? []) {
      if (input.name) {
        seen.add(input.name);
        outputs.push({
          path: buildContextPath(input.name, undefined),
          displayPath: buildContextPath(input.name, undefined),
          label: formatPropertyLabel(input.name),
          sourceNodeId: '' as NodeId,
          sourceNodeLabel: '(workflow input)',
          schemaType: input.type || 'string',
          description: input.description || `Workflow input: ${input.name}`,
          sourceNodeType: 'workflow',
        });
      }
    }

    // Surface runtime-provided context variables (grouped by availability in the UI)
    for (const def of runtimeProvidedVariableDefinitions) {
      const dotIndex = def.key.indexOf('.');
      const root = dotIndex === -1 ? def.key : def.key.slice(0, dotIndex);
      const subkey = dotIndex === -1 ? undefined : def.key.slice(dotIndex + 1);

      // Skip if a user-defined flow input already uses this top-level name
      if (!seen.has(root)) {
        const path = buildContextPath(root, subkey);
        outputs.push({
          path,
          displayPath: path,
          label: def.label,
          sourceNodeId: '' as NodeId,
          sourceNodeLabel: '(runtime)',
          schemaType: def.type,
          description: def.description,
          sourceNodeType: 'workflow',
          availability: def.availability,
        });
      }
    }
  }

  return outputs;
}

/**
 * Extract typed output paths from a node based on its type and config.
 */
function getNodeOutputPaths(
  node: Node,
  nodeDefinitions: NodeTypeDefinition[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _toolDefinitions: ToolDefinition[],
): { key: string; label: string; type: string | undefined; description?: string }[] {
  // TODO: Use tool-specific outputSchema for granular field wiring once the
  // backend DeterministicStepComponent exposes individual tool output fields
  // in state. Currently it collapses everything into `tool_responses` (string).
  // See: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/work_items/2204

  // For tool nodes, check the tool's outputSchema
  // if (node.type === 'tool') {
  //   const config = node.config as { toolName?: string } | undefined;
  //   const toolName = config?.toolName;
  //   if (toolName) {
  //     const tool = toolDefinitions.find((t) => t.name === toolName);
  //     if (tool?.outputSchema) {
  //       return extractSchemaProperties(tool.outputSchema);
  //     }
  //   }
  // }

  const definition = nodeDefinitions.find((d) => d.type === node.type);
  if (definition?.outputSchema) {
    return extractSchemaProperties(definition.outputSchema);
  }

  // Generic fallback: all nodes produce at least a final_answer
  return [
    {
      key: 'final_answer',
      label: 'Final Answer',
      type: 'string',
      description: 'The primary output of this node',
    },
  ];
}

function extractSchemaProperties(
  schema: JSONSchema7,
): { key: string; label: string; type: string | undefined; description?: string }[] {
  if (schema.type !== 'object' || !schema.properties) return [];

  return Object.entries(schema.properties as Record<string, JSONSchema7>).map(
    ([key, propSchema]) => ({
      key,
      label: formatPropertyLabel(key),
      type: typeof propSchema.type === 'string' ? propSchema.type : undefined,
      description: propSchema.description,
    }),
  );
}
