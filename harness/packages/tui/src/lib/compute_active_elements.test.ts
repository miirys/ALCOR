import type { Message, ToolCall, ErrorMessage } from '../types';
import { computeActiveElementCount } from './compute_active_elements';

// Test fixtures
const createMessage = (overrides: Partial<Message> & { id: string }): Message => ({
  type: 'message',
  role: 'assistant',
  content: 'test content',
  timestamp: Date.now(),
  isComplete: true,
  ...overrides,
});

const createTool = (overrides: Partial<ToolCall> & { id: string }): ToolCall => ({
  type: 'tool',
  name: 'read_file',
  input: { tool: 'read_file', filepath: 'test.ts' },
  state: { type: 'success', output: 'done' },
  timestamp: Date.now(),
  ...overrides,
});

const createError = (overrides: Partial<ErrorMessage> & { id: string }): ErrorMessage => ({
  type: 'error',
  error: 'test error',
  timestamp: Date.now(),
  ...overrides,
});

describe('computeActiveElementCount', () => {
  it('returns 0 for empty array', () => {
    expect(computeActiveElementCount([])).toBe(0);
  });

  it('returns 0 when all messages are complete', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createMessage({ id: '2', isComplete: true }),
    ];
    expect(computeActiveElementCount(elements)).toBe(0);
  });

  it('returns 1 when last message is streaming', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createMessage({ id: '2', isComplete: false }),
    ];
    expect(computeActiveElementCount(elements)).toBe(1);
  });

  it('returns 1 when last tool is loading', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createTool({ id: 't1', state: { type: 'loading' } }),
    ];
    expect(computeActiveElementCount(elements)).toBe(1);
  });

  it('returns 2 when message streaming and tool loading', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createMessage({ id: '2', isComplete: false }),
      createTool({ id: 't1', state: { type: 'loading' } }),
    ];
    expect(computeActiveElementCount(elements)).toBe(2);
  });

  it('returns 0 when tool is complete', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createTool({ id: 't1', state: { type: 'success', output: 'done' } }),
    ];
    expect(computeActiveElementCount(elements)).toBe(0);
  });

  it('stops counting at first complete element', () => {
    const elements = [
      createMessage({ id: '1', isComplete: false }),
      createMessage({ id: '2', isComplete: true }),
      createMessage({ id: '3', isComplete: false }),
    ];
    // Should only count the last message, stop at complete message in middle
    expect(computeActiveElementCount(elements)).toBe(1);
  });

  it('returns 1 when tool is in approval_request state', () => {
    const elements = [
      createMessage({ id: '1', isComplete: true }),
      createTool({
        id: 't1',
        state: { type: 'approval_request', content: 'approve?', availableScopes: ['once'] },
      }),
    ];
    expect(computeActiveElementCount(elements)).toBe(1);
  });

  it('returns 0 when encountering an error element', () => {
    const elements = [createMessage({ id: '1', isComplete: true }), createError({ id: 'e1' })];
    expect(computeActiveElementCount(elements)).toBe(0);
  });
});
