import type { JSONSchema7 } from 'json-schema';
import type { Branded } from '@gitlab-org/core';

export type FlowId = Branded<string, 'FlowId'>;
export type NodeId = Branded<string, 'NodeId'>;
export type EdgeId = Branded<string, 'EdgeId'>;

export type Position = {
  x: number;
  y: number;
};

export interface NodeInput {
  from: string;
  as?: string;
  literal?: boolean;
  optional?: boolean;
}

export interface FlowInputField {
  name: string;
  type: string;
  format?: string;
  description?: string;
  /** V1 input category (e.g. 'flow_input', 'agent_platform_standard_context'). */
  category?: string;
}

export interface BaseNodeConfig {
  inputs?: NodeInput[];
  uiLogEvents?: string[];
  uiRoleAs?: 'agent' | 'tool';
}

export type InlinePromptDefinition = {
  name: string;
  promptTemplate: {
    system: string;
    user: string;
  };
  params?: {
    timeout?: number;
    stop?: string[];
    vertexLocation?: string;
  };
};

export interface AgentNodeConfig extends BaseNodeConfig {
  promptMode?: 'local' | 'remote';
  promptId?: string;
  promptVersion?: string;
  localPrompt?: InlinePromptDefinition;
  toolset?: string[];
  parameterBindings?: ParameterBinding[];
  /** For remote prompts: user-defined input parameter names (UI-only, not persisted in V1) */
  dynamicInputParams?: string[];
}

/**
 * How a parameter gets its value at runtime.
 *
 * - 'literal': User-authored scalar value, embedded directly.
 * - 'reference': Bound to an upstream node's output path (e.g. context:analyzer.findings).
 * - 'unbound': No value configured yet. Required fields in this state block execution.
 */
export type BindingKind = 'literal' | 'reference' | 'unbound';

/**
 * Validation state for a single parameter binding.
 * Computed reactively — never persisted.
 */
export type BindingStatus =
  | { state: 'valid' }
  | { state: 'unbound'; required: boolean }
  | { state: 'broken'; reason: string; originalRef: string }
  | { state: 'type-mismatch'; expected: string; actual: string; ref: string }
  | { state: 'warning'; message: string };

/**
 * A single parameter's configured value source.
 *
 * This replaces NodeInput for nodes with known schemas (tool, ai-task,
 * and agent nodes with local/dynamic prompt variables).
 */
export interface ParameterBinding {
  /** The tool's input parameter name (e.g. "file_path") — matches schema key */
  parameter: string;

  /** How the value is sourced */
  kind: BindingKind;

  /**
   * For kind='literal': the authored value.
   * Typed as unknown because it could be string, number, boolean,
   * or a structured object/array for complex parameters.
   */
  literalValue?: unknown;

  /**
   * For kind='reference': the context path using internal node IDs.
   * e.g. "context:{nodeId}.final_answer" or "context:goal"
   *
   * Node-output paths use the stable node UUID (survives renames).
   * Workflow-level context vars use their name directly (e.g. "context:goal").
   * Translated to label-based paths only at V1 persistence boundary.
   */
  referencePath?: string;

  /** When true, this parameter is not required for execution. */
  optional?: boolean;
}

export interface ToolNodeConfig extends BaseNodeConfig {
  toolName: string;
  toolset?: string[];

  /**
   * Schema-driven parameter bindings.
   * Each entry maps a tool input parameter to its value source.
   * Present when the tool has a known inputSchema; coexists with
   * legacy `inputs` for backward compatibility during migration.
   */
  parameterBindings?: ParameterBinding[];
}

export interface AiTaskNodeConfig extends BaseNodeConfig {
  promptMode?: 'local' | 'remote';
  promptId?: string;
  promptVersion?: string;
  localPrompt?: InlinePromptDefinition;
  toolset: string[];
  maxCorrectionAttempts?: number;
  parameterBindings?: ParameterBinding[];
}

export type NodeConfig =
  | AgentNodeConfig
  | ToolNodeConfig
  | AiTaskNodeConfig
  | Record<string, unknown>;

export type Node = {
  id: NodeId;
  label: string;
  type: string;
  position: Position;
  config?: NodeConfig;
  /** Original V1 component name, preserved on load for stable external selectors. */
  sourceComponentName?: string;
};

export type Edge = {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  label?: string;
  condition?: string;
};

export interface FlowMetadata {
  environment?: string;
}

export type Flow = {
  id: FlowId;
  entryPoint: NodeId | null;
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, Edge>;
  inputs?: FlowInputField[];
  metadata?: FlowMetadata;
};

export type NodeTypeDefinition = {
  type: string;
  label: string;
  description: string;
  ui?: {
    color?: string;
    icon?: string;
  };

  /**
   * Optional JSON Schema defining valid inputs for this node type.
   *
   * For AgentComponent nodes, this schema is typically derived from the prompt template
   * variables (e.g., if prompt uses {{goal}}, input schema should include "goal").
   *
   * For DeterministicStepComponent nodes, this schema is derived from the specific
   * tool being executed and is handled at a separate layer.
   *
   * When null/undefined, no input validation is performed.
   */
  inputSchema?: JSONSchema7;

  /**
   * Optional JSON Schema defining outputs produced by this node type.
   *
   * Outputs follow the V1 state structure:
   * - context:{node_id}.{field} - Component outputs (ID-based internally)
   * - conversation_history:{node_name} - Message history
   * - status - Workflow status
   *
   * When null/undefined, output paths cannot be validated or auto-completed.
   */
  outputSchema?: JSONSchema7;
};
