import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FlowSelection } from '../types/stores';
import type { EdgeId, NodeId } from '../types';
import { START_NODE_ID } from '../constants';
import { useGraphStore } from './graphStore';

export const useUIStore = defineStore('ui', () => {
  const graphStore = useGraphStore();

  // ─────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────
  const selectedElementId = ref<string | null>(null);
  const panelOpen = ref(false);

  /** Runtime-only set of node IDs created as "Custom Tool" this session. Clears on reload. */
  const customToolNodeIds = ref(new Set<NodeId>());

  // ─────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────
  const selectedElement = computed((): FlowSelection => {
    const id = selectedElementId.value;
    if (!id) return null;

    if (id === START_NODE_ID) return { type: 'start' };

    const node = graphStore.getNode(id as NodeId);
    if (node) return { type: 'node', element: node };

    const edge = graphStore.getEdge(id as EdgeId);
    if (edge) return { type: 'edge', element: edge };

    return null;
  });

  // ─────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────
  function select(id: string | null): void {
    selectedElementId.value = id;
    if (!id) panelOpen.value = false;
  }

  function openPanel(): void {
    panelOpen.value = true;
  }

  function closePanel(): void {
    panelOpen.value = false;
  }

  function clearSelection(): void {
    selectedElementId.value = null;
    panelOpen.value = false;
  }

  /**
   * Clear selection if the selected element no longer exists.
   * Call this after graph mutations that might delete elements.
   */
  function validateSelection(): void {
    if (selectedElementId.value && !selectedElement.value) {
      selectedElementId.value = null;
    }
  }

  function markAsCustomTool(nodeId: NodeId): void {
    customToolNodeIds.value.add(nodeId);
  }

  function unmarkCustomTool(nodeId: NodeId): void {
    customToolNodeIds.value.delete(nodeId);
  }

  function isCustomToolNode(nodeId: NodeId): boolean {
    return customToolNodeIds.value.has(nodeId);
  }

  return {
    // State
    selectedElementId,
    panelOpen,

    // Getters
    selectedElement,

    // Actions
    select,
    openPanel,
    closePanel,
    clearSelection,
    validateSelection,
    markAsCustomTool,
    unmarkCustomTool,
    isCustomToolNode,
  };
});
