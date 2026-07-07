import { useVueFlow } from '@vue-flow/core';
import { ref, readonly, watch } from 'vue';
import { FLOW_ID } from '../constants';
import { createNodeFromDefinition } from '../utils';
import { generateNodeId } from '../utils/id';
import { NodeId } from '../types';
import { useUIStore } from '../stores';
import { useFlow } from './useFlow';

const MOVEMENT_THRESHOLD = 5;

interface DragMeta {
  toolName?: string;
  preferredLabel?: string;
  onDrop?: (position: { x: number; y: number }) => void;
}

const state = {
  /**
   * The type of the node being dragged.
   */
  draggedType: ref<undefined | string>(undefined),
  isDragOver: ref<boolean>(false),
  isDragging: ref<boolean>(false),
  dragMeta: ref<DragMeta>({}),
};

export default function useDragAndDrop() {
  const { draggedType, isDragOver, isDragging, dragMeta } = state;
  const { screenToFlowCoordinate, updateNode, vueFlowRef } = useVueFlow(FLOW_ID);
  const { addNode, nodeTypeDefinitions, nodes } = useFlow();
  const uiStore = useUIStore();

  watch(isDragging, (dragging) => {
    document.body.style.userSelect = dragging ? 'none' : '';
  });

  // ─── Internal drag state (not exported) ───────────────────────

  let startX = 0;
  let startY = 0;
  let ghostEl: HTMLElement | null = null;
  let thresholdMet = false;
  let currentLabel = '';
  let currentIcon = '';

  // ─── Ghost element helpers ────────────────────────────────────

  function createGhost(label: string, icon: string): HTMLElement {
    const el = document.createElement('div');
    el.dataset.testid = 'dnd-ghost';
    el.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 10000',
      'padding: 8px 14px',
      'border-radius: 10px',
      'font-size: 13px',
      'font-family: inherit',
      'display: flex',
      'align-items: center',
      'gap: 8px',
      'background: var(--color-card, #1e1e1e)',
      'color: var(--color-foreground, #cccccc)',
      'border: 1px solid var(--color-border, #333)',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
      'opacity: 0.92',
      'white-space: nowrap',
    ].join(';');

    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '16px';
    iconSpan.textContent = icon;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;

    el.appendChild(iconSpan);
    el.appendChild(labelSpan);
    document.body.appendChild(el);
    return el;
  }

  function positionGhost(el: HTMLElement, x: number, y: number) {
    el.style.left = `${x + 12}px`;
    el.style.top = `${y + 12}px`;
  }

  // ─── Canvas hit-testing ───────────────────────────────────────

  function isOverCanvas(clientX: number, clientY: number): boolean {
    const canvasEl = vueFlowRef.value;
    if (!canvasEl) return false;
    const rect = canvasEl.getBoundingClientRect();
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    );
  }

  // ─── Global listener management ───────────────────────────────

  function bindGlobalListeners() {
    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', cleanup, { capture: true });
    window.addEventListener('blur', cleanup);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function unbindGlobalListeners() {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', cleanup, true);
    window.removeEventListener('blur', cleanup);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  function cleanup() {
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }

    draggedType.value = undefined;
    isDragOver.value = false;
    isDragging.value = false;
    dragMeta.value = {};
    thresholdMet = false;

    unbindGlobalListeners();
  }

  // ─── Document-level listeners ─────────────────────────────────

  function onPointerMove(event: PointerEvent) {
    if (!thresholdMet) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) < MOVEMENT_THRESHOLD) return;

      thresholdMet = true;
      isDragging.value = true;
      ghostEl = createGhost(currentLabel, currentIcon);
    }

    if (ghostEl) positionGhost(ghostEl, event.clientX, event.clientY);
    isDragOver.value = isOverCanvas(event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent) {
    if (thresholdMet && isDragOver.value && draggedType.value) {
      const meta = dragMeta.value;
      if (meta.onDrop) {
        const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
        meta.onDrop(position);
      } else {
        dropNode(event.clientX, event.clientY, draggedType.value);
      }
    }
    cleanup();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      cleanup();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) cleanup();
  }

  /**
   * Generate a unique label for a node, appending a numeric suffix if the
   * base label already exists in the flow.
   */
  function uniqueLabel(base: string): string {
    const existingLabels = new Set(nodes.value.map((n) => n.label));
    if (!existingLabels.has(base)) return base;

    let counter = 2;
    while (existingLabels.has(`${base}_${counter}`)) {
      counter += 1;
    }
    return `${base}_${counter}`;
  }

  function dropNode(clientX: number, clientY: number, type: string) {
    const position = screenToFlowCoordinate({ x: clientX, y: clientY });
    const definition = nodeTypeDefinitions.value.find((x) => x.type === type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return;
    }

    const nodeId = generateNodeId();
    const irNode = createNodeFromDefinition(definition, position, nodeId);
    const meta = dragMeta.value;

    // Pre-populate tool config and use a meaningful label
    if (meta.toolName) {
      irNode.config = { toolName: meta.toolName };
    }
    if (meta.preferredLabel) {
      irNode.label = uniqueLabel(meta.preferredLabel);
    }

    const result = addNode(irNode);
    if (!result.success) {
      console.error('Failed to add node:', result.errors);
      return;
    }

    if (type === 'tool' && !meta.toolName) {
      uiStore.markAsCustomTool(nodeId);
    }

    // Center the node on drop point after VueFlow calculates dimensions
    setTimeout(() => {
      updateNode(nodeId, (node) => {
        if (!node.dimensions) return {};
        return {
          position: {
            x: position.x - node.dimensions.width / 2,
            y: position.y - node.dimensions.height / 2,
          },
        };
      });
    }, 0);
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Called from the palette on pointerdown. Registers document-level
   * listeners and waits for the movement threshold before activating drag.
   */
  function onPointerStart(
    event: PointerEvent,
    type: string,
    label: string,
    icon: string,
    meta?: DragMeta,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    startX = event.clientX;
    startY = event.clientY;
    draggedType.value = type;
    dragMeta.value = meta || {};
    currentLabel = label;
    currentIcon = icon;
    thresholdMet = false;

    bindGlobalListeners();
  }

  function addNodeAtPosition(
    type: string,
    position: { x: number; y: number },
    meta?: Omit<DragMeta, 'onDrop'>,
  ): NodeId | null {
    const definition = nodeTypeDefinitions.value.find((d) => d.type === type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return null;
    }

    const nodeId = generateNodeId();
    const irNode = createNodeFromDefinition(definition, position, nodeId);

    if (meta?.toolName) {
      irNode.config = { toolName: meta.toolName };
    }
    if (meta?.preferredLabel) {
      irNode.label = uniqueLabel(meta.preferredLabel);
    }

    const result = addNode(irNode);
    if (!result.success) {
      console.error('Failed to add node:', result.errors);
      return null;
    }

    if (type === 'tool' && !meta?.toolName) {
      uiStore.markAsCustomTool(nodeId);
    }

    // Center the node on the drop point after it renders
    setTimeout(() => {
      updateNode(nodeId, (node) => {
        if (!node.dimensions) return {};
        return {
          position: {
            x: position.x - node.dimensions.width / 2,
            y: position.y - node.dimensions.height / 2,
          },
        };
      });
    }, 0);

    return nodeId;
  }

  function addNodeAtViewportCenter(type: string, meta?: Omit<DragMeta, 'onDrop'>): NodeId | null {
    const canvasEl = vueFlowRef.value;
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const center = screenToFlowCoordinate({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    const jitter = (Math.random() - 0.5) * 40;
    return addNodeAtPosition(type, { x: center.x + jitter, y: center.y + jitter }, meta);
  }

  return {
    draggedType: readonly(draggedType),
    isDragOver: readonly(isDragOver),
    isDragging: readonly(isDragging),
    onPointerStart,
    addNodeAtViewportCenter,
    addNodeAtPosition,
  };
}
