import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Node, Edge, NodeId, EdgeId } from '../types';
import { useUIStore } from './uiStore';
import { useGraphStore } from './graphStore';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(id: string): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type: 'agent',
    position: { x: 0, y: 0 },
  };
}

function createTestEdge(id: string, source: string, target: string): Edge {
  return {
    id: id as EdgeId,
    source: source as NodeId,
    target: target as NodeId,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('uiStore', () => {
  let uiStore: ReturnType<typeof useUIStore>;
  let graphStore: ReturnType<typeof useGraphStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    uiStore = useUIStore();
    graphStore = useGraphStore();
  });

  describe('initial state', () => {
    it('starts with no selection', () => {
      expect(uiStore.selectedElementId).toBeNull();
      expect(uiStore.selectedElement).toBeNull();
    });
  });

  describe('select', () => {
    it('selects a node by ID', () => {
      graphStore.addNode(createTestNode('node-1'));

      uiStore.select('node-1');

      expect(uiStore.selectedElementId).toBe('node-1');
    });

    it('selects an edge by ID', () => {
      graphStore.addNode(createTestNode('a'));
      graphStore.addNode(createTestNode('b'));
      graphStore.addEdge(createTestEdge('edge-1', 'a', 'b'));

      uiStore.select('edge-1');

      expect(uiStore.selectedElementId).toBe('edge-1');
    });

    it('changes selection', () => {
      graphStore.addNode(createTestNode('a'));
      graphStore.addNode(createTestNode('b'));

      uiStore.select('a');
      uiStore.select('b');

      expect(uiStore.selectedElementId).toBe('b');
    });

    it('allows selecting non-existent ID (resolved later)', () => {
      uiStore.select('not-yet-created');

      expect(uiStore.selectedElementId).toBe('not-yet-created');
      expect(uiStore.selectedElement).toBeNull(); // Can't resolve
    });
  });

  describe('clearSelection', () => {
    it('clears current selection', () => {
      uiStore.select('something');

      uiStore.clearSelection();

      expect(uiStore.selectedElementId).toBeNull();
    });
  });

  describe('selectedElement (computed)', () => {
    it('resolves to node when node is selected', () => {
      const node = createTestNode('my-node');
      graphStore.addNode(node);

      uiStore.select('my-node');

      expect(uiStore.selectedElement).toEqual({
        type: 'node',
        element: node,
      });
    });

    it('resolves to edge when edge is selected', () => {
      graphStore.addNode(createTestNode('a'));
      graphStore.addNode(createTestNode('b'));
      const edge = createTestEdge('my-edge', 'a', 'b');
      graphStore.addEdge(edge);

      uiStore.select('my-edge');

      expect(uiStore.selectedElement).toEqual({
        type: 'edge',
        element: edge,
      });
    });

    it('returns null when selection does not exist in graph', () => {
      uiStore.select('ghost');

      expect(uiStore.selectedElement).toBeNull();
    });

    it('returns null when nothing selected', () => {
      expect(uiStore.selectedElement).toBeNull();
    });

    it('prefers node over edge if IDs conflict (edge case)', () => {
      // This shouldn't happen in practice, but tests resolution order
      const node = createTestNode('conflict-id');
      graphStore.addNode(node);

      uiStore.select('conflict-id');

      expect(uiStore.selectedElement?.type).toBe('node');
    });
  });

  describe('validateSelection', () => {
    it('clears selection if selected element no longer exists', () => {
      graphStore.addNode(createTestNode('temp'));
      uiStore.select('temp');
      graphStore.removeNode('temp' as NodeId);

      uiStore.validateSelection();

      expect(uiStore.selectedElementId).toBeNull();
    });

    it('preserves selection if element still exists', () => {
      graphStore.addNode(createTestNode('permanent'));
      uiStore.select('permanent');

      uiStore.validateSelection();

      expect(uiStore.selectedElementId).toBe('permanent');
    });

    it('no-op when nothing selected', () => {
      uiStore.validateSelection();

      expect(uiStore.selectedElementId).toBeNull();
    });
  });

  describe('reactivity', () => {
    it('selectedElement updates when graph changes', () => {
      graphStore.addNode(createTestNode('reactive'));
      uiStore.select('reactive');

      const selected1 = uiStore.selectedElement;
      expect(selected1?.type).toBe('node');
      expect(selected1?.type === 'node' && selected1.element.label).toBe('node_reactive');

      graphStore.updateNode('reactive' as NodeId, { label: 'updated' });

      const selected2 = uiStore.selectedElement;
      expect(selected2?.type).toBe('node');
      expect(selected2?.type === 'node' && selected2.element.label).toBe('updated');
    });
  });
});
