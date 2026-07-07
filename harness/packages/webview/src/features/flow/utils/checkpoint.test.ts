import { describe, it, expect } from 'vitest';
import { buildExecutionTrace } from './checkpoint';

function traceFromEntries(entries: Record<string, unknown>[]) {
  const checkpoint = JSON.stringify({
    channel_values: { ui_chat_log: entries, status: 'running' },
  });
  const events = [{ checkpoint, workflowStatus: 'RUNNING', errors: [] }];
  return buildExecutionTrace(events, 'running', 'goal', null);
}

describe('buildExecutionTrace - component attribution', () => {
  it('maps component_name onto the parsed message', () => {
    const { messages } = traceFromEntries([
      {
        message_type: 'agent',
        content: 'hello',
        timestamp: '2026-06-10T00:00:00Z',
        status: 'success',
        component_name: 'researcher',
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].componentName).toBe('researcher');
  });

  it('leaves componentName undefined for legacy entries without component_name', () => {
    const { messages } = traceFromEntries([
      {
        message_type: 'agent',
        content: 'hello',
        timestamp: '2026-06-10T00:00:00Z',
        status: 'success',
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].componentName).toBeUndefined();
  });

  it('treats null component_name as undefined', () => {
    const { messages } = traceFromEntries([
      {
        message_type: 'tool',
        content: 'ran tool',
        timestamp: '2026-06-10T00:00:00Z',
        status: 'success',
        component_name: null,
      },
    ]);

    expect(messages[0].componentName).toBeUndefined();
  });
});
