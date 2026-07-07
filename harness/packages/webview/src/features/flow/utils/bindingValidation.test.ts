import { describe, it, expect } from 'vitest';
import type { JSONSchema7 } from 'json-schema';
import type {
  Node,
  Edge,
  NodeId,
  EdgeId,
  Flow,
  FlowId,
  NodeTypeDefinition,
  ToolDefinition,
  ParameterBinding,
  AgentNodeConfig,
} from '../types';
import { validateNodeBindings, validateAllBindings } from './bindingValidation';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type: 'agent',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function createToolNode(
  id: string,
  toolName: string,
  parameterBindings: ParameterBinding[] = [],
  overrides: Partial<Node> = {},
): Node {
  return createTestNode(id, {
    type: 'tool',
    config: { toolName, parameterBindings },
    ...overrides,
  });
}

function createTestEdge(id: string, source: string, target: string): Edge {
  return {
    id: id as EdgeId,
    source: source as NodeId,
    target: target as NodeId,
  };
}

function createTestFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'test-flow' as FlowId,
    entryPoint: null,
    nodes: {},
    edges: {},
    ...overrides,
  };
}

/**
 * A tool definition with a known input schema for testing.
 *
 * Tool: "file_reader"
 *   Required: file_path (string), encoding (string)
 *   Optional: max_lines (number), include_metadata (boolean)
 */
const FILE_READER_INPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'Path to the file' },
    encoding: { type: 'string', description: 'File encoding' },
    max_lines: { type: 'number', description: 'Max lines to read' },
    include_metadata: { type: 'boolean', description: 'Include file metadata' },
  },
  required: ['file_path', 'encoding'],
};

const FILE_READER_OUTPUT_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    content: { type: 'string' },
    line_count: { type: 'number' },
    metadata: { type: 'object' },
  },
};

const FILE_READER_TOOL: ToolDefinition = {
  name: 'file_reader',
  label: 'File Reader',
  description: 'Reads file contents',
  category: 'file_system',
  inputSchema: FILE_READER_INPUT_SCHEMA,
  outputSchema: FILE_READER_OUTPUT_SCHEMA,
};

/**
 * A tool with an array-typed output for testing type mismatches.
 */
const LIST_TOOL: ToolDefinition = {
  name: 'list_files',
  label: 'List Files',
  description: 'Lists files in a directory',
  category: 'file_system',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Directory path' },
    },
    required: ['directory'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      files: { type: 'array', description: 'List of files' },
    },
  },
};

const TOOL_DEFINITIONS: ToolDefinition[] = [FILE_READER_TOOL, LIST_TOOL];

/**
 * Node type definitions with output schemas.
 * The agent definition provides a generic final_answer output.
 */
const AGENT_DEFINITION: NodeTypeDefinition = {
  type: 'agent',
  label: 'Agent',
  description: 'An AI agent',
  outputSchema: {
    type: 'object',
    properties: {
      final_answer: { type: 'string' },
    },
  },
};

const TOOL_DEFINITION: NodeTypeDefinition = {
  type: 'tool',
  label: 'Tool',
  description: 'A deterministic tool step',
};

const AI_TASK_DEFINITION: NodeTypeDefinition = {
  type: 'ai-task',
  label: 'AI Task',
  description: 'An AI task',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Task description' },
    },
    required: ['goal'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      final_answer: { type: 'string' },
    },
  },
};

const NODE_DEFINITIONS: NodeTypeDefinition[] = [
  AGENT_DEFINITION,
  TOOL_DEFINITION,
  AI_TASK_DEFINITION,
];

/**
 * Build a flow with an upstream agent node connected to a downstream tool node.
 *
 *   A (agent) --> T (tool: file_reader)
 */
function createAgentToToolFlow(
  toolName: string,
  bindings: ParameterBinding[],
): { flow: Flow; toolNode: Node } {
  const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });
  const toolNode = createToolNode('T', toolName, bindings, { label: 'reader' });

  const flow = createTestFlow({
    entryPoint: 'A' as NodeId,
    nodes: {
      ['A' as NodeId]: agentNode,
      ['T' as NodeId]: toolNode,
    } as Flow['nodes'],
    edges: {
      ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T'),
    } as Flow['edges'],
  });

  return { flow, toolNode };
}

// ============================================================================
// Tests
// ============================================================================

describe('bindingValidation', () => {
  // --------------------------------------------------------------------------
  // validateNodeBindings
  // --------------------------------------------------------------------------

  describe('validateNodeBindings', () => {
    it('returns empty validation for nodes with no tool schema (unknown tool)', () => {
      const { flow, toolNode } = createAgentToToolFlow('unknown_tool', []);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.nodeId).toBe('T');
      expect(result.parameters).toEqual([]);
      expect(result.hasErrors).toBe(false);
      expect(result.hasWarnings).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });

    it('reports unbound status for required parameters with no binding', () => {
      const { flow, toolNode } = createAgentToToolFlow('file_reader', []);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const filePath = result.parameters.find((p) => p.parameter === 'file_path');
      expect(filePath).toBeDefined();
      expect(filePath!.status.state).toBe('unbound');
      expect(filePath!.required).toBe(true);
      expect(filePath!.binding).toBeNull();

      const encoding = result.parameters.find((p) => p.parameter === 'encoding');
      expect(encoding).toBeDefined();
      expect(encoding!.status.state).toBe('unbound');
      expect(encoding!.required).toBe(true);

      // Optional params are also unbound but not required
      const maxLines = result.parameters.find((p) => p.parameter === 'max_lines');
      expect(maxLines).toBeDefined();
      expect(maxLines!.status.state).toBe('unbound');
      expect(maxLines!.required).toBe(false);
    });

    it('reports valid status for literal bindings', () => {
      const bindings: ParameterBinding[] = [
        { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/test.txt' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ];
      const { flow, toolNode } = createAgentToToolFlow('file_reader', bindings);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const filePath = result.parameters.find((p) => p.parameter === 'file_path');
      expect(filePath!.status.state).toBe('valid');

      const encoding = result.parameters.find((p) => p.parameter === 'encoding');
      expect(encoding!.status.state).toBe('valid');

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
    });

    it('reports valid for reference bindings pointing to a valid upstream output', () => {
      const bindings: ParameterBinding[] = [
        { parameter: 'file_path', kind: 'reference', referencePath: 'context:A.final_answer' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ];
      const { flow, toolNode } = createAgentToToolFlow('file_reader', bindings);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const filePath = result.parameters.find((p) => p.parameter === 'file_path');
      expect(filePath!.status.state).toBe('valid');
      expect(result.hasErrors).toBe(false);
    });

    it('reports broken for reference bindings pointing to a non-existent node', () => {
      const bindings: ParameterBinding[] = [
        {
          parameter: 'file_path',
          kind: 'reference',
          referencePath: 'context:deleted_node.final_answer',
        },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ];
      const { flow, toolNode } = createAgentToToolFlow('file_reader', bindings);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const filePath = result.parameters.find((p) => p.parameter === 'file_path');
      expect(filePath!.status.state).toBe('broken');
      expect(filePath!.required).toBe(true);
      expect(result.hasErrors).toBe(true);
    });

    it('reports broken for reference bindings pointing to a node that exists but is not upstream', () => {
      // Create flow: A --> T, D exists but is not connected to T
      const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });
      const disconnectedNode = createTestNode('D', { type: 'agent', label: 'disconnected' });
      const bindings: ParameterBinding[] = [
        { parameter: 'file_path', kind: 'reference', referencePath: 'context:D.final_answer' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ];
      const toolNode = createToolNode('T', 'file_reader', bindings, { label: 'reader' });

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['T' as NodeId]: toolNode,
          ['D' as NodeId]: disconnectedNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T'),
        } as Flow['edges'],
      });

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const filePath = result.parameters.find((p) => p.parameter === 'file_path');
      expect(filePath!.status.state).toBe('broken');

      const status = filePath!.status as { state: 'broken'; reason: string; originalRef: string };
      expect(status.reason).toContain('not connected upstream');
      expect(status.originalRef).toBe('context:D.final_answer');
    });

    it('reports warning for stale bindings (parameter not in schema)', () => {
      const bindings: ParameterBinding[] = [
        { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/test.txt' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
        { parameter: 'removed_param', kind: 'literal', literalValue: 'stale' },
      ];
      const { flow, toolNode } = createAgentToToolFlow('file_reader', bindings);

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const stale = result.parameters.find((p) => p.parameter === 'removed_param');
      expect(stale).toBeDefined();
      expect(stale!.status.state).toBe('warning');

      const status = stale!.status as { state: 'warning'; message: string };
      expect(status.message).toContain('does not exist');
      expect(stale!.required).toBe(false);

      expect(result.hasWarnings).toBe(true);
    });

    it('correctly counts errors and warnings', () => {
      // Create a flow where:
      // - file_path: required + unbound --> error
      // - encoding: required + broken ref (non-existent node) --> error
      // - max_lines: optional + unbound --> no error, no warning
      // - include_metadata: optional + has a stale extra binding? No -- let's use type-mismatch
      // Plus a stale binding --> warning
      const listNode = createToolNode(
        'L',
        'list_files',
        [{ parameter: 'directory', kind: 'literal', literalValue: '/tmp' }],
        { label: 'lister' },
      );

      const bindings: ParameterBinding[] = [
        // file_path: no binding (will be unbound + required = error)
        // encoding: broken reference (required = error)
        {
          parameter: 'encoding',
          kind: 'reference',
          referencePath: 'context:nonexistent.output',
        },
        // max_lines: reference to array output (type-mismatch = warning)
        {
          parameter: 'max_lines',
          kind: 'reference',
          referencePath: 'context:L.files',
        },
        // stale binding (warning)
        { parameter: 'old_param', kind: 'literal', literalValue: 'stale' },
      ];
      const toolNode = createToolNode('T', 'file_reader', bindings, { label: 'reader' });

      const flow = createTestFlow({
        entryPoint: 'L' as NodeId,
        nodes: {
          ['L' as NodeId]: listNode,
          ['T' as NodeId]: toolNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'L', 'T'),
        } as Flow['edges'],
      });

      const result = validateNodeBindings(flow, toolNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      // Errors: file_path (required+unbound) + encoding (required+broken) = 2
      expect(result.errorCount).toBe(2);
      expect(result.hasErrors).toBe(true);

      // Warnings: max_lines (type-mismatch) + old_param (stale) = 2
      expect(result.warningCount).toBe(2);
      expect(result.hasWarnings).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // validateAllBindings
  // --------------------------------------------------------------------------

  describe('validateAllBindings', () => {
    it('validates tool, agent, and ai-task nodes', () => {
      const agentNode = createTestNode('A', { type: 'agent', label: 'agent' });
      const aiTaskNode = createTestNode('B', {
        type: 'ai-task',
        label: 'task',
        config: {
          promptMode: 'remote',
          promptId: 'p1',
          toolset: [],
          parameterBindings: [{ parameter: 'goal', kind: 'literal', literalValue: 'do something' }],
        },
      });
      const toolNode = createToolNode(
        'T',
        'file_reader',
        [
          { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/test.txt' },
          { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
        ],
        { label: 'reader' },
      );

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['B' as NodeId]: aiTaskNode,
          ['T' as NodeId]: toolNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
          ['e2' as EdgeId]: createTestEdge('e2', 'B', 'T'),
        } as Flow['edges'],
      });

      const result = validateAllBindings(flow, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      // All three node types should appear in validations
      expect(result.nodeValidations.size).toBe(3);
      expect(result.nodeValidations.has('T' as NodeId)).toBe(true);
      expect(result.nodeValidations.has('A' as NodeId)).toBe(true);
      expect(result.nodeValidations.has('B' as NodeId)).toBe(true);
    });

    it('returns canExecute=true when no errors', () => {
      const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });
      const toolNode = createToolNode(
        'T',
        'file_reader',
        [
          { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/test.txt' },
          { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
        ],
        { label: 'reader' },
      );

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['T' as NodeId]: toolNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T'),
        } as Flow['edges'],
      });

      const result = validateAllBindings(flow, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.canExecute).toBe(true);
      expect(result.totalErrors).toBe(0);
    });

    it('returns canExecute=false when any required binding is broken or unbound', () => {
      const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });
      // Tool node with no bindings -- required params will be unbound
      const toolNode = createToolNode('T', 'file_reader', [], { label: 'reader' });

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['T' as NodeId]: toolNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T'),
        } as Flow['edges'],
      });

      const result = validateAllBindings(flow, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.canExecute).toBe(false);
      // file_path and encoding are both required and unbound
      expect(result.totalErrors).toBe(2);
    });

    it('correctly sums totalErrors and totalWarnings across multiple nodes', () => {
      const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });

      // Tool 1: file_reader with all required bound, plus one stale binding (1 warning)
      const tool1 = createToolNode(
        'T1',
        'file_reader',
        [
          { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/test.txt' },
          { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
          { parameter: 'stale_param', kind: 'literal', literalValue: 'old' },
        ],
        { label: 'reader' },
      );

      // Tool 2: file_reader with missing required bindings (2 errors)
      const tool2 = createToolNode('T2', 'file_reader', [], { label: 'reader2' });

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['T1' as NodeId]: tool1,
          ['T2' as NodeId]: tool2,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T1'),
          ['e2' as EdgeId]: createTestEdge('e2', 'A', 'T2'),
        } as Flow['edges'],
      });

      const result = validateAllBindings(flow, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      // A: 0 errors, 0 warnings (agent with no input schema)
      // T1: 0 errors, 1 warning (stale binding)
      // T2: 2 errors (file_path + encoding required and unbound), 0 warnings
      expect(result.totalErrors).toBe(2);
      expect(result.totalWarnings).toBe(1);
      expect(result.canExecute).toBe(false);
      expect(result.nodeValidations.size).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // AI Task node validation (uses node type definition's inputSchema)
  // --------------------------------------------------------------------------

  describe('validateNodeBindings for AI Task nodes', () => {
    function createAgentToAiTaskFlow(bindings: ParameterBinding[]): {
      flow: Flow;
      aiTaskNode: Node;
    } {
      const agentNode = createTestNode('A', { type: 'agent', label: 'analyzer' });
      const aiTaskNode = createTestNode('T', {
        type: 'ai-task',
        label: 'summarizer',
        config: {
          promptMode: 'remote',
          promptId: 'p1',
          toolset: [],
          parameterBindings: bindings,
        },
      });

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: {
          ['A' as NodeId]: agentNode,
          ['T' as NodeId]: aiTaskNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'T'),
        } as Flow['edges'],
      });

      return { flow, aiTaskNode };
    }

    it('reports error for unbound required goal parameter', () => {
      const { flow, aiTaskNode } = createAgentToAiTaskFlow([]);

      const result = validateNodeBindings(flow, aiTaskNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal).toBeDefined();
      expect(goal!.status.state).toBe('unbound');
      expect(goal!.required).toBe(true);
      expect(result.errorCount).toBe(1);
    });

    it('reports valid for literal goal binding', () => {
      const { flow, aiTaskNode } = createAgentToAiTaskFlow([
        { parameter: 'goal', kind: 'literal', literalValue: 'Summarize the code' },
      ]);

      const result = validateNodeBindings(flow, aiTaskNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('valid');
      expect(result.errorCount).toBe(0);
    });

    it('reports valid for reference binding to upstream output', () => {
      const { flow, aiTaskNode } = createAgentToAiTaskFlow([
        { parameter: 'goal', kind: 'reference', referencePath: 'context:A.final_answer' },
      ]);

      const result = validateNodeBindings(flow, aiTaskNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('valid');
      expect(result.errorCount).toBe(0);
    });

    it('reports broken for reference to non-existent node', () => {
      const { flow, aiTaskNode } = createAgentToAiTaskFlow([
        {
          parameter: 'goal',
          kind: 'reference',
          referencePath: 'context:nonexistent.output',
        },
      ]);

      const result = validateNodeBindings(flow, aiTaskNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('broken');
      expect(result.errorCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Agent node dynamic schema validation
  // --------------------------------------------------------------------------

  describe('validateNodeBindings for Agent nodes (dynamic schema)', () => {
    function createAgentFlowWithLocalPrompt(
      bindings: ParameterBinding[],
      promptSystem: string,
      promptUser: string,
    ): { flow: Flow; agentNode: Node } {
      const upstreamNode = createTestNode('U', { type: 'tool', label: 'upstream' });
      const agentConfig: AgentNodeConfig = {
        promptMode: 'local',
        localPrompt: {
          name: 'Test Prompt',
          promptTemplate: { system: promptSystem, user: promptUser },
        },
        toolset: [],
        parameterBindings: bindings,
      };
      const agentNode = createTestNode('A', {
        type: 'agent',
        label: 'my_agent',
        config: agentConfig,
      });

      const flow = createTestFlow({
        entryPoint: 'U' as NodeId,
        nodes: {
          ['U' as NodeId]: upstreamNode,
          ['A' as NodeId]: agentNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'U', 'A'),
        } as Flow['edges'],
      });

      return { flow, agentNode };
    }

    function createAgentFlowWithRemotePrompt(
      bindings: ParameterBinding[],
      dynamicInputParams: string[],
    ): { flow: Flow; agentNode: Node } {
      const upstreamNode = createTestNode('U', { type: 'tool', label: 'upstream' });
      const agentConfig: AgentNodeConfig = {
        promptMode: 'remote',
        promptId: 'remote_prompt_1',
        toolset: [],
        parameterBindings: bindings,
        dynamicInputParams,
      };
      const agentNode = createTestNode('A', {
        type: 'agent',
        label: 'my_agent',
        config: agentConfig,
      });

      const flow = createTestFlow({
        entryPoint: 'U' as NodeId,
        nodes: {
          ['U' as NodeId]: upstreamNode,
          ['A' as NodeId]: agentNode,
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'U', 'A'),
        } as Flow['edges'],
      });

      return { flow, agentNode };
    }

    it('reports unbound errors for local prompt variables with no bindings', () => {
      const { flow, agentNode } = createAgentFlowWithLocalPrompt(
        [],
        'You are a {{role}} assistant.',
        'Analyze this {{context}} and achieve the {{goal}}.',
      );

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.parameters).toHaveLength(3);
      expect(result.errorCount).toBe(3);

      const role = result.parameters.find((p) => p.parameter === 'role');
      expect(role!.status.state).toBe('unbound');
      expect(role!.required).toBe(true);

      const context = result.parameters.find((p) => p.parameter === 'context');
      expect(context!.status.state).toBe('unbound');
      expect(context!.required).toBe(true);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('unbound');
      expect(goal!.required).toBe(true);
    });

    it('reports valid when local prompt variables have literal bindings', () => {
      const { flow, agentNode } = createAgentFlowWithLocalPrompt(
        [
          { parameter: 'goal', kind: 'literal', literalValue: 'Fix the bug' },
          { parameter: 'context', kind: 'literal', literalValue: 'The user reported a crash' },
        ],
        'You are a helpful assistant.',
        'Given this {{context}}, achieve the {{goal}}.',
      );

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.errorCount).toBe(0);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('valid');

      const context = result.parameters.find((p) => p.parameter === 'context');
      expect(context!.status.state).toBe('valid');
    });

    it('reports unbound errors for remote prompt dynamic params with no bindings', () => {
      const { flow, agentNode } = createAgentFlowWithRemotePrompt([], ['goal', 'context']);

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.parameters).toHaveLength(2);
      expect(result.errorCount).toBe(2);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('unbound');
      expect(goal!.required).toBe(true);

      const context = result.parameters.find((p) => p.parameter === 'context');
      expect(context!.status.state).toBe('unbound');
      expect(context!.required).toBe(true);
    });

    it('reports valid when remote prompt dynamic params have bindings', () => {
      const { flow, agentNode } = createAgentFlowWithRemotePrompt(
        [
          { parameter: 'goal', kind: 'literal', literalValue: 'Fix the bug' },
          { parameter: 'context', kind: 'literal', literalValue: 'Crash report' },
        ],
        ['goal', 'context'],
      );

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.errorCount).toBe(0);

      const goal = result.parameters.find((p) => p.parameter === 'goal');
      expect(goal!.status.state).toBe('valid');

      const context = result.parameters.find((p) => p.parameter === 'context');
      expect(context!.status.state).toBe('valid');
    });

    it('reports stale agent binding with node-generic warning message', () => {
      const { flow, agentNode } = createAgentFlowWithLocalPrompt(
        [
          { parameter: 'goal', kind: 'literal', literalValue: 'Fix the bug' },
          { parameter: 'removed_param', kind: 'literal', literalValue: 'stale' },
        ],
        'You are a helpful assistant.',
        'Achieve the {{goal}}.',
      );

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      const stale = result.parameters.find((p) => p.parameter === 'removed_param');
      expect(stale).toMatchObject({
        status: {
          state: 'warning',
          message: expect.stringContaining('does not exist on this node'),
        },
      });
      expect((stale?.status as { message: string })?.message).not.toContain('tool');
    });

    it('returns empty validation for agent with no prompt configured', () => {
      const agentNode = createTestNode('A', {
        type: 'agent',
        label: 'empty_agent',
        config: { promptMode: 'remote', promptId: 'p1', toolset: [] } as AgentNodeConfig,
      });

      const flow = createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: { ['A' as NodeId]: agentNode } as Flow['nodes'],
        edges: {},
      });

      const result = validateNodeBindings(flow, agentNode, NODE_DEFINITIONS, TOOL_DEFINITIONS, []);

      expect(result.parameters).toEqual([]);
      expect(result.hasErrors).toBe(false);
    });
  });
});
