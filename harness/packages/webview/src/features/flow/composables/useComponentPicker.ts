import { ref, readonly } from 'vue';
import type { NodeId } from '../types';

/**
 * Shared singleton state for the universal component picker.
 *
 * Supports an optional `onSelect` callback — when provided,
 * the caller is notified after a node is placed (e.g. to complete an edge).
 */
const isOpen = ref(false);
const dropPosition = ref<{ x: number; y: number } | null>(null);
const onSelectCallback = ref<((nodeId: NodeId) => void) | null>(null);

export interface PickerOpenOptions {
  position?: { x: number; y: number };
  /** Called after the node is created. Use this to wire up edges. */
  onSelect?: (nodeId: NodeId) => void;
}

export function useComponentPicker() {
  function open(options?: PickerOpenOptions | { x: number; y: number }) {
    // Support both open({ x, y }) shorthand and open({ position, onSelect })
    if (options && 'x' in options && 'y' in options) {
      dropPosition.value = options;
      onSelectCallback.value = null;
    } else if (options) {
      dropPosition.value = options.position ?? null;
      onSelectCallback.value = options.onSelect ?? null;
    } else {
      dropPosition.value = null;
      onSelectCallback.value = null;
    }
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
    dropPosition.value = null;
    onSelectCallback.value = null;
  }

  function toggle(options?: PickerOpenOptions) {
    if (isOpen.value) {
      close();
    } else {
      open(options);
    }
  }

  /**
   * Called by the picker dialog after placing a node.
   * Invokes the onSelect callback if one was provided, then cleans up.
   */
  function notifySelection(nodeId: NodeId) {
    const callback = onSelectCallback.value;
    // Close first so the UI updates, then notify
    close();
    callback?.(nodeId);
  }

  return {
    isOpen: readonly(isOpen),
    dropPosition: readonly(dropPosition),
    hasCallback: () => onSelectCallback.value !== null,
    open,
    close,
    toggle,
    notifySelection,
  };
}
