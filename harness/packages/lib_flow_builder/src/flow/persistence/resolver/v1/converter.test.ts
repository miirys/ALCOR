/* eslint-disable no-underscore-dangle */
import type {
  Flow,
  FlowId,
  NodeId,
  AgentNodeConfig,
  AiTaskNodeConfig,
  ToolNodeConfig,
  InlinePromptDefinition,
  ParameterBinding,
} from '../../../types';
import { FlowV1Converter } from './converter';
import type { FlowV1 } from './schema';

function makeMinimalV1(overrides: Record<string, unknown> = {}): FlowV1 {
  return {
    version: 'v1' as const,
    environment: 'ambient' as const,
    components: [{ name: 'step_one', type: 'AgentComponent', prompt_id: 'p1', toolset: [] }],
    routers: [{ from: 'step_one', to: 'end' }],
    flow: { entry_point: 'step_one' },
    ...overrides,
  };
}

function makeMinimalFlow(): Flow {
  const nodeId = 'node-1' as NodeId;
  return {
    id: 'default' as FlowId,
    entryPoint: nodeId,
    nodes: {
      [nodeId]: {
        id: nodeId,
        label: 'Step One',
        type: 'agent',
        position: { x: 0, y: 0 },
        config: {
          promptMode: 'remote',
          promptId: 'p1',
          promptVersion: undefined,
          localPrompt: undefined,
          toolset: [],
        },
      },
    },
    edges: {},
  };
}

describe('FlowV1Converter', () => {
  const converter = new FlowV1Converter();

  describe('flow.inputs round-trip', () => {
    it('parses v1 inputs into FlowInputField[]', () => {
      const v1 = makeMinimalV1({
        flow: {
          entry_point: 'step_one',
          inputs: [
            {
              category: 'context',
              input_schema: {
                goal: { type: 'string', format: 'multiline', description: 'The user goal' },
                project_id: { type: 'string' },
              },
            },
          ],
        },
      });

      const result = converter.toFlow(v1);
      expect(result.isOk()).toBe(true);

      const flow = result._unsafeUnwrap();
      expect(flow.inputs).toEqual([
        {
          name: 'goal',
          type: 'string',
          format: 'multiline',
          description: 'The user goal',
          category: 'context',
        },
        {
          name: 'project_id',
          type: 'string',
          format: undefined,
          description: undefined,
          category: 'context',
        },
      ]);
    });

    it('flattens multiple categories into a single list', () => {
      const v1 = makeMinimalV1({
        flow: {
          entry_point: 'step_one',
          inputs: [
            {
              category: 'context',
              input_schema: {
                goal: { type: 'string' },
              },
            },
            {
              category: 'settings',
              input_schema: {
                max_retries: { type: 'integer', description: 'Retry count' },
              },
            },
          ],
        },
      });

      const result = converter.toFlow(v1);
      expect(result.isOk()).toBe(true);

      const flow = result._unsafeUnwrap();
      expect(flow.inputs).toHaveLength(2);
      expect(flow.inputs![0].name).toBe('goal');
      expect(flow.inputs![1].name).toBe('max_retries');
    });

    it('produces no inputs field for v1 without flow.inputs and no component context references', () => {
      const v1 = makeMinimalV1();

      const result = converter.toFlow(v1);
      expect(result.isOk()).toBe(true);

      const flow = result._unsafeUnwrap();
      expect(flow.inputs).toBeUndefined();
    });

    it('writes internal inputs back to v1 format', () => {
      const flow = makeMinimalFlow();
      flow.inputs = [
        { name: 'goal', type: 'string', format: 'multiline', description: 'User goal' },
        { name: 'project_id', type: 'string' },
      ];

      const result = converter.fromFlow(flow);
      expect(result.isOk()).toBe(true);

      const v1 = result._unsafeUnwrap() as Record<string, unknown>;
      const flowConfig = v1.flow as { entry_point: string; inputs?: unknown[] };
      expect(flowConfig.inputs).toEqual([
        {
          category: 'flow_input',
          input_schema: {
            goal: { type: 'string', format: 'multiline', description: 'User goal' },
            project_id: { type: 'string' },
          },
        },
      ]);
    });

    it('omits inputs from v1 when flow has no inputs', () => {
      const flow = makeMinimalFlow();

      const result = converter.fromFlow(flow);
      expect(result.isOk()).toBe(true);

      const v1 = result._unsafeUnwrap() as Record<string, unknown>;
      const flowConfig = v1.flow as { entry_point: string; inputs?: unknown[] };
      expect(flowConfig.inputs).toBeUndefined();
    });

    it('round-trips inputs through toFlow -> fromFlow', () => {
      const v1Input = makeMinimalV1({
        flow: {
          entry_point: 'step_one',
          inputs: [
            {
              category: 'context',
              input_schema: {
                goal: { type: 'string', format: 'multiline', description: 'Describe task' },
                branch: { type: 'string', description: 'Target branch' },
              },
            },
          ],
        },
      });

      const toFlowResult = converter.toFlow(v1Input);
      expect(toFlowResult.isOk()).toBe(true);

      const flow = toFlowResult._unsafeUnwrap();
      const fromFlowResult = converter.fromFlow(flow);
      expect(fromFlowResult.isOk()).toBe(true);

      const v1Output = fromFlowResult._unsafeUnwrap() as Record<string, unknown>;
      const outputFlowConfig = v1Output.flow as {
        inputs?: { category: string; input_schema: Record<string, unknown> }[];
      };
      const inputFlowConfig = (v1Input as Record<string, unknown>).flow as { inputs?: unknown[] };
      expect(outputFlowConfig.inputs).toEqual(inputFlowConfig.inputs);
    });
  });

  describe('AgentComponent.toolset round-trip', () => {
    it('preserves catalog tool names and unknown custom names in both directions', () => {
      const toolset = ['read_file', 'write_file', 'my_custom_tool'];

      const v1 = makeMinimalV1({
        components: [{ name: 'step_one', type: 'AgentComponent', prompt_id: 'p1', toolset }],
      });

      const forward = converter.toFlow(v1);
      expect(forward.isOk()).toBe(true);
      const flow = forward._unsafeUnwrap();
      const agent = Object.values(flow.nodes)[0];
      expect((agent.config as AgentNodeConfig).toolset).toEqual(toolset);

      const back = converter.fromFlow(flow);
      expect(back.isOk()).toBe(true);
      const v1Out = back._unsafeUnwrap() as FlowV1;
      expect(v1Out.components[0].toolset).toEqual(toolset);
    });
  });

  describe('Legacy input derivation (fallback)', () => {
    it('derives inputs from context references that do not match component names', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs: [
              { from: 'context:goal', as: 'goal' },
              { from: 'context:project_id', as: 'pid' },
            ],
          },
          {
            name: 'step_two',
            type: 'OneOffComponent',
            prompt_id: 'p2',
            toolset: [],
            inputs: [
              { from: 'context:step_one.result', as: 'prev_result' }, // Internal ref, should be ignored
              { from: 'status:failed', as: 'status' }, // Not a context ref, should be ignored
            ],
          },
        ],
      });
      delete v1.flow.inputs; // Ensure no explicit inputs exist

      const result = converter.toFlow(v1);
      expect(result.isOk()).toBe(true);

      const flow = result._unsafeUnwrap();

      // Should contain 'goal' and 'project_id', but NOT 'step_one.result' or 'status:failed'
      expect(flow.inputs).toBeDefined();
      expect(flow.inputs).toEqual([
        { name: 'goal', type: 'string', format: undefined, description: undefined },
        { name: 'project_id', type: 'string', format: undefined, description: undefined },
      ]);
    });

    it('deduplicates derived inputs across multiple components', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs: [{ from: 'context:shared_var' }],
          },
          {
            name: 'step_two',
            type: 'DeterministicStepComponent',
            tool_name: 't1',
            toolset: [],
            inputs: [{ from: 'context:shared_var' }],
          },
        ],
      });
      delete v1.flow.inputs;

      const result = converter.toFlow(v1);
      const flow = result._unsafeUnwrap();

      // Should contain 'shared_var' exactly once
      expect(flow.inputs).toEqual([
        { name: 'shared_var', type: 'string', format: undefined, description: undefined },
      ]);
    });

    it('prioritizes explicit flow.inputs over derivation if present', () => {
      const v1 = makeMinimalV1({
        flow: {
          entry_point: 'step_one',
          inputs: [
            {
              category: 'context',
              input_schema: {
                explicit_var: { type: 'string' },
              },
            },
          ],
        },
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs: [{ from: 'context:undeclared_var' }],
          },
        ],
      });

      const result = converter.toFlow(v1);
      const flow = result._unsafeUnwrap();

      // Should ONLY contain explicit_var, bypassing the derivation logic entirely
      expect(flow.inputs).toEqual([
        {
          name: 'explicit_var',
          type: 'string',
          format: undefined,
          description: undefined,
          category: 'context',
        },
      ]);
    });
  });

  describe('parameterBindings conversion', () => {
    function makeV1WithToolInputs(
      inputs: { from: string; as?: string; literal?: boolean; optional?: boolean }[],
    ): FlowV1 {
      return makeMinimalV1({
        components: [
          {
            name: 'analyzer',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
          },
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs,
          },
        ],
        routers: [
          { from: 'analyzer', to: 'reader' },
          { from: 'reader', to: 'end' },
        ],
        flow: { entry_point: 'analyzer' },
      });
    }

    describe('toFlow', () => {
      it('converts literal inputs to literal bindings', () => {
        const v1 = makeV1WithToolInputs([{ from: '/src/main.ts', as: 'file_path', literal: true }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
        const config = readerNode.config as { parameterBindings?: unknown[] };

        expect(config.parameterBindings).toEqual([
          { parameter: 'file_path', kind: 'literal', literalValue: '/src/main.ts' },
        ]);
      });

      it('converts context reference inputs to reference bindings with ID-based paths', () => {
        const v1 = makeV1WithToolInputs([{ from: 'context:analyzer.findings', as: 'content' }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const analyzerNode = Object.values(flow.nodes).find((n) => n.label === 'Analyzer')!;
        const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
        const config = readerNode.config as {
          parameterBindings?: { parameter: string; kind: string; referencePath?: string }[];
        };

        expect(config.parameterBindings).toHaveLength(1);
        expect(config.parameterBindings![0].parameter).toBe('content');
        expect(config.parameterBindings![0].kind).toBe('reference');
        // The label "analyzer" should be translated to its internal NodeId
        expect(config.parameterBindings![0].referencePath).toBe(
          `context:${analyzerNode.id}.findings`,
        );
      });

      it('maps the "as" field to the parameter name', () => {
        const v1 = makeV1WithToolInputs([{ from: 'context:analyzer.output', as: 'my_param' }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
        const config = readerNode.config as {
          parameterBindings?: { parameter: string }[];
        };

        expect(config.parameterBindings![0].parameter).toBe('my_param');
      });

      it('falls back to last path segment when "as" is absent', () => {
        const v1 = makeV1WithToolInputs([{ from: 'context:analyzer.findings' }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
        const config = readerNode.config as {
          parameterBindings?: { parameter: string }[];
        };

        expect(config.parameterBindings![0].parameter).toBe('findings');
      });

      it('passes through non-node context references unchanged', () => {
        const v1 = makeV1WithToolInputs([{ from: 'context:goal', as: 'goal' }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
        const config = readerNode.config as {
          parameterBindings?: { referencePath?: string }[];
        };

        // "goal" is not a component name, so path is unchanged
        expect(config.parameterBindings![0].referencePath).toBe('context:goal');
      });
    });

    describe('fromFlow', () => {
      it('converts literal bindings to inputs with literal: true', () => {
        const flow = makeMinimalFlow();
        const nodeId = Object.keys(flow.nodes)[0] as NodeId;
        flow.nodes[nodeId] = {
          ...flow.nodes[nodeId],
          type: 'tool',
          config: {
            toolName: 'read_file',
            toolset: [],
            parameterBindings: [
              { parameter: 'file_path', kind: 'literal' as const, literalValue: '/src/main.ts' },
            ],
          },
        };

        const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
        const component = v1.components[0];
        expect(component.inputs).toEqual([
          { from: '/src/main.ts', as: 'file_path', literal: true },
        ]);
      });

      it('converts reference bindings to inputs with component-name-based paths', () => {
        const analyzerId = 'aaaa-bbbb' as NodeId;
        const readerId = 'cccc-dddd' as NodeId;
        const flow: Flow = {
          id: 'default' as FlowId,
          entryPoint: analyzerId,
          nodes: {
            [analyzerId]: {
              id: analyzerId,
              label: 'Analyzer',
              type: 'agent',
              position: { x: 0, y: 0 },
              config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
            },
            [readerId]: {
              id: readerId,
              label: 'Reader',
              type: 'tool',
              position: { x: 0, y: 200 },
              config: {
                toolName: 'read_file',
                toolset: [],
                parameterBindings: [
                  {
                    parameter: 'content',
                    kind: 'reference' as const,
                    referencePath: `context:${analyzerId}.findings`,
                  },
                ],
              },
            },
          },
          edges: {},
        };

        const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
        const readerComponent = v1.components.find((c) => c.name === 'reader')!;

        expect(readerComponent.inputs).toEqual([
          { from: 'context:analyzer.findings', as: 'content' },
        ]);
      });

      it('filters out unbound bindings', () => {
        const flow = makeMinimalFlow();
        const nodeId = Object.keys(flow.nodes)[0] as NodeId;
        flow.nodes[nodeId] = {
          ...flow.nodes[nodeId],
          type: 'tool',
          config: {
            toolName: 'read_file',
            toolset: [],
            parameterBindings: [
              { parameter: 'file_path', kind: 'literal' as const, literalValue: '/src/main.ts' },
              { parameter: 'content', kind: 'unbound' as const },
              { parameter: 'encoding', kind: 'unbound' as const },
            ],
          },
        };

        const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
        const component = v1.components[0];
        expect(component.inputs).toEqual([
          { from: '/src/main.ts', as: 'file_path', literal: true },
        ]);
      });

      it('omits inputs entirely when all bindings are unbound', () => {
        const flow = makeMinimalFlow();
        const nodeId = Object.keys(flow.nodes)[0] as NodeId;
        flow.nodes[nodeId] = {
          ...flow.nodes[nodeId],
          type: 'tool',
          config: {
            toolName: 'read_file',
            toolset: [],
            parameterBindings: [{ parameter: 'file_path', kind: 'unbound' as const }],
          },
        };

        const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
        const component = v1.components[0];
        expect(component.inputs).toBeUndefined();
      });
    });

    describe('round-trip: V1 -> Flow -> V1', () => {
      it('preserves literal input semantics', () => {
        const v1 = makeV1WithToolInputs([
          { from: '/src/main.ts', as: 'file_path', literal: true },
          { from: '42', as: 'max_lines', literal: true },
        ]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

        const readerInput = v1.components.find((c) => c.name === 'reader')!;
        const readerOutput = v1Output.components.find((c) => c.name === 'reader')!;

        expect(readerOutput.inputs).toEqual(readerInput.inputs);
      });

      it('preserves context reference input semantics', () => {
        const v1 = makeV1WithToolInputs([{ from: 'context:analyzer.findings', as: 'content' }]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

        const readerInput = v1.components.find((c) => c.name === 'reader')!;
        const readerOutput = v1Output.components.find((c) => c.name === 'reader')!;

        expect(readerOutput.inputs).toEqual(readerInput.inputs);
      });

      it('preserves mixed literal and reference inputs', () => {
        const v1 = makeV1WithToolInputs([
          { from: 'context:analyzer.findings', as: 'content' },
          { from: 'true', as: 'verbose', literal: true },
          { from: 'context:goal', as: 'goal' },
        ]);

        const flow = converter.toFlow(v1)._unsafeUnwrap();
        const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

        const readerInput = v1.components.find((c) => c.name === 'reader')!;
        const readerOutput = v1Output.components.find((c) => c.name === 'reader')!;

        expect(readerOutput.inputs).toEqual(readerInput.inputs);
      });
    });
  });

  describe('friendly display names', () => {
    it('loads V1 names as friendly display labels', () => {
      const v1 = makeMinimalV1();
      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      expect(node.label).toBe('Step One');
    });

    it('derives component names from friendly labels on save', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Code Analyzer',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.components[0].name).toBe('code_analyzer');
      expect(v1.flow.entry_point).toBe('code_analyzer');
    });

    it('returns collision error when two labels derive to the same component name', () => {
      const id1 = 'node-1' as NodeId;
      const id2 = 'node-2' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: id1,
        nodes: {
          [id1]: {
            id: id1,
            label: 'My Agent',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
          },
          [id2]: {
            id: id2,
            label: 'my_agent',
            type: 'agent',
            position: { x: 0, y: 200 },
            config: { promptMode: 'remote', promptId: 'p2', toolset: [] },
          },
        },
        edges: {},
      };

      const result = converter.fromFlow(flow);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('unique component names');
    });

    it('returns error when a label produces an empty component name', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: '---',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
          },
        },
        edges: {},
      };

      const result = converter.fromFlow(flow);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('empty component names');
    });

    it('translates reference paths using derived component names on save', () => {
      const analyzerId = 'aaaa-bbbb' as NodeId;
      const readerId = 'cccc-dddd' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: analyzerId,
        nodes: {
          [analyzerId]: {
            id: analyzerId,
            label: 'Code Analyzer',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
          },
          [readerId]: {
            id: readerId,
            label: 'File Reader',
            type: 'tool',
            position: { x: 0, y: 200 },
            config: {
              toolName: 'read_file',
              toolset: [],
              parameterBindings: [
                {
                  parameter: 'content',
                  kind: 'reference' as const,
                  referencePath: `context:${analyzerId}.findings`,
                },
              ],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const reader = v1.components.find((c) => c.name === 'file_reader')!;
      expect(reader.inputs).toEqual([{ from: 'context:code_analyzer.findings', as: 'content' }]);
    });

    it('round-trips component names through load and save', () => {
      const v1Input = makeMinimalV1();
      const flow = converter.toFlow(v1Input)._unsafeUnwrap();

      // Label is the friendly name after loading
      const node = Object.values(flow.nodes)[0];
      expect(node.label).toBe('Step One');

      // Saving derives the same component name
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1Output.components[0].name).toBe('step_one');
    });
  });

  describe('prompt mode detection (Bug A fix)', () => {
    const localPrompt = {
      prompt_id: 'my_prompt',
      name: 'My Prompt',
      unit_primitives: [],
      prompt_template: { system: 'sys', user: 'usr' },
    };

    it('detects local mode when prompt_id exists in prompts map', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'my_prompt',
            prompt_version: null,
            toolset: [],
          },
        ],
        prompts: [localPrompt],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AgentNodeConfig;

      expect(config.promptMode).toBe('local');
      expect(config.localPrompt).toBeDefined();
    });

    it('detects remote mode when prompt_id is absent from prompts map', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'remote_prompt',
            prompt_version: null,
            toolset: [],
          },
        ],
        prompts: [localPrompt],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AgentNodeConfig;

      expect(config.promptMode).toBe('remote');
      expect(config.localPrompt).toBeUndefined();
    });

    it('detects remote mode even without prompt_version (no prompts at all)', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'remote_prompt',
            toolset: [],
          },
        ],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AgentNodeConfig;

      expect(config.promptMode).toBe('remote');
    });

    it('works the same for OneOffComponent', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'OneOffComponent',
            prompt_id: 'my_prompt',
            prompt_version: null,
            toolset: [],
          },
        ],
        prompts: [localPrompt],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AiTaskNodeConfig;

      expect(config.promptMode).toBe('local');
      expect(config.localPrompt).toBeDefined();
    });
  });

  describe('promptId preservation (Bug B fix)', () => {
    const makeLocalPrompt = (): InlinePromptDefinition => ({
      name: 'Test Prompt',
      promptTemplate: { system: 'sys', user: 'usr' },
    });

    it('regenerates local promptId deterministically from component name', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Step One',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'local',
              promptId: 'original_prompt_id',
              localPrompt: makeLocalPrompt(),
              toolset: [],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const component = v1.components[0] as { prompt_id: string };
      expect(component.prompt_id).toBe('step_one_prompt');
    });

    it('derives safe promptId from label when none exists', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Code Analyzer',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'local',
              promptId: undefined,
              localPrompt: makeLocalPrompt(),
              toolset: [],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const component = v1.components[0] as { prompt_id: string };
      expect(component.prompt_id).toBe('code_analyzer_prompt');
    });

    it('derives safe promptId for ai-task nodes', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'My Task',
            type: 'ai-task',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'local',
              promptId: undefined,
              localPrompt: makeLocalPrompt(),
              toolset: [],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const component = v1.components[0] as { prompt_id: string };
      expect(component.prompt_id).toBe('my_task_prompt');
    });

    it('round-trips local prompt with deterministically regenerated promptId', () => {
      const v1Input = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'custom_prompt',
            toolset: [],
          },
        ],
        prompts: [
          {
            prompt_id: 'custom_prompt',
            name: 'Custom',
            unit_primitives: [],
            prompt_template: { system: 'sys', user: 'usr' },
          },
        ],
      });

      const flow = converter.toFlow(v1Input)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      // Local prompts always regenerate ID from the sanitized component name
      expect(v1Output.components[0]).toHaveProperty('prompt_id', 'step_one_prompt');
      expect(v1Output.prompts![0].prompt_id).toBe('step_one_prompt');
    });

    it('drops deprecated model config from prompts on load and save', () => {
      const v1Input = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
          },
        ],
        prompts: [
          {
            prompt_id: 'p1',
            name: 'p1',
            unit_primitives: [],
            model: {
              params: {
                model_class_provider: 'litellm',
                model: 'claude_opus_4_6_vertex',
                max_tokens: 8192,
              },
            },
            prompt_template: { system: 'sys', user: 'usr' },
          },
        ],
      });

      // Load: model should not appear in internal representation
      const flow = converter.toFlow(v1Input)._unsafeUnwrap();
      const config = Object.values(flow.nodes)[0].config as AgentNodeConfig;
      expect(config.localPrompt).toBeDefined();
      expect(config.localPrompt).not.toHaveProperty('model');

      // Save: model should not be emitted in V1 output
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1Output.prompts).toBeDefined();
      expect(v1Output.prompts![0]).not.toHaveProperty('model');
    });

    it('always writes placeholder: history to V1 output for local prompts', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Step One',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'local',
              promptId: undefined,
              localPrompt: makeLocalPrompt(),
              toolset: [],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.prompts).toBeDefined();
      expect(v1.prompts![0].prompt_template.placeholder).toBe('history');
    });

    it('does not carry placeholder through to the internal representation on load', () => {
      const v1Input = makeMinimalV1({
        components: [{ name: 'step_one', type: 'AgentComponent', prompt_id: 'p1', toolset: [] }],
        prompts: [
          {
            prompt_id: 'p1',
            name: 'p1',
            unit_primitives: [],
            prompt_template: { system: 'sys', user: 'usr', placeholder: 'history' },
          },
        ],
      });

      const flow = converter.toFlow(v1Input)._unsafeUnwrap();
      const config = Object.values(flow.nodes)[0].config as AgentNodeConfig;
      expect(config.localPrompt).toBeDefined();
      expect(config.localPrompt).not.toHaveProperty('placeholder');
    });
  });

  describe('parameterBindings for OneOffComponent (AI Task)', () => {
    function makeV1WithAiTaskInputs(
      inputs: { from: string; as?: string; literal?: boolean; optional?: boolean }[],
    ): FlowV1 {
      return makeMinimalV1({
        components: [
          {
            name: 'analyzer',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
          },
          {
            name: 'summarizer',
            type: 'OneOffComponent',
            prompt_id: 'p2',
            toolset: [],
            inputs,
          },
        ],
        routers: [
          { from: 'analyzer', to: 'summarizer' },
          { from: 'summarizer', to: 'end' },
        ],
        flow: { entry_point: 'analyzer' },
      });
    }

    it('converts OneOffComponent inputs to parameterBindings on load', () => {
      const v1 = makeV1WithAiTaskInputs([{ from: 'context:analyzer.final_answer', as: 'goal' }]);

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const analyzerNode = Object.values(flow.nodes).find(
        (n) => n.sourceComponentName === 'analyzer',
      )!;
      const summarizerNode = Object.values(flow.nodes).find(
        (n) => n.sourceComponentName === 'summarizer',
      )!;
      const config = summarizerNode.config as {
        parameterBindings?: { parameter: string; kind: string; referencePath?: string }[];
      };

      expect(config.parameterBindings).toHaveLength(1);
      expect(config.parameterBindings![0]).toEqual({
        parameter: 'goal',
        kind: 'reference',
        referencePath: `context:${analyzerNode.id}.final_answer`,
      });
    });

    it('converts AI Task parameterBindings to V1 inputs on save', () => {
      const analyzerId = 'aaaa-1111' as NodeId;
      const summarizerId = 'bbbb-2222' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: analyzerId,
        nodes: {
          [analyzerId]: {
            id: analyzerId,
            label: 'analyzer',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: { promptMode: 'remote', promptId: 'p1', toolset: [] },
          },
          [summarizerId]: {
            id: summarizerId,
            label: 'summarizer',
            type: 'ai-task',
            position: { x: 0, y: 200 },
            config: {
              promptMode: 'remote',
              promptId: 'p2',
              toolset: [],
              parameterBindings: [
                {
                  parameter: 'goal',
                  kind: 'reference' as const,
                  referencePath: `context:${analyzerId}.final_answer`,
                },
              ],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const summarizerComponent = v1.components.find((c) => c.name === 'summarizer')!;
      expect(summarizerComponent.inputs).toEqual([
        { from: 'context:analyzer.final_answer', as: 'goal' },
      ]);
    });

    it('round-trips OneOffComponent reference inputs', () => {
      const v1 = makeV1WithAiTaskInputs([{ from: 'context:analyzer.final_answer', as: 'goal' }]);

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      const summarizerInput = v1.components.find((c) => c.name === 'summarizer')!;
      const summarizerOutput = v1Output.components.find((c) => c.name === 'summarizer')!;
      expect(summarizerOutput.inputs).toEqual(summarizerInput.inputs);
    });

    it('round-trips OneOffComponent literal inputs', () => {
      const v1 = makeV1WithAiTaskInputs([
        { from: 'Summarize the findings', as: 'goal', literal: true },
      ]);

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      const summarizerInput = v1.components.find((c) => c.name === 'summarizer')!;
      const summarizerOutput = v1Output.components.find((c) => c.name === 'summarizer')!;
      expect(summarizerOutput.inputs).toEqual(summarizerInput.inputs);
    });
  });

  describe('parameterBindings for AgentComponent', () => {
    function makeV1WithAgentInputs(
      inputs: { from: string; as?: string; literal?: boolean; optional?: boolean }[],
    ): FlowV1 {
      return makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
          },
          {
            name: 'reviewer',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs,
          },
        ],
        routers: [
          { from: 'reader', to: 'reviewer' },
          { from: 'reviewer', to: 'end' },
        ],
        flow: { entry_point: 'reader' },
      });
    }

    it('converts AgentComponent inputs to parameterBindings on load', () => {
      const v1 = makeV1WithAgentInputs([{ from: 'context:reader.tool_responses', as: 'code' }]);

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const readerNode = Object.values(flow.nodes).find((n) => n.label === 'Reader')!;
      const reviewerNode = Object.values(flow.nodes).find((n) => n.label === 'Reviewer')!;

      const config = reviewerNode.config as {
        parameterBindings?: { parameter: string; kind: string; referencePath?: string }[];
      };

      expect(config.parameterBindings).toHaveLength(1);
      expect(config.parameterBindings![0]).toEqual({
        parameter: 'code',
        kind: 'reference',
        referencePath: `context:${readerNode.id}.tool_responses`,
      });
    });

    it('converts Agent parameterBindings to V1 inputs on save', () => {
      const readerId = 'aaaa-3333' as NodeId;
      const reviewerId = 'bbbb-4444' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: readerId,
        nodes: {
          [readerId]: {
            id: readerId,
            label: 'reader',
            type: 'tool',
            position: { x: 0, y: 0 },
            config: { toolName: 'read_file', toolset: [] },
          },
          [reviewerId]: {
            id: reviewerId,
            label: 'reviewer',
            type: 'agent',
            position: { x: 0, y: 200 },
            config: {
              promptMode: 'remote',
              promptId: 'p1',
              toolset: [],
              parameterBindings: [
                {
                  parameter: 'code',
                  kind: 'reference' as const,
                  referencePath: `context:${readerId}.tool_responses`,
                },
              ],
            },
          },
        },
        edges: {},
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      const reviewerComponent = v1.components.find((c) => c.name === 'reviewer')!;
      expect(reviewerComponent.inputs).toEqual([
        { from: 'context:reader.tool_responses', as: 'code' },
      ]);
    });

    it('round-trips AgentComponent reference inputs', () => {
      const v1 = makeV1WithAgentInputs([{ from: 'context:reader.tool_responses', as: 'code' }]);

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      const reviewerInput = v1.components.find((c) => c.name === 'reviewer')!;
      const reviewerOutput = v1Output.components.find((c) => c.name === 'reviewer')!;
      expect(reviewerOutput.inputs).toEqual(reviewerInput.inputs);
    });
  });

  describe('sourceComponentName', () => {
    it('preserves original V1 component name on loaded nodes', () => {
      const v1 = makeMinimalV1({
        components: [
          { name: 'code_analyzer', type: 'AgentComponent', prompt_id: 'p1', toolset: [] },
        ],
        routers: [{ from: 'code_analyzer', to: 'end' }],
        flow: { entry_point: 'code_analyzer' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];

      expect(node.sourceComponentName).toBe('code_analyzer');
      expect(node.label).toBe('Code Analyzer');
    });
  });

  describe('metadata round-trip', () => {
    it('maps V1 environment to Flow.metadata on load', () => {
      const v1 = makeMinimalV1({ environment: 'chat' });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      expect(flow.metadata).toEqual({ environment: 'chat' });
    });

    it('maps Flow.metadata.environment to V1 on save', () => {
      const flow = makeMinimalFlow();
      flow.metadata = { environment: 'chat' };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.environment).toBe('chat');
    });

    it('defaults environment to ambient when metadata is absent', () => {
      const flow = makeMinimalFlow();

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.environment).toBe('ambient');
    });
  });

  describe('optional flag on parameterBindings', () => {
    it('maps V1 optional input to ParameterBinding.optional on load', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [
              { from: 'context:goal', as: 'goal', optional: true },
              { from: '/src/main.ts', as: 'file_path', literal: true, optional: true },
            ],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as { parameterBindings?: ParameterBinding[] };

      expect(config.parameterBindings![0].optional).toBe(true);
      expect(config.parameterBindings![1].optional).toBe(true);
    });

    it('round-trips optional flag through load and save', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [
              { from: 'context:goal', as: 'goal', optional: true },
              { from: '/src/main.ts', as: 'file_path', literal: true },
            ],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(v1Output.components[0].inputs).toEqual([
        { from: 'context:goal', as: 'goal', optional: true },
        { from: '/src/main.ts', as: 'file_path', literal: true },
      ]);
    });
  });

  describe('literal primitive parsing', () => {
    it('parses stringified booleans into native booleans', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: 'true', as: 'verbose', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as { parameterBindings?: ParameterBinding[] };

      expect(config.parameterBindings![0].literalValue).toBe(true);
    });

    it('parses stringified numbers into native numbers', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: '42', as: 'max_lines', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as { parameterBindings?: ParameterBinding[] };

      expect(config.parameterBindings![0].literalValue).toBe(42);
    });

    it('keeps plain strings as strings', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: 'hello world', as: 'message', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as { parameterBindings?: ParameterBinding[] };

      expect(config.parameterBindings![0].literalValue).toBe('hello world');
    });

    it('parses stringified null into native null', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: 'null', as: 'value', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as { parameterBindings?: ParameterBinding[] };

      expect(config.parameterBindings![0].literalValue).toBeNull();
    });
  });

  describe('literal primitive round-trip', () => {
    it('null literal survives a full V1 → Flow → V1 cycle', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: 'null', as: 'value', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(v1Output.components[0].inputs).toEqual([{ from: 'null', as: 'value', literal: true }]);
    });

    it('boolean literal survives a full V1 → Flow → V1 cycle', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [
              { from: 'true', as: 'verbose', literal: true },
              { from: 'false', as: 'quiet', literal: true },
            ],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(v1Output.components[0].inputs).toEqual([
        { from: 'true', as: 'verbose', literal: true },
        { from: 'false', as: 'quiet', literal: true },
      ]);
    });

    it('number literal survives a full V1 → Flow → V1 cycle', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [
              { from: '42', as: 'max_lines', literal: true },
              { from: '0', as: 'offset', literal: true },
            ],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(v1Output.components[0].inputs).toEqual([
        { from: '42', as: 'max_lines', literal: true },
        { from: '0', as: 'offset', literal: true },
      ]);
    });

    it('empty string literal survives a full V1 → Flow → V1 cycle', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'reader',
            type: 'DeterministicStepComponent',
            tool_name: 'read_file',
            toolset: [],
            inputs: [{ from: '', as: 'prefix', literal: true }],
          },
        ],
        routers: [{ from: 'reader', to: 'end' }],
        flow: { entry_point: 'reader' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(v1Output.components[0].inputs).toEqual([{ from: '', as: 'prefix', literal: true }]);
    });
  });

  describe('metadata round-trip', () => {
    it('preserves environment through a V1 → Flow → V1 cycle', () => {
      const v1 = makeMinimalV1({ environment: 'chat' });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      expect(flow.metadata?.environment).toBe('chat');

      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1Output.environment).toBe('chat');
    });
  });

  describe('dynamicInputParams restoration', () => {
    it('restores dynamicInputParams for remote agent nodes from persisted inputs', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'my_agent',
            type: 'AgentComponent',
            prompt_id: 'external_prompt',
            prompt_version: '1.0',
            toolset: [],
            inputs: [
              { from: 'context:goal', as: 'goal' },
              { from: 'hello', as: 'greeting', literal: true },
            ],
          },
        ],
        prompts: [],
        routers: [{ from: 'my_agent', to: 'end' }],
        flow: { entry_point: 'my_agent' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AgentNodeConfig;

      expect(config.promptMode).toBe('remote');
      expect(config.dynamicInputParams).toEqual(['goal', 'greeting']);
    });

    it('does not set dynamicInputParams for local agent nodes', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'my_agent',
            type: 'AgentComponent',
            prompt_id: 'my_agent_prompt',
            toolset: [],
            inputs: [{ from: 'context:goal', as: 'goal' }],
          },
        ],
        prompts: [
          {
            prompt_id: 'my_agent_prompt',
            name: 'My Agent Prompt',
            unit_primitives: [],
            prompt_template: { system: 'You are an agent.', user: '{{goal}}' },
          },
        ],
        routers: [{ from: 'my_agent', to: 'end' }],
        flow: { entry_point: 'my_agent' },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      const config = node.config as AgentNodeConfig;

      expect(config.promptMode).toBe('local');
      expect(config.dynamicInputParams).toBeUndefined();
    });
  });

  describe('ui_log_events auto-derivation', () => {
    it('derives AgentComponent events on save', () => {
      const flow = makeMinimalFlow();
      const result = converter.fromFlow(flow);
      const v1 = result._unsafeUnwrap() as FlowV1;
      const component = v1.components[0];

      expect(component.type).toBe('AgentComponent');
      expect(component.ui_log_events).toEqual([
        'on_agent_final_answer',
        'on_tool_execution_success',
        'on_tool_execution_failed',
      ]);
    });

    it('derives OneOffComponent events on save', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'My Task',
            type: 'ai-task',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'remote',
              promptId: 'p1',
              toolset: ['read_file'],
            } as AiTaskNodeConfig,
          },
        },
        edges: {},
      };

      const result = converter.fromFlow(flow);
      const v1 = result._unsafeUnwrap() as FlowV1;

      expect(v1.components[0].ui_log_events).toEqual([
        'on_agent_final_answer',
        'on_tool_call_input',
        'on_tool_execution_success',
        'on_tool_execution_failed',
      ]);
    });

    it('derives DeterministicStepComponent events on save', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'My Tool',
            type: 'tool',
            position: { x: 0, y: 0 },
            config: {
              toolName: 'read_file',
              toolset: [],
            } as ToolNodeConfig,
          },
        },
        edges: {},
      };

      const result = converter.fromFlow(flow);
      const v1 = result._unsafeUnwrap() as FlowV1;

      expect(v1.components[0].ui_log_events).toEqual([
        'on_tool_execution_success',
        'on_tool_execution_failed',
      ]);
    });

    it('discards ui_log_events on load (not stored internally)', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            ui_log_events: ['on_agent_final_answer'],
          },
        ],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const node = Object.values(flow.nodes)[0];
      expect(node.config?.uiLogEvents).toBeUndefined();
    });

    it('normalizes partial events on round-trip', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'step_one',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            ui_log_events: ['on_agent_final_answer'],
          },
        ],
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const roundTripped = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;

      expect(roundTripped.components[0].ui_log_events).toEqual([
        'on_agent_final_answer',
        'on_tool_execution_success',
        'on_tool_execution_failed',
      ]);
    });
  });

  describe('flow input path rewriting', () => {
    it('rewrites flow input references to backend nested path on save', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Greeter',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'remote',
              promptId: 'p1',
              toolset: [],
              parameterBindings: [
                { parameter: 'name', kind: 'reference', referencePath: 'context:user_name' },
              ],
            } as AgentNodeConfig,
          },
        },
        edges: {},
        inputs: [{ name: 'user_name', type: 'string' }],
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.components[0].inputs).toEqual([
        { from: 'context:inputs.flow_input.user_name', as: 'name' },
      ]);
    });

    it('unwraps backend nested path to simple reference on load', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'greeter',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs: [{ from: 'context:inputs.flow_input.user_name', as: 'name' }],
          },
        ],
        routers: [{ from: 'greeter', to: 'end' }],
        flow: {
          entry_point: 'greeter',
          inputs: [{ category: 'flow_input', input_schema: { user_name: { type: 'string' } } }],
        },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const config = Object.values(flow.nodes)[0].config as AgentNodeConfig;
      expect(config.parameterBindings![0].referencePath).toBe('context:user_name');
    });

    it('does not rewrite built-in context keys like goal', () => {
      const nodeId = 'node-1' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: nodeId,
        nodes: {
          [nodeId]: {
            id: nodeId,
            label: 'Step One',
            type: 'tool',
            position: { x: 0, y: 0 },
            config: {
              toolName: 'read_file',
              toolset: [],
              parameterBindings: [
                { parameter: 'goal', kind: 'reference', referencePath: 'context:goal' },
              ],
            } as ToolNodeConfig,
          },
        },
        edges: {},
        inputs: [{ name: 'goal', type: 'string' }],
      };

      const v1 = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1.components[0].inputs).toEqual([{ from: 'context:goal', as: 'goal' }]);
    });

    it('round-trips flow input references through load and save', () => {
      const v1 = makeMinimalV1({
        components: [
          {
            name: 'greeter',
            type: 'AgentComponent',
            prompt_id: 'p1',
            toolset: [],
            inputs: [{ from: 'context:inputs.flow_input.user_name', as: 'name' }],
          },
        ],
        routers: [{ from: 'greeter', to: 'end' }],
        flow: {
          entry_point: 'greeter',
          inputs: [{ category: 'flow_input', input_schema: { user_name: { type: 'string' } } }],
        },
      });

      const flow = converter.toFlow(v1)._unsafeUnwrap();
      const v1Output = converter.fromFlow(flow)._unsafeUnwrap() as FlowV1;
      expect(v1Output.components[0].inputs).toEqual([
        { from: 'context:inputs.flow_input.user_name', as: 'name' },
      ]);
    });
  });

  describe('fromFlow schema validation issues', () => {
    it('routes a malformed local prompt to its owning node with a localPrompt field path', () => {
      const analyzerId = 'analyzer-uuid' as NodeId;
      const flow: Flow = {
        id: 'default' as FlowId,
        entryPoint: analyzerId,
        nodes: {
          [analyzerId]: {
            id: analyzerId,
            label: 'Analyzer',
            type: 'agent',
            position: { x: 0, y: 0 },
            config: {
              promptMode: 'local',
              localPrompt: {
                name: 'Analyzer Prompt',
                promptTemplate: {
                  system: 'analyze',
                  // Required by InlinePromptSchema → triggers a Zod issue
                  // at prompts.0.prompt_template.user.
                  user: undefined as unknown as string,
                },
              } as InlinePromptDefinition,
              toolset: [],
            } satisfies AgentNodeConfig,
          },
        },
        edges: {},
      };

      const result = converter.fromFlow(flow);
      expect(result.isErr()).toBe(true);

      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('schema_validation');
      if (error.type !== 'schema_validation') return;

      expect(error.issues).toHaveLength(1);
      expect(error.issues[0]).toMatchObject({
        severity: 'error',
        code: 'flow.schema',
        nodeId: analyzerId,
        fieldPath: 'localPrompt.promptTemplate.user',
      });
    });
  });
});
