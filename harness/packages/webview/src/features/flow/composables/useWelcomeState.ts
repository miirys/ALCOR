import { computed } from 'vue';
import type { Edge as VueFlowEdge, Node as VueFlowNode } from '@vue-flow/core';
import { START_NODE_ID } from '../constants';
import { useFlow } from './useFlow';

const WELCOME_NODE_ID = '__welcome__';
const WELCOME_HEADING_NODE_ID = '__welcome_heading__';
const WELCOME_EDGE_ID = `${START_NODE_ID}-to-${WELCOME_NODE_ID}`;

export function useWelcomeState() {
  const flow = useFlow();

  const isEmpty = computed(() => flow.nodeCount.value === 0 && !flow.isExecuting.value);

  const extraNodes = computed<VueFlowNode[]>(() => {
    if (!isEmpty.value) return [];
    return [
      {
        id: WELCOME_HEADING_NODE_ID,
        type: 'welcome-heading',
        // x:0 aligns left edge with START; text-center in WelcomeHeadingNode does the rest
        position: { x: 0, y: -46 },
        data: {},
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
      },
      {
        id: WELCOME_NODE_ID,
        type: 'welcome',
        // Roughly centered under START (140px wide at x:0)
        position: { x: -50, y: 100 },
        data: {},
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
      },
    ];
  });

  const extraEdges = computed<VueFlowEdge[]>(() => {
    if (!isEmpty.value) return [];
    return [
      {
        id: WELCOME_EDGE_ID,
        source: START_NODE_ID,
        target: WELCOME_NODE_ID,
        type: 'default',
        animated: true,
        style: { stroke: 'rgba(255, 255, 255, 0.25)', strokeWidth: 1.5 },
        selectable: false,
        deletable: false,
        interactionWidth: 0,
      },
    ];
  });

  function isWelcomeNodeId(id: string): boolean {
    return id === WELCOME_NODE_ID || id === WELCOME_HEADING_NODE_ID;
  }

  function isWelcomeEdgeId(id: string): boolean {
    return id === WELCOME_EDGE_ID;
  }

  return {
    extraNodes,
    extraEdges,
    isWelcomeNodeId,
    isWelcomeEdgeId,
  };
}
