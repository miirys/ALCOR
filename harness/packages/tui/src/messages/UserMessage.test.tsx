import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { UserMessage } from './UserMessage';

describe('UserMessage', () => {
  it('should render user message content', () => {
    const testDate = new Date('2024-01-01T15:30:00');
    const message = {
      id: '1',
      type: 'message' as const,
      role: 'user' as const,
      content: 'Hello world',
      timestamp: testDate.getTime(),
      isComplete: true,
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    const output = lastFrame();

    expect(output).toContain('Hello world');
  });

  it('should render > prefix in build mode', () => {
    const message = {
      id: '2',
      type: 'message' as const,
      role: 'user' as const,
      content: 'Build task',
      timestamp: Date.now(),
      isComplete: true,
      agentMode: 'build' as const,
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    expect(lastFrame()).toContain('❯ ');
  });

  it('should render * prefix in plan mode', () => {
    const message = {
      id: '3',
      type: 'message' as const,
      role: 'user' as const,
      content: 'Plan task',
      timestamp: Date.now(),
      isComplete: true,
      agentMode: 'plan' as const,
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    expect(lastFrame()).toContain('▤ ');
  });

  it('should render without columns prop', () => {
    const message = {
      id: '4',
      type: 'message' as const,
      role: 'user' as const,
      content: 'No columns',
      timestamp: Date.now(),
      isComplete: true,
    };

    const { lastFrame } = render(<UserMessage message={message} />);
    expect(lastFrame()).toContain('No columns');
  });
});
