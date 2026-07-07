import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePersistenceStore } from '../stores';
import type { Node, NodeId, Flow, NodeTypeDefinition } from '../types';
import { useFlow } from './useFlow';

// ═══════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    onNotification: vi.fn(),
  }),
  disposeFlowMessageBus: vi.fn(),
}));

vi.mock('../stores/executionStore', () => ({
  useExecutionStore: () => ({
    initializeListeners: vi.fn(),
    fetchContext: vi.fn().mockResolvedValue(undefined),
    startExecution: vi.fn().mockResolvedValue({ success: true }),
    stopExecution: vi.fn(),
    clear: vi.fn(),
    isExecuting: false,
    events: [],
    status: 'idle',
  }),
}));

// ═══════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════

function createTestNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type: 'agent',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}
const TEST_DEFINITIONS: NodeTypeDefinition[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'An agent node',
    ui: { color: '#3b82f6', icon: '🤖' },
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'A tool node',
    ui: { color: '#10b981', icon: '🔧' },
  },
  {
    type: 'ai-task',
    label: 'AI Task',
    description: 'An AI task node',
    ui: { color: '#f59e0b', icon: '✨' },
  },
] as NodeTypeDefinition[];

/**
 * Sets up test definitions in the persistence store.
 * MUST be called before any test that adds nodes.
 */
function setupDefinitions(): void {
  const persistenceStore = usePersistenceStore();
  persistenceStore.nodeTypeDefinitions = TEST_DEFINITIONS;
}

describe('useFlow composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupDefinitions();
  });

  describe('dirty tracking', () => {
    it('marks dirty on successful node mutation', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      expect(persistenceStore.isDirty).toBe(false);
      flow.addNode(createTestNode('a'));
      expect(persistenceStore.isDirty).toBe(true);
    });

    it('marks dirty on successful edge mutation', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      flow.addNode(createTestNode('a'));
      flow.addNode(createTestNode('b'));
      persistenceStore.markClean();

      flow.connectNodes('a' as NodeId, 'b' as NodeId);
      expect(persistenceStore.isDirty).toBe(true);
    });

    it('does NOT mark dirty on failed mutation', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      const result = flow.updateNode('nonexistent' as NodeId, { label: 'fail' });

      expect(result.success).toBe(false);
      expect(persistenceStore.isDirty).toBe(false);
    });

    it('marks dirty on entry point change', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      flow.addNode(createTestNode('a'));
      flow.addNode(createTestNode('b'));
      persistenceStore.markClean();

      flow.setEntryPoint('b' as NodeId);
      expect(persistenceStore.isDirty).toBe(true);
    });
  });

  describe('createNode', () => {
    it('creates node from type definition', () => {
      const flow = useFlow();

      const result = flow.createNode('agent', { x: 100, y: 200 });

      expect(result.success).toBe(true);
      expect(flow.nodes.value).toHaveLength(1);
      expect(flow.nodes.value[0]!.type).toBe('agent');
      expect(flow.nodes.value[0]!.position).toEqual({ x: 100, y: 200 });
    });

    it('returns error for unknown node type', () => {
      const flow = useFlow();

      const result = flow.createNode('unknown-type', { x: 0, y: 0 });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unknown node type: unknown-type');
    });

    it('auto-sets entry point for first node', () => {
      const flow = useFlow();

      flow.createNode('agent', { x: 0, y: 0 });

      expect(flow.flow.value.entryPoint).not.toBeNull();
    });
  });

  describe('connectNodes', () => {
    it('creates edge with generated ID', () => {
      const flow = useFlow();
      flow.addNode(createTestNode('a'));
      flow.addNode(createTestNode('b'));

      const result = flow.connectNodes('a' as NodeId, 'b' as NodeId);

      expect(result.success).toBe(true);
      expect(flow.edges.value).toHaveLength(1);
      expect(flow.edges.value[0]!.source).toBe('a');
      expect(flow.edges.value[0]!.target).toBe('b');
    });
  });

  describe('selection cleanup on removal', () => {
    it('clears selection when removing selected node', () => {
      const flow = useFlow();
      flow.addNode(createTestNode('a'));
      flow.select('a');

      flow.removeNode('a' as NodeId);

      expect(flow.selectedElementId.value).toBeNull();
    });

    it('clears selection when removing selected edge', () => {
      const flow = useFlow();
      flow.addNode(createTestNode('a'));
      flow.addNode(createTestNode('b'));
      flow.connectNodes('a' as NodeId, 'b' as NodeId);
      const edgeId = flow.edges.value[0]!.id;
      flow.select(edgeId);

      flow.removeEdge(edgeId);

      expect(flow.selectedElementId.value).toBeNull();
    });

    it('preserves selection when removing different element', () => {
      const flow = useFlow();
      flow.addNode(createTestNode('a'));
      flow.addNode(createTestNode('b'));
      flow.select('a');

      flow.removeNode('b' as NodeId);

      expect(flow.selectedElementId.value).toBe('a');
    });
  });

  describe('loadFlow coordination', () => {
    it('clears selection and marks clean', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      flow.addNode(createTestNode('old'));
      flow.select('old');
      // isDirty is true from addNode

      flow.loadFlow({
        id: 'new' as Flow['id'],
        entryPoint: null,
        nodes: {},
        edges: {},
      });

      expect(flow.selectedElementId.value).toBeNull();
      expect(persistenceStore.isDirty).toBe(false);
    });
  });

  describe('reset coordination', () => {
    it('clears graph, selection, and marks clean', () => {
      const flow = useFlow();
      const persistenceStore = usePersistenceStore();

      flow.addNode(createTestNode('a'));
      flow.select('a');

      flow.reset();

      expect(flow.nodes.value).toHaveLength(0);
      expect(flow.selectedElementId.value).toBeNull();
      expect(persistenceStore.isDirty).toBe(false);
    });
  });

  describe('vueFlowNodes transformation', () => {
    it('transforms IR nodes to VueFlow format with display info', () => {
      const flow = useFlow();
      flow.addNode(createTestNode('node-1', { type: 'agent' }));

      const vfNodes = flow.vueFlowNodes.value;

      // First node is the synthesized START node, second is our added node
      expect(vfNodes).toHaveLength(2);
      expect(vfNodes[0]).toMatchObject({
        id: '__start__',
        type: 'start',
      });
      expect(vfNodes[1]).toMatchObject({
        id: 'node-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          displayInfo: {
            color: '#3b82f6',
            icon: '🤖',
            label: 'Agent',
          },
        },
      });
    });
  });
});
