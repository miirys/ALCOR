/**
 * Shared VueFlow instance ID.
 *
 * useVueFlow() relies on Vue's provide/inject by default, which means it only
 * works for components that are descendants of <VueFlow>. The palette (NodeItem)
 * is a sibling of FlowCanvas, not a child, so it would get an unbound instance.
 *
 * By passing the same `id` to both `<VueFlow :id>` and every `useVueFlow(id)`
 * call, all components share the same VueFlow store regardless of their position
 * in the component tree.
 */
export const FLOW_ID = 'flow-builder';

export const START_NODE_ID = '__start__';

/** Which side the properties panel docks on in wide mode. */
export const PANEL_POSITION: 'left' | 'right' = 'right';
/** Width (px) of the floating properties panel. */
export const PANEL_WIDTH = 380;
/** Inset (px) of the floating panel from the canvas edge. */
export const PANEL_INSET = 12;
/** Below this canvas width (px), the layout switches to compact/overlay mode. */
export const COMPACT_LAYOUT_BREAKPOINT = 768;
