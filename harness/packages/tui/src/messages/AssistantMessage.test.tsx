import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { AssistantMessage } from './AssistantMessage';

describe('AssistantMessage', () => {
  it('should render assistant message content', () => {
    const message = {
      id: '1',
      type: 'message' as const,
      role: 'assistant' as const,
      content: 'Hi there!',
      timestamp: Date.now(),
      isComplete: true,
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('●');
    expect(output).toContain('Hi there!');
  });

  it('should render nothing for empty content', () => {
    const message = {
      id: '2',
      type: 'message' as const,
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
      isComplete: false,
    };

    const { lastFrame } = render(<AssistantMessage message={message} />);

    expect(lastFrame()).toBe('');
  });
});
