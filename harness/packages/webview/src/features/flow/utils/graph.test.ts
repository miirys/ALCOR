import { describe, it, expect } from 'vitest';
import type { Node, Edge, NodeId, EdgeId, Flow, FlowId } from '../types';
import {
  getIncomingEdges,
  getOutgoingEdges,
  getUpstreamNodes,
  getDownstreamNodes,
  canReach,
  getTopologicalOrder,
  getNodesAtDepth,
  hasCycle,
} from './graph';

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

/**
 * Create a linear chain: A → B → C → D
 */
function createLinearChain(): Flow {
  const nodes = {
    ['A' as NodeId]: createTestNode('A'),
    ['B' as NodeId]: createTestNode('B'),
    ['C' as NodeId]: createTestNode('C'),
    ['D' as NodeId]: createTestNode('D'),
  } as Flow['nodes'];

  const edges = {
    ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
    ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
    ['e3' as EdgeId]: createTestEdge('e3', 'C', 'D'),
  } as Flow['edges'];

  return createTestFlow({
    entryPoint: 'A' as NodeId,
    nodes,
    edges,
  });
}

/**
 * Create a diamond pattern:
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 */
function createDiamondPattern(): Flow {
  const nodes = {
    ['A' as NodeId]: createTestNode('A'),
    ['B' as NodeId]: createTestNode('B'),
    ['C' as NodeId]: createTestNode('C'),
    ['D' as NodeId]: createTestNode('D'),
  } as Flow['nodes'];

  const edges = {
    ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
    ['e2' as EdgeId]: createTestEdge('e2', 'A', 'C'),
    ['e3' as EdgeId]: createTestEdge('e3', 'B', 'D'),
    ['e4' as EdgeId]: createTestEdge('e4', 'C', 'D'),
  } as Flow['edges'];

  return createTestFlow({
    entryPoint: 'A' as NodeId,
    nodes,
    edges,
  });
}

/**
 * Create disconnected subgraphs:
 * Subgraph 1: A → B → C
 * Subgraph 2: X → Y (disconnected)
 */
function createDisconnectedGraph(): Flow {
  const nodes = {
    ['A' as NodeId]: createTestNode('A'),
    ['B' as NodeId]: createTestNode('B'),
    ['C' as NodeId]: createTestNode('C'),
    ['X' as NodeId]: createTestNode('X'),
    ['Y' as NodeId]: createTestNode('Y'),
  } as Flow['nodes'];

  const edges = {
    ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
    ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
    ['e3' as EdgeId]: createTestEdge('e3', 'X', 'Y'),
  } as Flow['edges'];

  return createTestFlow({
    entryPoint: 'A' as NodeId,
    nodes,
    edges,
  });
}

/**
 * Create a graph with a cycle: A → B → C → A
 */
function createCyclicGraph(): Flow {
  const nodes = {
    ['A' as NodeId]: createTestNode('A'),
    ['B' as NodeId]: createTestNode('B'),
    ['C' as NodeId]: createTestNode('C'),
  } as Flow['nodes'];

  const edges = {
    ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
    ['e2' as EdgeId]: createTestEdge('e2', 'B', 'C'),
    ['e3' as EdgeId]: createTestEdge('e3', 'C', 'A'),
  } as Flow['edges'];

  return createTestFlow({
    entryPoint: 'A' as NodeId,
    nodes,
    edges,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('graph utilities', () => {
  // --------------------------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------------------------

  describe('getIncomingEdges', () => {
    it('returns empty array for node with no incoming edges', () => {
      const flow = createLinearChain();
      const edges = getIncomingEdges(flow, 'A');
      expect(edges).toEqual([]);
    });

    it('returns incoming edges for node', () => {
      const flow = createLinearChain();
      const edges = getIncomingEdges(flow, 'B');
      expect(edges).toHaveLength(1);
      expect(edges[0]?.source).toBe('A');
    });

    it('returns multiple incoming edges for diamond pattern', () => {
      const flow = createDiamondPattern();
      const edges = getIncomingEdges(flow, 'D');
      expect(edges).toHaveLength(2);
      const sources = edges.map((e) => e.source);
      expect(sources).toContain('B');
      expect(sources).toContain('C');
    });

    it('returns empty array for non-existent node', () => {
      const flow = createLinearChain();
      const edges = getIncomingEdges(flow, 'nonexistent');
      expect(edges).toEqual([]);
    });
  });

  describe('getOutgoingEdges', () => {
    it('returns empty array for node with no outgoing edges', () => {
      const flow = createLinearChain();
      const edges = getOutgoingEdges(flow, 'D');
      expect(edges).toEqual([]);
    });

    it('returns outgoing edges for node', () => {
      const flow = createLinearChain();
      const edges = getOutgoingEdges(flow, 'A');
      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe('B');
    });

    it('returns multiple outgoing edges for diamond pattern', () => {
      const flow = createDiamondPattern();
      const edges = getOutgoingEdges(flow, 'A');
      expect(edges).toHaveLength(2);
      const targets = edges.map((e) => e.target);
      expect(targets).toContain('B');
      expect(targets).toContain('C');
    });

    it('returns empty array for non-existent node', () => {
      const flow = createLinearChain();
      const edges = getOutgoingEdges(flow, 'nonexistent');
      expect(edges).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Empty Graph Tests
  // --------------------------------------------------------------------------

  describe('empty graph', () => {
    it('getUpstreamNodes returns empty set', () => {
      const flow = createTestFlow();
      const result = getUpstreamNodes(flow, 'any' as NodeId);
      expect(result.size).toBe(0);
    });

    it('getDownstreamNodes returns empty set', () => {
      const flow = createTestFlow();
      const result = getDownstreamNodes(flow, 'any' as NodeId);
      expect(result.size).toBe(0);
    });

    it('canReach returns false', () => {
      const flow = createTestFlow();
      expect(canReach(flow, 'A' as NodeId, 'B' as NodeId)).toBe(false);
    });

    it('getTopologicalOrder returns empty array', () => {
      const flow = createTestFlow();
      const result = getTopologicalOrder(flow);
      expect(result).toEqual([]);
    });

    it('getNodesAtDepth returns empty array', () => {
      const flow = createTestFlow();
      expect(getNodesAtDepth(flow, 0)).toEqual([]);
      expect(getNodesAtDepth(flow, 1)).toEqual([]);
    });

    it('hasCycle returns false', () => {
      const flow = createTestFlow();
      expect(hasCycle(flow)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Single Node Tests
  // --------------------------------------------------------------------------

  describe('single node', () => {
    function createSingleNode(): Flow {
      return createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes: { ['A' as NodeId]: createTestNode('A') } as Flow['nodes'],
      });
    }

    it('getUpstreamNodes returns empty set (node has no ancestors)', () => {
      const flow = createSingleNode();
      const result = getUpstreamNodes(flow, 'A' as NodeId);
      expect(result.size).toBe(0);
    });

    it('getDownstreamNodes returns empty set (node has no descendants)', () => {
      const flow = createSingleNode();
      const result = getDownstreamNodes(flow, 'A' as NodeId);
      expect(result.size).toBe(0);
    });

    it('canReach returns false for self', () => {
      const flow = createSingleNode();
      expect(canReach(flow, 'A' as NodeId, 'A' as NodeId)).toBe(false);
    });

    it('getTopologicalOrder returns single node', () => {
      const flow = createSingleNode();
      const result = getTopologicalOrder(flow);
      expect(result).toEqual(['A']);
    });

    it('getNodesAtDepth(0) returns entry point', () => {
      const flow = createSingleNode();
      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);
    });

    it('getNodesAtDepth(1) returns empty array', () => {
      const flow = createSingleNode();
      expect(getNodesAtDepth(flow, 1)).toEqual([]);
    });

    it('hasCycle returns false', () => {
      const flow = createSingleNode();
      expect(hasCycle(flow)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Linear Chain Tests (A → B → C → D)
  // --------------------------------------------------------------------------

  describe('linear chain (A → B → C → D)', () => {
    it('getUpstreamNodes returns all ancestors', () => {
      const flow = createLinearChain();

      expect(getUpstreamNodes(flow, 'A' as NodeId).size).toBe(0);

      const upstreamB = getUpstreamNodes(flow, 'B' as NodeId);
      expect(upstreamB.size).toBe(1);
      expect(upstreamB.has('A' as NodeId)).toBe(true);

      const upstreamC = getUpstreamNodes(flow, 'C' as NodeId);
      expect(upstreamC.size).toBe(2);
      expect(upstreamC.has('A' as NodeId)).toBe(true);
      expect(upstreamC.has('B' as NodeId)).toBe(true);

      const upstreamD = getUpstreamNodes(flow, 'D' as NodeId);
      expect(upstreamD.size).toBe(3);
      expect(upstreamD.has('A' as NodeId)).toBe(true);
      expect(upstreamD.has('B' as NodeId)).toBe(true);
      expect(upstreamD.has('C' as NodeId)).toBe(true);
    });

    it('getDownstreamNodes returns all descendants', () => {
      const flow = createLinearChain();

      const downstreamA = getDownstreamNodes(flow, 'A' as NodeId);
      expect(downstreamA.size).toBe(3);
      expect(downstreamA.has('B' as NodeId)).toBe(true);
      expect(downstreamA.has('C' as NodeId)).toBe(true);
      expect(downstreamA.has('D' as NodeId)).toBe(true);

      const downstreamB = getDownstreamNodes(flow, 'B' as NodeId);
      expect(downstreamB.size).toBe(2);
      expect(downstreamB.has('C' as NodeId)).toBe(true);
      expect(downstreamB.has('D' as NodeId)).toBe(true);

      const downstreamC = getDownstreamNodes(flow, 'C' as NodeId);
      expect(downstreamC.size).toBe(1);
      expect(downstreamC.has('D' as NodeId)).toBe(true);

      expect(getDownstreamNodes(flow, 'D' as NodeId).size).toBe(0);
    });

    it('canReach returns correct values', () => {
      const flow = createLinearChain();

      // Forward paths exist
      expect(canReach(flow, 'A' as NodeId, 'B' as NodeId)).toBe(true);
      expect(canReach(flow, 'A' as NodeId, 'C' as NodeId)).toBe(true);
      expect(canReach(flow, 'A' as NodeId, 'D' as NodeId)).toBe(true);
      expect(canReach(flow, 'B' as NodeId, 'D' as NodeId)).toBe(true);

      // Backward paths don't exist
      expect(canReach(flow, 'D' as NodeId, 'A' as NodeId)).toBe(false);
      expect(canReach(flow, 'C' as NodeId, 'A' as NodeId)).toBe(false);
      expect(canReach(flow, 'B' as NodeId, 'A' as NodeId)).toBe(false);

      // Self-loops
      expect(canReach(flow, 'A' as NodeId, 'A' as NodeId)).toBe(false);
    });

    it('getTopologicalOrder returns valid order', () => {
      const flow = createLinearChain();
      const order = getTopologicalOrder(flow);

      expect(order).not.toBeNull();
      expect(order).toHaveLength(4);

      // A must come before B, B before C, C before D
      const indexA = order!.indexOf('A' as NodeId);
      const indexB = order!.indexOf('B' as NodeId);
      const indexC = order!.indexOf('C' as NodeId);
      const indexD = order!.indexOf('D' as NodeId);

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
      expect(indexC).toBeLessThan(indexD);
    });

    it('getNodesAtDepth returns correct nodes', () => {
      const flow = createLinearChain();

      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);
      expect(getNodesAtDepth(flow, 1)).toEqual(['B']);
      expect(getNodesAtDepth(flow, 2)).toEqual(['C']);
      expect(getNodesAtDepth(flow, 3)).toEqual(['D']);
      expect(getNodesAtDepth(flow, 4)).toEqual([]);
    });

    it('hasCycle returns false', () => {
      const flow = createLinearChain();
      expect(hasCycle(flow)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Diamond Pattern Tests
  // --------------------------------------------------------------------------

  describe('diamond pattern (A → B,C → D)', () => {
    it('getUpstreamNodes returns all ancestors', () => {
      const flow = createDiamondPattern();

      expect(getUpstreamNodes(flow, 'A' as NodeId).size).toBe(0);

      const upstreamB = getUpstreamNodes(flow, 'B' as NodeId);
      expect(upstreamB.size).toBe(1);
      expect(upstreamB.has('A' as NodeId)).toBe(true);

      const upstreamC = getUpstreamNodes(flow, 'C' as NodeId);
      expect(upstreamC.size).toBe(1);
      expect(upstreamC.has('A' as NodeId)).toBe(true);

      const upstreamD = getUpstreamNodes(flow, 'D' as NodeId);
      expect(upstreamD.size).toBe(3);
      expect(upstreamD.has('A' as NodeId)).toBe(true);
      expect(upstreamD.has('B' as NodeId)).toBe(true);
      expect(upstreamD.has('C' as NodeId)).toBe(true);
    });

    it('getDownstreamNodes returns all descendants', () => {
      const flow = createDiamondPattern();

      const downstreamA = getDownstreamNodes(flow, 'A' as NodeId);
      expect(downstreamA.size).toBe(3);
      expect(downstreamA.has('B' as NodeId)).toBe(true);
      expect(downstreamA.has('C' as NodeId)).toBe(true);
      expect(downstreamA.has('D' as NodeId)).toBe(true);

      const downstreamB = getDownstreamNodes(flow, 'B' as NodeId);
      expect(downstreamB.size).toBe(1);
      expect(downstreamB.has('D' as NodeId)).toBe(true);

      const downstreamC = getDownstreamNodes(flow, 'C' as NodeId);
      expect(downstreamC.size).toBe(1);
      expect(downstreamC.has('D' as NodeId)).toBe(true);

      expect(getDownstreamNodes(flow, 'D' as NodeId).size).toBe(0);
    });

    it('canReach works through multiple paths', () => {
      const flow = createDiamondPattern();

      // A can reach D through both B and C
      expect(canReach(flow, 'A' as NodeId, 'D' as NodeId)).toBe(true);

      // B and C cannot reach each other (siblings)
      expect(canReach(flow, 'B' as NodeId, 'C' as NodeId)).toBe(false);
      expect(canReach(flow, 'C' as NodeId, 'B' as NodeId)).toBe(false);
    });

    it('getTopologicalOrder returns valid order', () => {
      const flow = createDiamondPattern();
      const order = getTopologicalOrder(flow);

      expect(order).not.toBeNull();
      expect(order).toHaveLength(4);

      const indexA = order!.indexOf('A' as NodeId);
      const indexB = order!.indexOf('B' as NodeId);
      const indexC = order!.indexOf('C' as NodeId);
      const indexD = order!.indexOf('D' as NodeId);

      // A must come before B, C, and D
      expect(indexA).toBeLessThan(indexB);
      expect(indexA).toBeLessThan(indexC);
      expect(indexA).toBeLessThan(indexD);

      // B and C must come before D
      expect(indexB).toBeLessThan(indexD);
      expect(indexC).toBeLessThan(indexD);
    });

    it('getNodesAtDepth handles branching', () => {
      const flow = createDiamondPattern();

      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);

      const depth1 = getNodesAtDepth(flow, 1);
      expect(depth1).toHaveLength(2);
      expect(depth1).toContain('B');
      expect(depth1).toContain('C');

      expect(getNodesAtDepth(flow, 2)).toEqual(['D']);
      expect(getNodesAtDepth(flow, 3)).toEqual([]);
    });

    it('hasCycle returns false', () => {
      const flow = createDiamondPattern();
      expect(hasCycle(flow)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Disconnected Subgraphs Tests
  // --------------------------------------------------------------------------

  describe('disconnected subgraphs', () => {
    it('getUpstreamNodes only includes connected nodes', () => {
      const flow = createDisconnectedGraph();

      // C's upstream is only A and B
      const upstreamC = getUpstreamNodes(flow, 'C' as NodeId);
      expect(upstreamC.size).toBe(2);
      expect(upstreamC.has('A' as NodeId)).toBe(true);
      expect(upstreamC.has('B' as NodeId)).toBe(true);
      expect(upstreamC.has('X' as NodeId)).toBe(false);
      expect(upstreamC.has('Y' as NodeId)).toBe(false);

      // Y's upstream is only X
      const upstreamY = getUpstreamNodes(flow, 'Y' as NodeId);
      expect(upstreamY.size).toBe(1);
      expect(upstreamY.has('X' as NodeId)).toBe(true);
    });

    it('getDownstreamNodes only includes connected nodes', () => {
      const flow = createDisconnectedGraph();

      // A's downstream is only B and C
      const downstreamA = getDownstreamNodes(flow, 'A' as NodeId);
      expect(downstreamA.size).toBe(2);
      expect(downstreamA.has('B' as NodeId)).toBe(true);
      expect(downstreamA.has('C' as NodeId)).toBe(true);
      expect(downstreamA.has('X' as NodeId)).toBe(false);

      // X's downstream is only Y
      const downstreamX = getDownstreamNodes(flow, 'X' as NodeId);
      expect(downstreamX.size).toBe(1);
      expect(downstreamX.has('Y' as NodeId)).toBe(true);
    });

    it('canReach returns false across disconnected components', () => {
      const flow = createDisconnectedGraph();

      expect(canReach(flow, 'A' as NodeId, 'X' as NodeId)).toBe(false);
      expect(canReach(flow, 'A' as NodeId, 'Y' as NodeId)).toBe(false);
      expect(canReach(flow, 'X' as NodeId, 'A' as NodeId)).toBe(false);
      expect(canReach(flow, 'C' as NodeId, 'Y' as NodeId)).toBe(false);
    });

    it('getTopologicalOrder includes all nodes', () => {
      const flow = createDisconnectedGraph();
      const order = getTopologicalOrder(flow);

      expect(order).not.toBeNull();
      expect(order).toHaveLength(5);

      // Both subgraphs should have valid orderings within themselves
      const indexA = order!.indexOf('A' as NodeId);
      const indexB = order!.indexOf('B' as NodeId);
      const indexC = order!.indexOf('C' as NodeId);
      const indexX = order!.indexOf('X' as NodeId);
      const indexY = order!.indexOf('Y' as NodeId);

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
      expect(indexX).toBeLessThan(indexY);
    });

    it('getNodesAtDepth only traverses from entry point', () => {
      const flow = createDisconnectedGraph();

      // Entry point is A, so X and Y are never reached
      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);
      expect(getNodesAtDepth(flow, 1)).toEqual(['B']);
      expect(getNodesAtDepth(flow, 2)).toEqual(['C']);
      // X and Y are not reachable from entry point
    });
  });

  // --------------------------------------------------------------------------
  // Cycle Detection Tests
  // --------------------------------------------------------------------------

  describe('cycle detection', () => {
    it('getUpstreamNodes handles cycles gracefully', () => {
      const flow = createCyclicGraph();

      // In a cycle A → B → C → A, all nodes are upstream of each other
      // including A itself (reachable through C → A via the cycle)
      const upstreamA = getUpstreamNodes(flow, 'A' as NodeId);
      expect(upstreamA.size).toBe(3);
      expect(upstreamA.has('A' as NodeId)).toBe(true);
      expect(upstreamA.has('B' as NodeId)).toBe(true);
      expect(upstreamA.has('C' as NodeId)).toBe(true);
    });

    it('getDownstreamNodes handles cycles gracefully', () => {
      const flow = createCyclicGraph();

      // In a cycle A → B → C → A, all nodes are downstream of each other
      // including A itself (reachable through C → A via the cycle)
      const downstreamA = getDownstreamNodes(flow, 'A' as NodeId);
      expect(downstreamA.size).toBe(3);
      expect(downstreamA.has('A' as NodeId)).toBe(true);
      expect(downstreamA.has('B' as NodeId)).toBe(true);
      expect(downstreamA.has('C' as NodeId)).toBe(true);
    });

    it('canReach works in cyclic graph', () => {
      const flow = createCyclicGraph();

      // In a cycle, every node can reach every other node
      expect(canReach(flow, 'A' as NodeId, 'B' as NodeId)).toBe(true);
      expect(canReach(flow, 'A' as NodeId, 'C' as NodeId)).toBe(true);
      expect(canReach(flow, 'B' as NodeId, 'A' as NodeId)).toBe(true);
      expect(canReach(flow, 'C' as NodeId, 'A' as NodeId)).toBe(true);
    });

    it('getTopologicalOrder returns null for cyclic graph', () => {
      const flow = createCyclicGraph();
      const order = getTopologicalOrder(flow);
      expect(order).toBeNull();
    });

    it('hasCycle returns true', () => {
      const flow = createCyclicGraph();
      expect(hasCycle(flow)).toBe(true);
    });

    it('getNodesAtDepth handles cycles gracefully', () => {
      const flow = createCyclicGraph();

      // Should still return entry point at depth 0
      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);
      expect(getNodesAtDepth(flow, 1)).toEqual(['B']);
      expect(getNodesAtDepth(flow, 2)).toEqual(['C']);
      // Cycle doesn't cause infinite loop - A is already visited
      expect(getNodesAtDepth(flow, 3)).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Non-existent Node ID Tests
  // --------------------------------------------------------------------------

  describe('non-existent node IDs', () => {
    it('getUpstreamNodes returns empty set for non-existent node', () => {
      const flow = createLinearChain();
      const result = getUpstreamNodes(flow, 'nonexistent' as NodeId);
      expect(result.size).toBe(0);
    });

    it('getDownstreamNodes returns empty set for non-existent node', () => {
      const flow = createLinearChain();
      const result = getDownstreamNodes(flow, 'nonexistent' as NodeId);
      expect(result.size).toBe(0);
    });

    it('canReach returns false for non-existent source', () => {
      const flow = createLinearChain();
      expect(canReach(flow, 'nonexistent' as NodeId, 'A' as NodeId)).toBe(false);
    });

    it('canReach returns false for non-existent target', () => {
      const flow = createLinearChain();
      expect(canReach(flow, 'A' as NodeId, 'nonexistent' as NodeId)).toBe(false);
    });

    it('canReach returns false when both are non-existent', () => {
      const flow = createLinearChain();
      expect(canReach(flow, 'foo' as NodeId, 'bar' as NodeId)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Multiple Entry Points / No Entry Point Tests
  // --------------------------------------------------------------------------

  describe('entry point edge cases', () => {
    it('getNodesAtDepth returns empty array when no entry point', () => {
      const flow = createTestFlow({
        nodes: {
          ['A' as NodeId]: createTestNode('A'),
          ['B' as NodeId]: createTestNode('B'),
        } as Flow['nodes'],
        edges: {
          ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        } as Flow['edges'],
        // No entry point
      });

      expect(getNodesAtDepth(flow, 0)).toEqual([]);
      expect(getNodesAtDepth(flow, 1)).toEqual([]);
    });

    it('getNodesAtDepth returns empty for negative depth', () => {
      const flow = createLinearChain();
      expect(getNodesAtDepth(flow, -1)).toEqual([]);
    });

    it('getNodesAtDepth handles entry point not in nodes', () => {
      const flow = createTestFlow({
        entryPoint: 'missing' as NodeId,
        nodes: {
          ['A' as NodeId]: createTestNode('A'),
        } as Flow['nodes'],
      });

      expect(getNodesAtDepth(flow, 0)).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Complex Graph Tests
  // --------------------------------------------------------------------------

  describe('complex graph patterns', () => {
    /**
     * Create a more complex graph:
     *       A
     *      /|\
     *     B C D
     *     |/| |
     *     E F |
     *      \|/
     *       G
     */
    function createComplexGraph(): Flow {
      const nodes = {
        ['A' as NodeId]: createTestNode('A'),
        ['B' as NodeId]: createTestNode('B'),
        ['C' as NodeId]: createTestNode('C'),
        ['D' as NodeId]: createTestNode('D'),
        ['E' as NodeId]: createTestNode('E'),
        ['F' as NodeId]: createTestNode('F'),
        ['G' as NodeId]: createTestNode('G'),
      } as Flow['nodes'];

      const edges = {
        ['e1' as EdgeId]: createTestEdge('e1', 'A', 'B'),
        ['e2' as EdgeId]: createTestEdge('e2', 'A', 'C'),
        ['e3' as EdgeId]: createTestEdge('e3', 'A', 'D'),
        ['e4' as EdgeId]: createTestEdge('e4', 'B', 'E'),
        ['e5' as EdgeId]: createTestEdge('e5', 'C', 'E'),
        ['e6' as EdgeId]: createTestEdge('e6', 'C', 'F'),
        ['e7' as EdgeId]: createTestEdge('e7', 'E', 'G'),
        ['e8' as EdgeId]: createTestEdge('e8', 'F', 'G'),
        ['e9' as EdgeId]: createTestEdge('e9', 'D', 'G'),
      } as Flow['edges'];

      return createTestFlow({
        entryPoint: 'A' as NodeId,
        nodes,
        edges,
      });
    }

    it('getUpstreamNodes handles complex patterns', () => {
      const flow = createComplexGraph();

      // G has all other nodes as ancestors
      const upstreamG = getUpstreamNodes(flow, 'G' as NodeId);
      expect(upstreamG.size).toBe(6);

      // E has A, B, C as ancestors
      const upstreamE = getUpstreamNodes(flow, 'E' as NodeId);
      expect(upstreamE.size).toBe(3);
      expect(upstreamE.has('A' as NodeId)).toBe(true);
      expect(upstreamE.has('B' as NodeId)).toBe(true);
      expect(upstreamE.has('C' as NodeId)).toBe(true);
    });

    it('getDownstreamNodes handles complex patterns', () => {
      const flow = createComplexGraph();

      // A can reach all other nodes
      const downstreamA = getDownstreamNodes(flow, 'A' as NodeId);
      expect(downstreamA.size).toBe(6);

      // C can reach E, F, G
      const downstreamC = getDownstreamNodes(flow, 'C' as NodeId);
      expect(downstreamC.size).toBe(3);
      expect(downstreamC.has('E' as NodeId)).toBe(true);
      expect(downstreamC.has('F' as NodeId)).toBe(true);
      expect(downstreamC.has('G' as NodeId)).toBe(true);
    });

    it('getTopologicalOrder is valid for complex graph', () => {
      const flow = createComplexGraph();
      const order = getTopologicalOrder(flow);

      expect(order).not.toBeNull();
      expect(order).toHaveLength(7);

      // Verify all ordering constraints
      const indexOf = (id: string) => order!.indexOf(id as NodeId);

      // A comes before everything
      expect(indexOf('A')).toBeLessThan(indexOf('B'));
      expect(indexOf('A')).toBeLessThan(indexOf('C'));
      expect(indexOf('A')).toBeLessThan(indexOf('D'));

      // E comes after B and C
      expect(indexOf('B')).toBeLessThan(indexOf('E'));
      expect(indexOf('C')).toBeLessThan(indexOf('E'));

      // G comes last
      expect(indexOf('E')).toBeLessThan(indexOf('G'));
      expect(indexOf('F')).toBeLessThan(indexOf('G'));
      expect(indexOf('D')).toBeLessThan(indexOf('G'));
    });

    it('getNodesAtDepth handles complex graph', () => {
      const flow = createComplexGraph();

      expect(getNodesAtDepth(flow, 0)).toEqual(['A']);

      const depth1 = getNodesAtDepth(flow, 1);
      expect(depth1).toHaveLength(3);
      expect(depth1).toContain('B');
      expect(depth1).toContain('C');
      expect(depth1).toContain('D');

      // Depth 2 includes E (from B, C), F (from C), and G (from D via D→G edge)
      const depth2 = getNodesAtDepth(flow, 2);
      expect(depth2).toHaveLength(3);
      expect(depth2).toContain('E');
      expect(depth2).toContain('F');
      expect(depth2).toContain('G');

      // G is already at depth 2 via D, so depth 3 is empty
      expect(getNodesAtDepth(flow, 3)).toEqual([]);
    });
  });
});
