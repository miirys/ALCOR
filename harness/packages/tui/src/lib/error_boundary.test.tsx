import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ErrorBoundary } from './error_boundary';

const Boom = (): never => {
  throw new Error('render boom');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders children when no error is thrown', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <Text>hello</Text>
      </ErrorBoundary>,
    );

    expect(lastFrame()).toContain('hello');
  });

  it('renders the null fallback and re-throws the caught error asynchronously', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Fallback is `null`, so nothing from the child is rendered.
    expect(lastFrame()).not.toContain('boom');
    // The scheduled re-throw fires when the timer runs, escaping React's
    // render cycle to become a Node uncaughtException.
    expect(() => jest.runAllTimers()).toThrow('render boom');
  });
});
