import type { JSONSchema7 } from 'json-schema';
import type {
  Flow,
  Node,
  NodeId,
  NodeTypeDefinition,
  ParameterBinding,
  BindingStatus,
  RuntimeProvidedVariableDefinition,
  ToolDefinition,
  AgentNodeConfig,
} from '../types';
import { parseContextPath } from './contextPath';
import { buildAvailableOutputs, type AvailableOutput, type UpstreamCache } from './outputCatalog';
import { checkTypeCompatibility } from './typeCompat';
import { extractPromptVariables, buildPromptInputSchema } from './promptSchema';

export interface ParameterValidation {
  parameter: string;
  status: BindingStatus;
  required: boolean;
  binding: ParameterBinding | null;
}

export interface NodeBindingValidation {
  nodeId: NodeId;
  parameters: ParameterValidation[];
  hasErrors: boolean;
  hasWarnings: boolean;
  errorCount: number;
  warningCount: number;
}

/**
 * Validate all parameter bindings for a single tool node.
 *
 * 1. Resolves the tool's input schema
 * 2. Checks each required parameter has a valid binding
 * 3. Checks each reference binding points to a reachable upstream output
 * 4. Checks type compatibility between source and target
 */
export function validateNodeBindings(
  flow: Flow,
  node: Node,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
  upstreamCache?: UpstreamCache,
): NodeBindingValidation {
  const config = node.config as
    | { toolName?: string; parameterBindings?: ParameterBinding[] }
    | undefined;
  const toolName = config?.toolName;
  const bindings = config?.parameterBindings ?? [];

  const tool = toolName ? toolDefinitions.find((t) => t.name === toolName) : null;
  const inputSchema =
    tool?.inputSchema ??
    resolveAgentInputSchema(node) ??
    nodeDefinitions.find((d) => d.type === node.type)?.inputSchema;

  if (!inputSchema || inputSchema.type !== 'object' || !inputSchema.properties) {
    return {
      nodeId: node.id,
      parameters: [],
      hasErrors: false,
      hasWarnings: false,
      errorCount: 0,
      warningCount: 0,
    };
  }

  const properties = inputSchema.properties as Record<string, JSONSchema7>;
  const requiredSet = new Set(inputSchema.required ?? []);

  const availableOutputs = buildAvailableOutputs(
    flow,
    node.id,
    nodeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    upstreamCache,
  );
  const outputsByPath = new Map(availableOutputs.map((o) => [o.path, o]));

  const parameters: ParameterValidation[] = Object.entries(properties).map(
    ([paramName, paramSchema]) => {
      const isRequired = requiredSet.has(paramName);
      const binding = bindings.find((b) => b.parameter === paramName) ?? null;

      const status = validateSingleBinding(binding, paramSchema, isRequired, outputsByPath, flow);

      return { parameter: paramName, status, required: isRequired, binding };
    },
  );

  // Check for stale bindings that don't match any schema property
  for (const binding of bindings) {
    if (!properties[binding.parameter]) {
      parameters.push({
        parameter: binding.parameter,
        status: {
          state: 'warning',
          message: `Parameter "${binding.parameter}" does not exist on this node`,
        },
        required: false,
        binding,
      });
    }
  }

  const errorCount = parameters.filter(
    (p) =>
      (p.status.state === 'broken' && p.required) || (p.status.state === 'unbound' && p.required),
  ).length;

  const warningCount = parameters.filter(
    (p) =>
      p.status.state === 'type-mismatch' ||
      (p.status.state === 'broken' && !p.required) ||
      p.status.state === 'warning',
  ).length;

  return {
    nodeId: node.id,
    parameters,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    errorCount,
    warningCount,
  };
}

function validateSingleBinding(
  binding: ParameterBinding | null,
  schema: JSONSchema7,
  required: boolean,
  availableOutputs: Map<string, AvailableOutput>,
  flow: Flow,
): BindingStatus {
  if (!binding || binding.kind === 'unbound') {
    return { state: 'unbound', required };
  }

  if (binding.kind === 'literal') {
    return { state: 'valid' };
  }

  if (binding.kind === 'reference') {
    const ref = binding.referencePath;
    if (!ref) {
      return { state: 'unbound', required };
    }

    const output = availableOutputs.get(ref);

    if (!output) {
      return {
        state: 'broken',
        reason: resolveBreakReason(ref, flow),
        originalRef: ref,
      };
    }

    const compat = checkTypeCompatibility(
      typeof schema.type === 'string' ? schema.type : undefined,
      output.schemaType,
    );

    if (compat === 'incompatible') {
      return {
        state: 'type-mismatch',
        expected: String(schema.type ?? 'unknown'),
        actual: String(output.schemaType ?? 'unknown'),
        ref,
      };
    }

    if (compat === 'coercible') {
      return {
        state: 'warning',
        message: `Type coercion: ${output.schemaType} → ${schema.type}`,
      };
    }

    return { state: 'valid' };
  }

  return { state: 'valid' };
}

function resolveBreakReason(ref: string, flow: Flow): string {
  const parsed = parseContextPath(ref);
  if (!parsed) return 'Invalid reference format';

  // Reference paths use node IDs internally
  const matchingNode = flow.nodes[parsed.root as NodeId];

  if (!matchingNode) {
    return `Referenced node no longer exists in this workflow`;
  }

  return `Node "${matchingNode.label}" exists but is not connected upstream of this node`;
}

/**
 * Dynamically resolve an input schema for agent nodes.
 *
 * - Local mode: extracts `{{variable}}` names from the prompt template.
 * - Remote mode: uses the user-defined `dynamicInputParams` list.
 *
 * Returns null when no variables are found or the node is not an agent.
 */
export function resolveAgentInputSchema(node: Node): JSONSchema7 | null {
  if (node.type !== 'agent') return null;

  const agentConfig = node.config as AgentNodeConfig | undefined;
  if (!agentConfig) return null;

  if (agentConfig.promptMode === 'local' && agentConfig.localPrompt) {
    const variables = extractPromptVariables(agentConfig.localPrompt);
    return buildPromptInputSchema(variables);
  }

  if (agentConfig.promptMode === 'remote' && agentConfig.dynamicInputParams?.length) {
    return buildPromptInputSchema(agentConfig.dynamicInputParams);
  }

  return null;
}

/**
 * Validate the entire flow's bindings. Used for execute gating.
 */
export function validateAllBindings(
  flow: Flow,
  nodeDefinitions: NodeTypeDefinition[],
  toolDefinitions: ToolDefinition[],
  runtimeProvidedVariableDefinitions: RuntimeProvidedVariableDefinition[],
): {
  nodeValidations: Map<NodeId, NodeBindingValidation>;
  canExecute: boolean;
  totalErrors: number;
  totalWarnings: number;
} {
  const nodeValidations = new Map<NodeId, NodeBindingValidation>();
  const upstreamCache: UpstreamCache = new Map();
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const node of Object.values(flow.nodes)) {
    if (node.type === 'tool' || node.type === 'ai-task' || node.type === 'agent') {
      const validation = validateNodeBindings(
        flow,
        node,
        nodeDefinitions,
        toolDefinitions,
        runtimeProvidedVariableDefinitions,
        upstreamCache,
      );
      nodeValidations.set(node.id, validation);
      totalErrors += validation.errorCount;
      totalWarnings += validation.warningCount;
    }
  }

  return {
    nodeValidations,
    canExecute: totalErrors === 0,
    totalErrors,
    totalWarnings,
  };
}
