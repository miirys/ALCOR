import type { NodeEvent } from '../types/execution';

interface NodeEventEnvelope {
  channel_values?: {
    node_events?: NodeEvent[];
  };
}

/**
 * Extract node-lifecycle events from one checkpoint JSON string.
 *
 * Returns `[]` for checkpoints without `node_events` or on parse failure. The
 * backend sends these incrementally (only events appended since the last
 * checkpoint), so callers must accumulate the results across checkpoints.
 */
export function parseNodeEvents(checkpointStr: string): NodeEvent[] {
  try {
    const checkpoint: NodeEventEnvelope = JSON.parse(checkpointStr);
    const raw = checkpoint.channel_values?.node_events;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export interface FoldedLifecycle {
  /** Components with at least one node run currently executing. */
  activeComponents: Set<string>;
  /** Components that have started at least one run — the path taken so far. */
  visitedComponents: Set<string>;
}

/**
 * Fold the accumulated node-event log into current execution state.
 *
 * A run is active from its `started` event until the terminal (`ended` /
 * `errored`) event with the same `run_id`; a component is visited once any of
 * its runs has started. Keyed on `run_id`, so it is correct for concurrent
 * branches and repeated runs (the agent ReAct loop) and idempotent if an event
 * is ever delivered more than once.
 */
export function foldNodeEvents(events: NodeEvent[]): FoldedLifecycle {
  const openRunComponents = new Map<string, string>(); // run_id -> component
  const visitedComponents = new Set<string>();

  for (const event of events) {
    if (event.phase === 'started') {
      openRunComponents.set(event.run_id, event.component);
      visitedComponents.add(event.component);
    } else if (event.phase === 'ended' || event.phase === 'errored') {
      openRunComponents.delete(event.run_id);
    }
  }

  return {
    activeComponents: new Set(openRunComponents.values()),
    visitedComponents,
  };
}
