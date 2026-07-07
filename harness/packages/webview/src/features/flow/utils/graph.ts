import type { Flow, NodeId, Edge } from '../types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all edges where the given node is the target (incoming edges).
 *
 * @param flow - The flow graph
 * @param nodeId - The node ID to find incoming edges for
 * @returns Array of edges pointing to this node
 */
export function getIncomingEdges(flow: Flow, nodeId: string): Edge[] {
  return Object.values(flow.edges).filter((edge) => edge.target === nodeId);
}

/**
 * Get all edges where the given node is the source (outgoing edges).
 *
 * @param flow - The flow graph
 * @param nodeId - The node ID to find outgoing edges for
 * @returns Array of edges originating from this node
 */
export function getOutgoingEdges(flow: Flow, nodeId: string): Edge[] {
  return Object.values(flow.edges).filter((edge) => edge.source === nodeId);
}

// ============================================================================
// Core Graph Traversal Functions
// ============================================================================

/**
 * Get all nodes that can reach the target node (upstream/ancestors).
 * These are nodes whose outputs are available as inputs to the target.
 *
 * Uses BFS traversal backwards through incoming edges to find all ancestors.
 * The target node itself is NOT included in the result.
 *
 * @param flow - The flow graph to traverse
 * @param nodeId - The target node ID
 * @returns Set of node IDs that can reach the target (empty if nodeId doesn't exist)
 *
 * @example
 * ```typescript
 * // Given: A → B → C
 * const upstream = getUpstreamNodes(flow, 'C' as NodeId);
 * // Returns: Set(['A', 'B'])
 * ```
 */
export function getUpstreamNodes(flow: Flow, nodeId: NodeId): Set<NodeId> {
  // Return empty set if node doesn't exist
  if (!flow.nodes[nodeId]) {
    return new Set();
  }

  const upstream = new Set<NodeId>();
  const queue: NodeId[] = [];

  // Start with all nodes that directly point to the target
  const initialEdges = getIncomingEdges(flow, nodeId);
  for (const edge of initialEdges) {
    if (!upstream.has(edge.source)) {
      queue.push(edge.source);
    }
  }

  // BFS traversal backwards through the graph
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      break;
    }

    if (!upstream.has(currentId)) {
      upstream.add(currentId);

      // Find all nodes that point to the current node
      const incomingEdges = getIncomingEdges(flow, currentId);
      for (const edge of incomingEdges) {
        if (!upstream.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }
  }

  return upstream;
}

/**
 * Get all nodes reachable from the source node (downstream/descendants).
 * These are nodes that can receive data from the source node.
 *
 * Uses BFS traversal forwards through outgoing edges to find all descendants.
 * The source node itself is NOT included in the result.
 *
 * @param flow - The flow graph to traverse
 * @param nodeId - The source node ID
 * @returns Set of node IDs reachable from the source (empty if nodeId doesn't exist)
 *
 * @example
 * ```typescript
 * // Given: A → B → C
 * const downstream = getDownstreamNodes(flow, 'A' as NodeId);
 * // Returns: Set(['B', 'C'])
 * ```
 */
export function getDownstreamNodes(flow: Flow, nodeId: NodeId): Set<NodeId> {
  // Return empty set if node doesn't exist
  if (!flow.nodes[nodeId]) {
    return new Set();
  }

  const downstream = new Set<NodeId>();
  const queue: NodeId[] = [];

  // Start with all nodes directly reachable from the source
  const initialEdges = getOutgoingEdges(flow, nodeId);
  for (const edge of initialEdges) {
    if (!downstream.has(edge.target)) {
      queue.push(edge.target);
    }
  }

  // BFS traversal forwards through the graph
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      break;
    }

    if (!downstream.has(currentId)) {
      downstream.add(currentId);

      // Find all nodes reachable from the current node
      const outgoingEdges = getOutgoingEdges(flow, currentId);
      for (const edge of outgoingEdges) {
        if (!downstream.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
  }

  return downstream;
}

/**
 * Check if there is a path from the source node to the target node.
 *
 * @param flow - The flow graph to check
 * @param sourceId - The source node ID
 * @param targetId - The target node ID
 * @returns true if target is reachable from source, false otherwise
 *
 * @example
 * ```typescript
 * // Given: A → B → C
 * canReach(flow, 'A' as NodeId, 'C' as NodeId); // true
 * canReach(flow, 'C' as NodeId, 'A' as NodeId); // false
 * canReach(flow, 'A' as NodeId, 'A' as NodeId); // false (no self-loops considered reachable)
 * ```
 */
export function canReach(flow: Flow, sourceId: NodeId, targetId: NodeId): boolean {
  // Handle edge cases
  if (!flow.nodes[sourceId] || !flow.nodes[targetId]) {
    return false;
  }

  // A node cannot reach itself (no self-loops considered)
  if (sourceId === targetId) {
    return false;
  }

  // Optimized BFS with early termination
  const visited = new Set<NodeId>();
  const queue: NodeId[] = [sourceId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      break;
    }

    if (!visited.has(currentId)) {
      visited.add(currentId);

      const outgoingEdges = getOutgoingEdges(flow, currentId);
      for (const edge of outgoingEdges) {
        // Early termination - found the target
        if (edge.target === targetId) {
          return true;
        }

        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
  }

  return false;
}

/**
 * Compute a topological ordering of the graph nodes.
 *
 * Uses Kahn's algorithm to produce a valid topological sort.
 * Returns null if the graph contains cycles.
 *
 * A topological ordering ensures that for every edge A → B,
 * node A appears before node B in the ordering.
 *
 * @param flow - The flow graph to sort
 * @returns Array of node IDs in topological order, or null if cycles exist
 *
 * @example
 * ```typescript
 * // Given: A → B → C, A → C
 * const order = getTopologicalOrder(flow);
 * // Returns: ['A', 'B', 'C'] (A must come before B and C)
 *
 * // Given: A → B → C → A (cycle)
 * const order = getTopologicalOrder(flow);
 * // Returns: null
 * ```
 */
export function getTopologicalOrder(flow: Flow): NodeId[] | null {
  const nodes = Object.keys(flow.nodes) as NodeId[];

  if (nodes.length === 0) {
    return [];
  }

  // Calculate in-degree for each node
  const inDegree = new Map<NodeId, number>();
  for (const nodeId of nodes) {
    inDegree.set(nodeId, 0);
  }

  for (const edge of Object.values(flow.edges)) {
    const current = inDegree.get(edge.target) ?? 0;
    inDegree.set(edge.target, current + 1);
  }

  // Initialize queue with nodes that have no incoming edges
  const queue: NodeId[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: NodeId[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) {
      break;
    }

    result.push(nodeId);

    // Reduce in-degree of all neighbors
    const outgoingEdges = getOutgoingEdges(flow, nodeId);
    for (const edge of outgoingEdges) {
      const newDegree = (inDegree.get(edge.target) ?? 0) - 1;
      inDegree.set(edge.target, newDegree);

      if (newDegree === 0) {
        queue.push(edge.target);
      }
    }
  }

  // If we didn't process all nodes, there's a cycle
  if (result.length !== nodes.length) {
    return null;
  }

  return result;
}

/**
 * Get all nodes at a specific depth from the entry point.
 *
 * Depth 0 contains only the entry point.
 * Depth 1 contains nodes directly connected from the entry point.
 * And so on.
 *
 * @param flow - The flow graph to traverse
 * @param depth - The depth level to query (0-indexed)
 * @returns Array of node IDs at the specified depth (empty if no entry point or invalid depth)
 *
 * @example
 * ```typescript
 * // Given entry point A: A → B → C, A → D
 * getNodesAtDepth(flow, 0); // ['A']
 * getNodesAtDepth(flow, 1); // ['B', 'D']
 * getNodesAtDepth(flow, 2); // ['C']
 * getNodesAtDepth(flow, 3); // []
 * ```
 */
export function getNodesAtDepth(flow: Flow, depth: number): NodeId[] {
  // Handle edge cases
  if (depth < 0 || !flow.entryPoint || !flow.nodes[flow.entryPoint]) {
    return [];
  }

  // Use BFS with level tracking
  const visited = new Set<NodeId>();
  let currentLevel: NodeId[] = [flow.entryPoint];
  let currentDepth = 0;

  while (currentDepth < depth && currentLevel.length > 0) {
    const nextLevel: NodeId[] = [];
    const nextLevelSet = new Set<NodeId>();

    for (const nodeId of currentLevel) {
      visited.add(nodeId);

      const outgoingEdges = getOutgoingEdges(flow, nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target) && !nextLevelSet.has(edge.target)) {
          nextLevel.push(edge.target);
          nextLevelSet.add(edge.target);
        }
      }
    }

    currentLevel = nextLevel;
    currentDepth += 1;
  }

  // Filter out any nodes we've already visited at previous depths
  return currentLevel.filter((nodeId) => !visited.has(nodeId));
}

/**
 * Detect if the graph contains any cycles.
 *
 * @param flow - The flow graph to check
 * @returns true if the graph contains at least one cycle, false otherwise
 *
 * @example
 * ```typescript
 * // Given: A → B → C
 * hasCycle(flow); // false
 *
 * // Given: A → B → C → A
 * hasCycle(flow); // true
 * ```
 */
export function hasCycle(flow: Flow): boolean {
  return getTopologicalOrder(flow) === null;
}
