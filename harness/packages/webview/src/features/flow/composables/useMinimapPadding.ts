import { onUnmounted, nextTick, watch, type Ref } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import { FLOW_ID } from '../constants';

const PADDING_RATIO = 0.35;
const MIN_WORLD_WIDTH = 800;
const MIN_WORLD_HEIGHT = 600;
const MINIMAP_SELECTOR = '.flow-minimap.vue-flow__minimap svg';
const VIEWPORT_RECT_ID = 'flow-minimap-viewport-rect';

/**
 * Patches the Vue Flow minimap with padding and a custom viewport indicator.
 *
 * Attachment is gated by `visible`: when the minimap is hidden, the
 * MutationObserver, viewport watcher, and any in-flight retry timer are
 * torn down.
 *
 * @param visible — reactive boolean controlling whether the minimap is mounted
 */
export function useMinimapPadding(visible: Ref<boolean>) {
  const { viewport, dimensions } = useVueFlow(FLOW_ID);

  let observer: MutationObserver | null = null;
  let isPatching = false;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let viewportRaf: number | null = null;

  function patchViewBox(svg: SVGSVGElement) {
    if (isPatching) return;

    const raw = svg.getAttribute('viewBox');
    if (!raw) return;

    const parts = raw.split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return;

    let [x, y, w, h] = parts as [number, number, number, number];

    const padX = w * PADDING_RATIO;
    const padY = h * PADDING_RATIO;
    x -= padX;
    y -= padY;
    w += padX * 2;
    h += padY * 2;

    if (w < MIN_WORLD_WIDTH) {
      const cx = x + w / 2;
      x = cx - MIN_WORLD_WIDTH / 2;
      w = MIN_WORLD_WIDTH;
    }
    if (h < MIN_WORLD_HEIGHT) {
      const cy = y + h / 2;
      y = cy - MIN_WORLD_HEIGHT / 2;
      h = MIN_WORLD_HEIGHT;
    }

    const newVB = `${x} ${y} ${w} ${h}`;
    if (newVB === raw) return;

    isPatching = true;
    svg.setAttribute('viewBox', newVB);
    requestAnimationFrame(() => {
      isPatching = false;
    });
  }

  function updateViewportRect(svg: SVGSVGElement) {
    const vp = viewport.value;
    const dim = dimensions.value;
    if (!dim.width || !dim.height) return;

    let rect = svg.getElementById(VIEWPORT_RECT_ID) as SVGRectElement | null;
    if (!rect) {
      rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.id = VIEWPORT_RECT_ID;
      rect.setAttribute('fill', 'none');
      rect.setAttribute('rx', '3');
      rect.setAttribute('ry', '3');
      svg.appendChild(rect);
    }

    // Convert screen dimensions to flow coordinates
    const flowX = -vp.x / vp.zoom;
    const flowY = -vp.y / vp.zoom;
    const flowW = dim.width / vp.zoom;
    const flowH = dim.height / vp.zoom;

    rect.setAttribute('x', String(flowX));
    rect.setAttribute('y', String(flowY));
    rect.setAttribute('width', String(flowW));
    rect.setAttribute('height', String(flowH));

    // Style using CSS custom properties resolved at runtime
    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue('--color-foreground').trim();
    rect.setAttribute('stroke', fg || '#ffffff');
    rect.setAttribute('stroke-opacity', '0.4');
    const vb = svg.getAttribute('viewBox');
    const vbW = vb ? Number(vb.split(/[\s,]+/)[2]) : MIN_WORLD_WIDTH;
    rect.setAttribute('stroke-width', String(vbW / 96)); // ~2 px at 192 px wide
  }

  function startViewportTracking(svg: SVGSVGElement) {
    // Hide the default mask
    const mask = svg.querySelector('.vue-flow__minimap-mask') as SVGElement | null;
    if (mask) {
      mask.style.display = 'none';
    }

    // Update on every viewport/dimension change via reactive watch
    const stop = watch(
      [viewport, dimensions],
      () => {
        if (viewportRaf) cancelAnimationFrame(viewportRaf);
        viewportRaf = requestAnimationFrame(() => {
          updateViewportRect(svg);
          viewportRaf = null;
        });
      },
      { immediate: true, deep: true },
    );

    return stop;
  }

  let stopViewportWatch: (() => void) | null = null;

  function attach() {
    const svg = document.querySelector(MINIMAP_SELECTOR) as SVGSVGElement | null;
    if (!svg) return false;

    patchViewBox(svg);

    observer = new MutationObserver(() => {
      patchViewBox(svg);
    });
    observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });

    stopViewportWatch = startViewportTracking(svg);

    return true;
  }

  function detach() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    if (stopViewportWatch) {
      stopViewportWatch();
      stopViewportWatch = null;
    }
    if (viewportRaf) {
      cancelAnimationFrame(viewportRaf);
      viewportRaf = null;
    }
  }

  watch(
    visible,
    (isVisible) => {
      detach();
      if (!isVisible) return;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      nextTick(() => {
        // Re-read visibility at callback time: a true→false toggle between
        // the watcher firing and this nextTick running would otherwise leave
        // a zombie MutationObserver + viewport watcher after detach ran.
        if (!visible.value) return;
        if (attach()) return;

        let attempts = 0;
        retryTimer = setInterval(() => {
          attempts += 1;
          if (!visible.value || attach() || attempts > 20) {
            if (retryTimer) clearInterval(retryTimer);
            retryTimer = null;
          }
        }, 100);
      });
    },
    { immediate: true },
  );

  onUnmounted(() => {
    detach();
  });
}
