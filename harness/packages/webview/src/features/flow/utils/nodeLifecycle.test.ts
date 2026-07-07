import { describe, it, expect } from 'vitest';
import type { NodeEvent } from '../types/execution';
import { parseNodeEvents, foldNodeEvents } from './nodeLifecycle';

function checkpoint(nodeEvents: unknown): string {
  return JSON.stringify({ channel_values: { node_events: nodeEvents, status: 'running' } });
}

describe('parseNodeEvents', () => {
  it('extracts node_events from a checkpoint', () => {
    const events = [{ run_id: 'r1', component: 'researcher', phase: 'started' }];

    expect(parseNodeEvents(checkpoint(events))).toEqual(events);
  });

  it('returns [] when the checkpoint has no node_events', () => {
    expect(parseNodeEvents(JSON.stringify({ channel_values: { status: 'running' } }))).toEqual([]);
  });

  it('returns [] on malformed JSON instead of throwing', () => {
    expect(parseNodeEvents('not json')).toEqual([]);
  });

  it('returns [] when node_events is not an array', () => {
    // The backend payload is untyped at runtime; a non-array (object, string)
    // must not flow through as NodeEvent[] and break the caller's spread.
    expect(parseNodeEvents(checkpoint({}))).toEqual([]);
    expect(parseNodeEvents(checkpoint('oops'))).toEqual([]);
  });
});

describe('foldNodeEvents', () => {
  const started = (runId: string, component: string): NodeEvent => ({
    run_id: runId,
    component,
    phase: 'started',
  });
  const ended = (runId: string, component: string): NodeEvent => ({
    run_id: runId,
    component,
    phase: 'ended',
  });

  it('reports a started run as active and visited', () => {
    const { activeComponents, visitedComponents } = foldNodeEvents([started('r1', 'researcher')]);

    expect(activeComponents).toEqual(new Set(['researcher']));
    expect(visitedComponents).toEqual(new Set(['researcher']));
  });

  it('clears active on the terminal event, keeping visited', () => {
    const { activeComponents, visitedComponents } = foldNodeEvents([
      started('r1', 'researcher'),
      ended('r1', 'researcher'),
    ]);

    expect(activeComponents).toEqual(new Set());
    expect(visitedComponents).toEqual(new Set(['researcher']));
  });

  it('tracks concurrent runs independently by run_id', () => {
    const { activeComponents } = foldNodeEvents([
      started('r1', 'alpha'),
      started('r2', 'beta'),
      ended('r1', 'alpha'),
    ]);

    expect(activeComponents).toEqual(new Set(['beta']));
  });

  it('keeps a component active across a ReAct loop until its open run ends', () => {
    // researcher#agent (r1) ends, researcher#tools (r2) starts — same component
    const { activeComponents, visitedComponents } = foldNodeEvents([
      started('r1', 'researcher'),
      ended('r1', 'researcher'),
      started('r2', 'researcher'),
    ]);

    expect(activeComponents).toEqual(new Set(['researcher']));
    expect(visitedComponents).toEqual(new Set(['researcher']));
  });

  it('is idempotent if an event is delivered more than once', () => {
    const { activeComponents } = foldNodeEvents([
      started('r1', 'researcher'),
      ended('r1', 'researcher'),
      ended('r1', 'researcher'),
    ]);

    expect(activeComponents).toEqual(new Set());
  });

  it('treats errored as terminal for active state', () => {
    const { activeComponents, visitedComponents } = foldNodeEvents([
      started('r1', 'researcher'),
      { run_id: 'r1', component: 'researcher', phase: 'errored' },
    ]);

    expect(activeComponents).toEqual(new Set());
    expect(visitedComponents).toEqual(new Set(['researcher']));
  });

  it('ignores an unknown phase instead of clearing the active run', () => {
    // Phases come from untyped JSON at runtime; an unrecognized future phase
    // must not be treated as terminal and silently clear an active node.
    const { activeComponents, visitedComponents } = foldNodeEvents([
      started('r1', 'researcher'),
      { run_id: 'r1', component: 'researcher', phase: 'paused' as NodeEvent['phase'] },
    ]);

    expect(activeComponents).toEqual(new Set(['researcher']));
    expect(visitedComponents).toEqual(new Set(['researcher']));
  });
});
