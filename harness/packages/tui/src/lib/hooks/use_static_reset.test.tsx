import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import React from 'react';
import { Text } from 'ink';
import { useStaticReset } from './use_static_reset';

const TestComponent: React.FC<{ sessionId?: string }> = ({ sessionId }) => {
  const nonce = useStaticReset(sessionId);
  return <Text>nonce:{nonce}</Text>;
};

// Drain Ink's render scheduler after a non-React state update.
const flushScheduledRender = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('useStaticReset', () => {
  it('bumps the nonce on each resize event', async () => {
    const { stdout, lastFrame } = render(<TestComponent sessionId="s1" />);

    stdout.emit('resize');
    await flushScheduledRender();
    expect(lastFrame()).toContain('nonce:1');

    stdout.emit('resize');
    await flushScheduledRender();
    expect(lastFrame()).toContain('nonce:2');
  });

  it('bumps the nonce when switching between established sessions', async () => {
    const { lastFrame, rerender } = render(<TestComponent sessionId="s1" />);
    expect(lastFrame()).toContain('nonce:0');

    rerender(<TestComponent sessionId="s2" />);
    await flushScheduledRender();
    expect(lastFrame()).toContain('nonce:1');
  });

  it('does not bump the nonce on the initial session assignment', async () => {
    const { lastFrame, rerender } = render(<TestComponent sessionId={undefined} />);

    rerender(<TestComponent sessionId="s1" />);
    await flushScheduledRender();
    expect(lastFrame()).toContain('nonce:0');
  });
});
