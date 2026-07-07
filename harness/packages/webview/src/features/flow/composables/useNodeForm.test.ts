import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computed, ref } from 'vue';
import type { Node, NodeId, FlowId, Flow, ParameterBinding, ToolNodeConfig } from '../types';
import { useNodeForm } from './useNodeForm';

// ─── Mock useFlow ───────────────────────────────────────────────────────────

const mockUpdateNode = vi.fn();

vi.mock('./useFlow', () => ({
  useFlow: () => ({
    updateNode: mockUpdateNode,
    flow: ref<Flow>({
      id: 'test' as FlowId,
      entryPoint: 'T' as NodeId,
      nodes: {},
      edges: {},
    }),
    nodeTypeDefinitions: ref([]),
    toolDefinitions: ref([]),
    runtimeProvidedVariableDefinitions: ref([]),
    getNodeValidation: () => undefined,
  }),
}));

vi.mock('../utils/outputCatalog', () => ({
  buildAvailableOutputs: () => [],
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createToolNode(bindings: ParameterBinding[] = []): Node {
  return {
    id: 'T' as NodeId,
    label: 'reader',
    type: 'tool',
    position: { x: 0, y: 0 },
    config: {
      toolName: 'read_file',
      parameterBindings: bindings,
    },
  };
}

function lastConfigUpdate(): Record<string, unknown> {
  const { lastCall } = mockUpdateNode.mock;
  if (!lastCall) throw new Error('updateNode was never called');
  return (lastCall[1] as { config: Record<string, unknown> }).config;
}

function lastBindings(): ParameterBinding[] {
  return lastConfigUpdate().parameterBindings as ParameterBinding[];
}

function findBinding(bindings: ParameterBinding[], parameter: string): ParameterBinding {
  const found = bindings.find((b) => b.parameter === parameter);
  if (!found) throw new Error(`Binding "${parameter}" not found`);
  return found;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useNodeForm', () => {
  beforeEach(() => {
    mockUpdateNode.mockClear();
  });

  describe('handleBindingUpdate', () => {
    it('creates a new binding with correct kind', () => {
      const node = createToolNode([]);
      const nodeRef = computed(() => node);
      const { handleBindingUpdate } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingUpdate('encoding', { kind: 'literal', literalValue: 'utf-8' });

      const bindings = lastBindings();
      const encoding = findBinding(bindings, 'encoding');
      expect(encoding.kind).toBe('literal');
      expect(encoding.literalValue).toBe('utf-8');
    });

    it('defaults to unbound kind for new bindings without explicit kind', () => {
      const node = createToolNode([]);
      const nodeRef = computed(() => node);
      const { handleBindingUpdate } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingUpdate('new_param', {});

      const bindings = lastBindings();
      const newParam = findBinding(bindings, 'new_param');
      expect(newParam.kind).toBe('unbound');
    });

    it('does not clobber kind when update contains kind: undefined', () => {
      const node = createToolNode([
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ]);
      const nodeRef = computed(() => node);
      const { handleBindingUpdate } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingUpdate('encoding', { kind: undefined, literalValue: 'ascii' });

      const bindings = lastBindings();
      const encoding = findBinding(bindings, 'encoding');
      expect(encoding.kind).toBe('literal');
      expect(encoding.literalValue).toBe('ascii');
    });

    it('preserves existing bindings when updating one', () => {
      const node = createToolNode([
        { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/a.txt' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ]);
      const nodeRef = computed(() => node);
      const { handleBindingUpdate } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingUpdate('encoding', { kind: 'literal', literalValue: 'ascii' });

      const bindings = lastBindings();
      expect(bindings).toHaveLength(2);
      expect(findBinding(bindings, 'file_path').literalValue).toBe('/tmp/a.txt');
      expect(findBinding(bindings, 'encoding').literalValue).toBe('ascii');
    });
  });

  describe('handleBindingRemove', () => {
    it('removes a binding by parameter name', () => {
      const node = createToolNode([
        { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/a.txt' },
        { parameter: 'encoding', kind: 'literal', literalValue: 'utf-8' },
      ]);
      const nodeRef = computed(() => node);
      const { handleBindingRemove } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingRemove('file_path');

      const bindings = lastBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0]).toMatchObject({ parameter: 'encoding' });
    });

    it('produces empty array when removing the last binding', () => {
      const node = createToolNode([
        { parameter: 'file_path', kind: 'literal', literalValue: '/tmp/a.txt' },
      ]);
      const nodeRef = computed(() => node);
      const { handleBindingRemove } = useNodeForm<ToolNodeConfig>(nodeRef);

      handleBindingRemove('file_path');

      const bindings = lastBindings();
      expect(bindings).toEqual([]);
    });
  });
});
