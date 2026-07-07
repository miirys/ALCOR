import { describe, it, expect } from '@jest/globals';
import type { ChatElement, Message } from '../../types';
import { computeStaticElements } from './compute_static_elements';

const makeMessage = (id: string, isComplete: boolean): Message => ({
  id,
  type: 'message',
  role: 'assistant',
  content: '',
  timestamp: 0,
  isComplete,
});

describe('computeStaticElements', () => {
  const elements: ChatElement[] = [
    makeMessage('1', true),
    makeMessage('2', true),
    makeMessage('3', false),
  ];

  it('disables optimization when allDataInitialized is false', () => {
    expect(computeStaticElements(elements, false)).toEqual({
      useStaticOptimization: false,
      frozenElements: [],
      liveElements: [],
    });
  });

  it('splits elements into frozen and live zones when enabled', () => {
    const result = computeStaticElements(elements, true);
    expect(result.useStaticOptimization).toBe(true);
    expect(result.frozenElements.map((e) => e.id)).toEqual(['1', '2']);
    expect(result.liveElements.map((e) => e.id)).toEqual(['3']);
  });
});
