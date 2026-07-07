<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { VueFlow, Panel, useVueFlow } from '@vue-flow/core';
import type {
  Edge as VueFlowEdge,
  Connection,
  EdgeMouseEvent,
  NodeMouseEvent,
  GraphNode,
} from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/minimap/dist/style.css';
import { irEdgesToVueFlowEdges, createStartEdge } from '../adapters/VueFlowAdapter';
import useDragAndDrop from '../composables/useDnD';
import { useFlow } from '../composables/useFlow';
import { useMinimapPadding } from '../composables/useMinimapPadding';
import { FLOW_ID, START_NODE_ID } from '../constants';
import { useComponentPicker } from '../composables/useComponentPicker';
import { useWelcomeState } from '../composables/useWelcomeState';
import { isTextInputTarget } from '../utils/keyboard';
import type { NodeId, EdgeId } from '../types';

import CustomNode from './CustomNode.vue';
import WelcomeNode from './WelcomeNode.vue';
import WelcomeHeadingNode from './WelcomeHeadingNode.vue';
import StartNode from './StartNode.vue';
import DefaultEdge from './DefaultEdge.vue';
import ConditionalEdge from './ConditionalEdge.vue';
import CanvasBackground from './CanvasBackground.vue';
import CanvasControls from './CanvasControls.vue';
import DropzoneBackground from './DropzoneBackground.vue';
import CustomConnectionLine from './CustomConnectionLine.vue';

const flow = useFlow();
const picker = useComponentPicker();
const {
  onNodeDragStop,
  onNodesChange,
  onEdgesChange,
  onConnectStart,
  onConnectEnd,
  onNodesInitialized,
  screenToFlowCoordinate,
  fitView,
  getSelectedNodes,
  getSelectedEdges,
} = useVueFlow(FLOW_ID);
const { isDragOver } = useDragAndDrop();

let pendingFitView = true;

watch(
  () => flow.flow.value,
  () => {
    pendingFitView = true;
  },
);

const { extraNodes, extraEdges, isWelcomeNodeId, isWelcomeEdgeId } = useWelcomeState();

onNodesInitialized(() => {
  if (!pendingFitView) return;
  pendingFitView = false;
  nextTick(() => {
    fitView({ padding: 0.5, maxZoom: 0.85 });
  });
});

// ── Minimap ───────────────────────────────────────────────────────────

const minimapVisible = ref(true);

function toggleMinimap() {
  minimapVisible.value = !minimapVisible.value;
}

useMinimapPadding(minimapVisible);

function getMinimapNodeColor(node: GraphNode): string {
  if (node.id === START_NODE_ID) return '#4ade80';
  if (isWelcomeNodeId(node.id)) return 'transparent';
  const irNode = node.data?.irNode;
  if (irNode) {
    const def = flow.nodeTypeDefinitions.value.find(
      (d: { type: string }) => d.type === irNode.type,
    );
    if (def?.ui?.color) return def.ui.color;
  }
  return '#9ca3af';
}

// ── Edges ─────────────────────────────────────────────────────────────

const vueFlowEdges = computed<VueFlowEdge[]>(() => {
  const currentNodes = flow.vueFlowNodes.value;
  const edges = irEdgesToVueFlowEdges(flow.edges.value);
  const { entryPoint } = flow.flow.value;
  if (entryPoint && currentNodes.some((n) => n.id === entryPoint)) {
    const startEdge = createStartEdge(entryPoint);
    if (startEdge) edges.unshift(startEdge);
  }
  return edges;
});

const isLocked = computed(() => flow.isExecuting.value);

const displayNodes = computed(() => [...flow.vueFlowNodes.value, ...extraNodes.value]);
const displayEdges = computed(() => [...vueFlowEdges.value, ...extraEdges.value]);

// ── Connection tracking for edge-to-canvas ──────────────────────────────

const pendingConnection = ref<{
  nodeId: string;
  handleType: 'source' | 'target';
} | null>(null);
let connectionCompleted = false;

onConnectStart(({ nodeId, handleType }) => {
  pendingConnection.value = { nodeId: nodeId!, handleType: handleType as 'source' | 'target' };
  connectionCompleted = false;
});

function handleConnect(connection: Connection) {
  if (isLocked.value) return;
  connectionCompleted = true;
  if (!connection.source || !connection.target) return;
  if (connection.target === START_NODE_ID) return;

  if (connection.source === START_NODE_ID) {
    flow.setEntryPoint(connection.target as NodeId);
    return;
  }

  const result = flow.connectNodes(connection.source as NodeId, connection.target as NodeId);
  if (!result.success) console.error('Failed to add edge:', result.errors);
}

onConnectEnd((event) => {
  if (connectionCompleted || !pendingConnection.value || isLocked.value) {
    pendingConnection.value = null;
    return;
  }

  const conn = pendingConnection.value;
  pendingConnection.value = null;

  if (!(event instanceof MouseEvent)) return;
  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });

  picker.open({
    position,
    onSelect: (newNodeId: NodeId) => {
      const sourceId = conn.handleType === 'source' ? conn.nodeId : newNodeId;
      const targetId = conn.handleType === 'source' ? newNodeId : conn.nodeId;

      if (sourceId === START_NODE_ID) {
        flow.setEntryPoint(targetId as NodeId);
        return;
      }

      const result = flow.connectNodes(sourceId as NodeId, targetId as NodeId);
      if (!result.success) {
        console.error('Failed to connect edge after picker:', result.errors);
      }
    },
  });
});

// ── Selection handlers ──────────────────────────────────────────────────

function handleNodeClick(event: NodeMouseEvent) {
  if (isWelcomeNodeId(event.node.id)) return;
  flow.select(event.node.id as NodeId);
}
function handleEdgeClick(event: EdgeMouseEvent) {
  if (isWelcomeEdgeId(event.edge.id)) return;
  flow.select(event.edge.id as EdgeId);
  flow.openPanel();
}
function handleNodeDoubleClick(event: NodeMouseEvent) {
  if (isWelcomeNodeId(event.node.id)) return;
  flow.select(event.node.id as NodeId);
  flow.openPanel();
}
function handlePaneClick() {
  flow.select(null);
}

// ── Drag/delete listeners ───────────────────────────────────────────────

onNodeDragStop((event) => {
  if (isLocked.value) return;
  const updates: Record<string, { position: { x: number; y: number } }> = {};
  event.nodes.forEach((node) => {
    if (node.id === START_NODE_ID || isWelcomeNodeId(node.id)) return;
    updates[node.id] = { position: node.position };
  });
  if (Object.keys(updates).length === 0) return;
  const result = flow.batchUpdateNodes(updates);
  if (!result.success) console.error('Failed to update node positions:', result.errors);
});

onNodesChange((changes) => {
  if (isLocked.value) return;
  changes.forEach((change) => {
    if (change.type === 'remove' && change.id !== START_NODE_ID && !isWelcomeNodeId(change.id)) {
      flow.removeNode(change.id as NodeId);
    }
  });
});

onEdgesChange((changes) => {
  if (isLocked.value) return;
  changes.forEach((change) => {
    if (change.type === 'remove' && !isWelcomeEdgeId(change.id)) {
      flow.removeEdge(change.id as EdgeId);
    }
  });
});

// ── Keyboard delete ────────────────────────────────────────────────────
// Intercept Backspace/Delete and call flow.removeNode / flow.removeEdge
// directly — same code path as the per-node delete button. This keeps the
// reactive cascade out of VueFlow's internal update cycle, so the welcome
// state re-appears reliably when the canvas returns to empty.
function handleDeleteKey(event: KeyboardEvent) {
  if (isTextInputTarget(event)) return;
  if (event.key !== 'Backspace' && event.key !== 'Delete') return;
  if (isLocked.value) return;

  const nodes = getSelectedNodes.value.filter(
    (n) => n.id !== START_NODE_ID && !isWelcomeNodeId(n.id),
  );
  const edges = getSelectedEdges.value;
  if (nodes.length === 0 && edges.length === 0) return;

  event.preventDefault();
  nodes.forEach((node) => flow.removeNode(node.id as NodeId));
  edges.forEach((edge) => flow.removeEdge(edge.id as EdgeId));
}

onMounted(() => window.addEventListener('keydown', handleDeleteKey));
onUnmounted(() => window.removeEventListener('keydown', handleDeleteKey));
</script>

<template>
  <div class="relative h-full w-full">
    <VueFlow
      :id="FLOW_ID"
      :nodes="displayNodes"
      :edges="displayEdges"
      :default-zoom="0.85"
      :min-zoom="0.2"
      :max-zoom="4"
      :nodes-draggable="!isLocked"
      :nodes-connectable="!isLocked"
      :elements-selectable="true"
      :delete-key-code="null"
      @connect="handleConnect"
      @edge-click="handleEdgeClick"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @pane-click="handlePaneClick"
    >
      <template #node-start="props">
        <StartNode v-bind="props" />
      </template>

      <template #node-custom="props">
        <CustomNode v-bind="props" />
      </template>

      <template #node-welcome="props">
        <WelcomeNode v-bind="props" />
      </template>

      <template #node-welcome-heading>
        <WelcomeHeadingNode />
      </template>

      <template #edge-default="props">
        <DefaultEdge v-bind="props" />
      </template>

      <template #edge-conditional="props">
        <ConditionalEdge v-bind="props" />
      </template>

      <template #connection-line="props">
        <CustomConnectionLine v-bind="props" />
      </template>

      <CanvasBackground />

      <DropzoneBackground
        v-if="!isLocked"
        :class="{
          'bg-primary/10': isDragOver,
          'bg-transparent': !isDragOver,
        }"
        class="transition-colors duration-200"
      />

      <!-- Navigation cluster: minimap + controls in one card -->
      <Panel position="bottom-left" class="nav-cluster-panel">
        <div
          class="nav-cluster transition-opacity duration-300"
          :class="{ 'opacity-50': flow.nodeCount.value === 0 }"
        >
          <div v-if="minimapVisible" class="minimap-slot">
            <MiniMap
              :pannable="true"
              :zoomable="true"
              :node-color="getMinimapNodeColor"
              mask-color="transparent"
              :mask-stroke-width="0"
              :node-border-radius="6"
              :node-stroke-width="0"
              class="flow-minimap"
            />
          </div>
          <div v-if="minimapVisible" class="controls-divider" />
          <CanvasControls :minimap-visible="minimapVisible" @toggle-minimap="toggleMinimap" />
        </div>
      </Panel>
    </VueFlow>

    <div
      v-if="isLocked"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-muted/80 backdrop-blur text-muted-foreground text-xs font-medium rounded-full border border-border shadow-sm pointer-events-none"
    >
      Read-Only Mode
    </div>
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

.vue-flow {
  background-color: var(--color-background) !important;
}

/* ═══════════════════════════════════════════════════════════════
   Navigation cluster — minimap + controls as one card
   ═══════════════════════════════════════════════════════════════ */

.nav-cluster-panel {
  margin: 12px !important;
  padding: 0 !important;
}

.nav-cluster {
  background: color-mix(in srgb, var(--color-card) 85%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-border) 20%, transparent),
    0 2px 8px -2px rgba(0, 0, 0, 0.15),
    0 4px 16px -4px rgba(0, 0, 0, 0.1);
  opacity: 0.9;
  transition:
    opacity 0.2s ease,
    box-shadow 0.2s ease;
}

.nav-cluster:hover {
  opacity: 1;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-border) 30%, transparent),
    0 4px 12px -2px rgba(0, 0, 0, 0.2),
    0 8px 24px -4px rgba(0, 0, 0, 0.12);
}

/* ── Minimap slot ────────────────────────────────────────── */
.minimap-slot {
  width: 192px;
  height: 132px;
  position: relative;
  overflow: hidden;
}

.flow-minimap.vue-flow__minimap {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* ── Divider between minimap and controls ────────────────── */
.controls-divider {
  height: 1px;
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
}

/* ── Node dots ───────────────────────────────────────────── */
.flow-minimap .vue-flow__minimap-node {
  opacity: 0.75;
  transition: opacity 0.15s ease;
}

.nav-cluster:hover .vue-flow__minimap-node {
  opacity: 0.9;
}
</style>
