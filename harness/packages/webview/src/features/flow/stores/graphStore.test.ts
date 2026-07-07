import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Node, Edge, NodeId, EdgeId, Flow, FlowId } from '../types';
import { useGraphStore } from './graphStore';

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

// ============================================================================
// Tests
// ============================================================================

describe('graphStore', () => {
  let store: ReturnType<typeof useGraphStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useGraphStore();
  });

  // --------------------------------------------------------------------------
  // Initial State
  // --------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with empty flow', () => {
      expect(store.nodes).toEqual([]);
      expect(store.edges).toEqual([]);
      expect(store.flow.entryPoint).toBeNull();
    });

    it('reports valid with no errors', () => {
      expect(store.isValid).toBe(true);
      expect(store.hasErrors).toBe(false);
      expect(store.hasWarnings).toBe(false);
      expect(store.validationErrors).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Node Operations
  // --------------------------------------------------------------------------

  describe('addNode', () => {
    it('adds node to flow', () => {
      const node = createTestNode('a');

      const result = store.addNode(node);

      expect(result.success).toBe(true);
      expect(store.getNode('a' as NodeId)).toEqual(node);
      expect(store.nodeCount).toBe(1);
    });

    it('auto-sets entry point for first node', () => {
      store.addNode(createTestNode('first'));

      expect(store.flow.entryPoint).toBe('first');
    });

    it('does not override existing entry point', () => {
      store.addNode(createTestNode('first'));
      store.addNode(createTestNode('second'));

      expect(store.flow.entryPoint).toBe('first');
    });

    it('rejects duplicate node ID', () => {
      store.addNode(createTestNode('dup'));

      const result = store.addNode(createTestNode('dup'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Node with ID "dup" already exists');
      expect(store.nodeCount).toBe(1);
    });
  });

  describe('updateNode', () => {
    it('updates node properties', () => {
      store.addNode(createTestNode('a'));

      const result = store.updateNode('a' as NodeId, {
        label: 'updated',
        position: { x: 100, y: 200 },
      });

      expect(result.success).toBe(true);
      expect(store.getNode('a' as NodeId)).toMatchObject({
        label: 'updated',
        position: { x: 100, y: 200 },
      });
    });

    it('returns error for non-existent node', () => {
      const result = store.updateNode('missing' as NodeId, { label: 'x' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Node "missing" not found');
    });
  });

  describe('removeNode', () => {
    it('removes node from flow', () => {
      store.addNode(createTestNode('a'));

      const result = store.removeNode('a' as NodeId);

      expect(result.success).toBe(true);
      expect(store.getNode('a' as NodeId)).toBeUndefined();
      expect(store.nodeCount).toBe(0);
    });

    it('removes connected edges (cascade)', () => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));
      store.addNode(createTestNode('c'));
      store.addEdge(createTestEdge('e1', 'a', 'b'));
      store.addEdge(createTestEdge('e2', 'b', 'c'));

      store.removeNode('b' as NodeId);

      expect(store.edgeCount).toBe(0);
    });

    it('clears entry point if removing entry node', () => {
      store.addNode(createTestNode('entry'));
      expect(store.flow.entryPoint).toBe('entry');

      store.removeNode('entry' as NodeId);

      expect(store.flow.entryPoint).toBeNull();
    });

    it('returns error for non-existent node', () => {
      const result = store.removeNode('missing' as NodeId);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Node "missing" not found');
    });
  });

  describe('batchUpdateNodes', () => {
    it('updates multiple nodes atomically', () => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));

      const result = store.batchUpdateNodes({
        ['a' as NodeId]: { position: { x: 10, y: 10 } },
        ['b' as NodeId]: { position: { x: 20, y: 20 } },
      });

      expect(result.success).toBe(true);
      expect(store.getNode('a' as NodeId)?.position).toEqual({ x: 10, y: 10 });
      expect(store.getNode('b' as NodeId)?.position).toEqual({ x: 20, y: 20 });
    });

    it('collects errors from failed updates', () => {
      store.addNode(createTestNode('a'));

      const result = store.batchUpdateNodes({
        ['a' as NodeId]: { label: 'ok' },
        ['missing' as NodeId]: { label: 'fail' },
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Node "missing" not found');
      // Successful updates still applied
      expect(store.getNode('a' as NodeId)?.label).toBe('ok');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Operations
  // --------------------------------------------------------------------------

  describe('addEdge', () => {
    beforeEach(() => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));
      store.addNode(createTestNode('c'));
    });

    it('adds edge between existing nodes', () => {
      const edge = createTestEdge('e1', 'a', 'b');

      const result = store.addEdge(edge);

      expect(result.success).toBe(true);
      expect(store.getEdge('e1' as EdgeId)).toEqual(edge);
      expect(store.edgeCount).toBe(1);
    });

    it('rejects duplicate edge ID', () => {
      store.addEdge(createTestEdge('e1', 'a', 'b'));

      const result = store.addEdge(createTestEdge('e1', 'b', 'c'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Edge with ID "e1" already exists');
    });

    it('rejects edge to non-existent source', () => {
      const result = store.addEdge(createTestEdge('e1', 'missing', 'b'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Source node "missing" not found');
    });

    it('rejects edge to non-existent target', () => {
      const result = store.addEdge(createTestEdge('e1', 'a', 'missing'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Target node "missing" not found');
    });

    it('rejects self-loop', () => {
      const result = store.addEdge(createTestEdge('e1', 'a', 'a'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Cannot connect a node to itself');
    });

    it('rejects edge that would create cycle', () => {
      store.addEdge(createTestEdge('e1', 'a', 'b'));
      store.addEdge(createTestEdge('e2', 'b', 'c'));

      const result = store.addEdge(createTestEdge('e3', 'c', 'a'));

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Connection would create a cycle');
    });
  });

  describe('updateEdge', () => {
    beforeEach(() => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));
      store.addEdge(createTestEdge('e1', 'a', 'b'));
    });

    it('updates edge properties', () => {
      const result = store.updateEdge('e1' as EdgeId, {
        label: 'success',
        condition: '{"input": "status", "value": "ok"}',
      });

      expect(result.success).toBe(true);
      expect(store.getEdge('e1' as EdgeId)).toMatchObject({
        label: 'success',
        condition: '{"input": "status", "value": "ok"}',
      });
    });

    it('returns error for non-existent edge', () => {
      const result = store.updateEdge('missing' as EdgeId, { label: 'x' });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Edge "missing" not found');
    });
  });

  describe('removeEdge', () => {
    beforeEach(() => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));
      store.addEdge(createTestEdge('e1', 'a', 'b'));
    });

    it('removes edge from flow', () => {
      const result = store.removeEdge('e1' as EdgeId);

      expect(result.success).toBe(true);
      expect(store.getEdge('e1' as EdgeId)).toBeUndefined();
      expect(store.edgeCount).toBe(0);
    });

    it('returns error for non-existent edge', () => {
      const result = store.removeEdge('missing' as EdgeId);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Edge "missing" not found');
    });
  });

  // --------------------------------------------------------------------------
  // Entry Point
  // --------------------------------------------------------------------------

  describe('setEntryPoint', () => {
    it('sets entry point to existing node', () => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));

      const result = store.setEntryPoint('b' as NodeId);

      expect(result.success).toBe(true);
      expect(store.flow.entryPoint).toBe('b');
    });

    it('clears entry point when set to null', () => {
      store.addNode(createTestNode('a'));

      const result = store.setEntryPoint(null);

      expect(result.success).toBe(true);
      expect(store.flow.entryPoint).toBeNull();
    });

    it('returns error for non-existent node', () => {
      const result = store.setEntryPoint('missing' as NodeId);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Node "missing" not found');
    });
  });

  // --------------------------------------------------------------------------
  // Flow Management
  // --------------------------------------------------------------------------

  describe('loadFlow', () => {
    it('replaces entire flow state', () => {
      store.addNode(createTestNode('old'));

      const newFlow = createTestFlow({
        entryPoint: 'new' as NodeId,
        nodes: { ['new' as NodeId]: createTestNode('new') } as Flow['nodes'],
      });

      store.loadFlow(newFlow);

      expect(store.getNode('old' as NodeId)).toBeUndefined();
      expect(store.getNode('new' as NodeId)).toBeDefined();
      expect(store.flow.entryPoint).toBe('new');
    });
  });

  describe('reset', () => {
    it('resets to empty flow', () => {
      store.addNode(createTestNode('a'));
      store.addNode(createTestNode('b'));
      store.addEdge(createTestEdge('e1', 'a', 'b'));

      store.reset();

      expect(store.nodeCount).toBe(0);
      expect(store.edgeCount).toBe(0);
      expect(store.flow.entryPoint).toBeNull();
    });
  });

  describe('snapshot/restore', () => {
    it('creates deep clone for undo stack', () => {
      store.addNode(createTestNode('a'));
      const snapshot = store.snapshot();

      store.updateNode('a' as NodeId, { label: 'modified' });

      // Snapshot should be unaffected
      expect(snapshot.nodes['a' as NodeId]?.label).toBe('node_a');
      expect(store.getNode('a' as NodeId)?.label).toBe('modified');
    });

    it('restores previous state', () => {
      store.addNode(createTestNode('a'));
      const snapshot = store.snapshot();

      store.addNode(createTestNode('b'));
      store.removeNode('a' as NodeId);

      store.restore(snapshot);

      expect(store.getNode('a' as NodeId)).toBeDefined();
      expect(store.getNode('b' as NodeId)).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  describe('validation', () => {
    it('warns about unreachable nodes', () => {
      store.addNode(createTestNode('entry'));
      store.addNode(createTestNode('orphan'));

      expect(store.hasWarnings).toBe(true);
      expect(store.validationErrors).toContainEqual(
        expect.objectContaining({
          type: 'warning',
          nodeId: 'orphan',
        }),
      );
    });

    it('errors on invalid entry point reference', () => {
      store.addNode(createTestNode('a'));
      store.flow.entryPoint = 'missing' as NodeId;

      expect(store.hasErrors).toBe(true);
      expect(store.isValid).toBe(false);
    });
  });

  describe('setFlowInputs rename cascade', () => {
    function setupAgentWithBinding(referencePath: string) {
      store.addNode(
        createTestNode('agent', {
          config: {
            parameterBindings: [{ parameter: 'slot', kind: 'reference', referencePath }],
          },
        }),
      );
    }

    it('cascades renames into reference bindings (bare path)', () => {
      store.setFlowInputs([{ name: 'user_input', type: 'string' }]);
      setupAgentWithBinding('context:user_input');

      store.setFlowInputs([{ name: 'question', type: 'string' }]);

      const bindings = (
        store.flow.nodes['agent' as NodeId]!.config as {
          parameterBindings: { referencePath?: string }[];
        }
      ).parameterBindings;
      expect(bindings[0]!.referencePath).toBe('context:question');
    });

    it('cascades renames when the path has a dot suffix', () => {
      store.setFlowInputs([{ name: 'user_input', type: 'string' }]);
      setupAgentWithBinding('context:user_input.field');

      store.setFlowInputs([{ name: 'question', type: 'string' }]);

      const bindings = (
        store.flow.nodes['agent' as NodeId]!.config as {
          parameterBindings: { referencePath?: string }[];
        }
      ).parameterBindings;
      expect(bindings[0]!.referencePath).toBe('context:question.field');
    });

    it('does NOT cascade when an input is deleted (length shrinks)', () => {
      store.setFlowInputs([{ name: 'user_input', type: 'string' }]);
      setupAgentWithBinding('context:user_input');

      store.setFlowInputs([]);

      const bindings = (
        store.flow.nodes['agent' as NodeId]!.config as {
          parameterBindings: { referencePath?: string }[];
        }
      ).parameterBindings;
      // Binding points at a name that no longer exists — pill goes broken.
      expect(bindings[0]!.referencePath).toBe('context:user_input');
    });

    it('handles simultaneous swaps (a → b, b → a) atomically', () => {
      store.setFlowInputs([
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ]);
      store.addNode(
        createTestNode('agent', {
          config: {
            parameterBindings: [
              { parameter: 'x', kind: 'reference', referencePath: 'context:a' },
              { parameter: 'y', kind: 'reference', referencePath: 'context:b' },
            ],
          },
        }),
      );

      store.setFlowInputs([
        { name: 'b', type: 'string' },
        { name: 'a', type: 'string' },
      ]);

      const bindings = (
        store.flow.nodes['agent' as NodeId]!.config as {
          parameterBindings: { parameter: string; referencePath?: string }[];
        }
      ).parameterBindings;
      expect(bindings.find((b) => b.parameter === 'x')!.referencePath).toBe('context:b');
      expect(bindings.find((b) => b.parameter === 'y')!.referencePath).toBe('context:a');
    });

    it('does not touch literal or unbound bindings', () => {
      store.setFlowInputs([{ name: 'user_input', type: 'string' }]);
      store.addNode(
        createTestNode('agent', {
          config: {
            parameterBindings: [
              { parameter: 'a', kind: 'literal', literalValue: 'hello' },
              { parameter: 'b', kind: 'unbound' },
            ],
          },
        }),
      );

      store.setFlowInputs([{ name: 'question', type: 'string' }]);

      const bindings = (
        store.flow.nodes['agent' as NodeId]!.config as {
          parameterBindings: { parameter: string; kind: string }[];
        }
      ).parameterBindings;
      expect(bindings[0]!.kind).toBe('literal');
      expect(bindings[1]!.kind).toBe('unbound');
    });
  });
});
