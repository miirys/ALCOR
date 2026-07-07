import { computed, type InjectionKey, type Ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { COMPACT_LAYOUT_BREAKPOINT, PANEL_WIDTH, PANEL_INSET, PANEL_POSITION } from '../constants';

export interface LayoutMode {
  containerWidth: Ref<number>;
  isCompactLayout: Ref<boolean>;
  /** Unsigned panel footprint (width + inset). 0 in compact mode. */
  panelOffset: Ref<number>;
  /**
   * Signed shift for centering calculations.
   * Positive = shift right (panel on left), negative = shift left (panel on right).
   * 0 in compact mode.
   */
  panelCenterShift: Ref<number>;
}

export const LAYOUT_MODE_KEY = Symbol('layoutMode') as InjectionKey<LayoutMode>;

export function useLayoutMode(container: Ref<HTMLElement | null>): LayoutMode {
  const { width: containerWidth } = useElementSize(container);

  const isCompactLayout = computed(() => {
    // useElementSize reports 0 before the first measurement — treat as wide to avoid flash
    if (containerWidth.value === 0) return false;
    return containerWidth.value < COMPACT_LAYOUT_BREAKPOINT;
  });

  const panelOffset = computed(() => (isCompactLayout.value ? 0 : PANEL_WIDTH + PANEL_INSET));

  const panelCenterShift = computed(() => {
    if (panelOffset.value === 0) return 0;
    return PANEL_POSITION === 'left' ? panelOffset.value : -panelOffset.value;
  });

  return { containerWidth, isCompactLayout, panelOffset, panelCenterShift };
}
