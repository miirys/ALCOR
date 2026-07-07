import type { Node as VueFlowNode, Edge as VueFlowEdge } from '@vue-flow/core';
import type { Edge, Flow, Node, NodeId, NodeTypeDefinition } from '../types';
import { getNodeDisplayInfo } from '../utils';
import { START_NODE_ID } from '../constants';

/**
 * Transform IR node to VueFlow node format
 */
function irNodeToVueFlowNode(irNode: Node, definitions: NodeTypeDefinition[]): VueFlowNode {
  const displayInfo = getNodeDisplayInfo(irNode, definitions);

  return {
    id: irNode.id,
    type: 'custom',
    position: irNode.position,
    data: {
      irNode,
      displayInfo,
    },
  };
}

/**
 * Create a synthesized START node for the canvas.
 * This node is not stored in flow.nodes — it is purely visual.
 */
function createStartVueFlowNode(flow: Flow): VueFlowNode {
  return {
    id: START_NODE_ID,
    type: 'start',
    position: { x: 0, y: 0 },
    deletable: false,
    draggable: false,
    data: {
      inputCount: flow.inputs?.length ?? 0,
    },
  };
}

/**
 * Create a synthesized edge from START to the entry point node.
 * Returns null if there is no entry point.
 */
export function createStartEdge(entryPoint: NodeId | null): VueFlowEdge | null {
  if (!entryPoint) return null;

  return {
    id: `${START_NODE_ID}-to-${entryPoint}`,
    source: START_NODE_ID,
    target: entryPoint,
    type: 'default',
    style: {
      stroke: '#22c55e',
      strokeWidth: 2,
      strokeDasharray: '6 3',
    },
    deletable: false,
  };
}

/**
 * Batch transform IR nodes to VueFlow nodes, prepending the synthesized START node
 */
export function irNodesToVueFlowNodes(
  irNodes: Node[],
  definitions: NodeTypeDefinition[],
  flow: Flow,
): VueFlowNode[] {
  const startNode = createStartVueFlowNode(flow);
  const realNodes = irNodes.map((node) => irNodeToVueFlowNode(node, definitions));
  return [startNode, ...realNodes];
}

/**
 * Transform IR edge to VueFlow edge format
 */
function irEdgeToVueFlowEdge(irEdge: Edge): VueFlowEdge {
  const hasCondition = Boolean(irEdge.condition);

  return {
    id: irEdge.id,
    source: irEdge.source,
    target: irEdge.target,
    type: hasCondition ? 'conditional' : 'default',
    label: irEdge.label,
    data: {
      // Pass the full IR edge for access to condition
      irEdge,
      hasCondition,
    },
    // Style conditional edges differently
    style: hasCondition
      ? {
          stroke: '#f59e0b', // amber
          strokeWidth: 2,
        }
      : undefined,
    animated: hasCondition, // Animate conditional edges
  };
}

/**
 * Batch transform IR edges to VueFlow edges
 */
export function irEdgesToVueFlowEdges(irEdges: Edge[]): VueFlowEdge[] {
  return irEdges.map((edge) => irEdgeToVueFlowEdge(edge));
}
