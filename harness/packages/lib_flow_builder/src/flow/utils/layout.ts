import dagre from '@dagrejs/dagre';
import type { Flow, NodeId, Position } from '../types';

/**
 * Layout direction for the auto-layout algorithm.
 * - 'TB': Top-to-Bottom (default, standard hierarchical)
 * - 'LR': Left-to-Right
 */
export type LayoutDirection = 'TB' | 'LR';

export interface LayoutOptions {
  /** Layout direction. Defaults to 'TB'. */
  direction?: LayoutDirection;
  /** Horizontal spacing between nodes. Defaults to 80. */
  nodeSpacingX?: number;
  /** Vertical spacing between ranks. Defaults to 100. */
  nodeSpacingY?: number;
  /** Estimated width of each node. Defaults to 280. */
  nodeWidth?: number;
  /** Estimated height of each node. Defaults to 80. */
  nodeHeight?: number;
  /**
   * Position of the fixed START node. The layout is translated
   * so the entry-point node sits directly below (or beside) this point.
   * Defaults to { x: 0, y: 0 }.
   */
  startNodePosition?: Position;
  /**
   * Gap between the START node and the entry-point node.
   * Defaults to 120.
   */
  startNodeGap?: number;
}

/**
 * Compute a hierarchical layout for a Flow graph using dagre.
 *
 * Returns a map of NodeId → Position. The positions are translated so the
 * entry-point node is placed below (TB) or beside (LR) the fixed START node
 * at `startNodePosition`.
 *
 * Nodes that are disconnected from the entry point are still laid out —
 * dagre handles disconnected subgraphs by placing them in separate ranks.
 */
export function computeFlowLayout(
  flow: Flow,
  options: LayoutOptions = {},
): Record<NodeId, Position> {
  const {
    direction = 'TB',
    nodeSpacingX = 80,
    nodeSpacingY = 100,
    nodeWidth = 280,
    nodeHeight = 80,
    startNodePosition = { x: 0, y: 0 },
    startNodeGap = 120,
  } = options;

  const nodeIds = Object.keys(flow.nodes) as NodeId[];
  if (nodeIds.length === 0) return {};

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSpacingX,
    ranksep: nodeSpacingY,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of nodeIds) {
    g.setNode(id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of Object.values(flow.edges)) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  // Dagre centers nodes at (x, y). Convert to top-left origin
  // to match Vue Flow's coordinate system.
  const rawPositions: Record<NodeId, Position> = {};
  for (const id of nodeIds) {
    const dagreNode = g.node(id);
    if (dagreNode) {
      rawPositions[id] = {
        x: dagreNode.x - nodeWidth / 2,
        y: dagreNode.y - nodeHeight / 2,
      };
    }
  }

  return translateToStartNode(
    rawPositions,
    flow.entryPoint,
    direction,
    startNodePosition,
    startNodeGap,
    nodeHeight,
    nodeWidth,
  );
}

/**
 * Translate all computed positions so the entry-point node sits at
 * the correct offset from the START node.
 *
 * If there is no entry point, the top-left corner of the bounding box
 * is aligned to where the entry point would be.
 */
function translateToStartNode(
  positions: Record<NodeId, Position>,
  entryPoint: NodeId | null,
  direction: LayoutDirection,
  startNodePosition: Position,
  startNodeGap: number,
  nodeHeight: number,
  nodeWidth: number,
): Record<NodeId, Position> {
  // Where the entry-point node should land
  const targetX =
    direction === 'TB' ? startNodePosition.x : startNodePosition.x + nodeWidth + startNodeGap;
  const targetY =
    direction === 'TB' ? startNodePosition.y + nodeHeight + startNodeGap : startNodePosition.y;

  // Determine the anchor: the entry-point position, or the min corner of the bounding box
  let anchorX: number;
  let anchorY: number;

  if (entryPoint && positions[entryPoint]) {
    anchorX = positions[entryPoint].x;
    anchorY = positions[entryPoint].y;
  } else {
    const allPositions = Object.values(positions);
    anchorX = Math.min(...allPositions.map((p) => p.x));
    anchorY = Math.min(...allPositions.map((p) => p.y));
  }

  const dx = targetX - anchorX;
  const dy = targetY - anchorY;

  const result: Record<NodeId, Position> = {};
  for (const [id, pos] of Object.entries(positions)) {
    result[id as NodeId] = {
      x: pos.x + dx,
      y: pos.y + dy,
    };
  }

  return result;
}
