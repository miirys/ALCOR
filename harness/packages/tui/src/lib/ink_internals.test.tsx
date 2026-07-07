import { EventEmitter } from 'node:events';
import { describe, it, expect } from '@jest/globals';
import { Text, render } from 'ink';
import { captureInkInstance } from './ink_internals';

const makeFakeStdout = (): NodeJS.WriteStream => {
  const stream = new EventEmitter() as unknown as NodeJS.WriteStream;
  (stream as unknown as { write: () => boolean }).write = () => true;
  Object.defineProperty(stream, 'columns', { value: 80, configurable: true });
  Object.defineProperty(stream, 'rows', { value: 24, configurable: true });
  Object.defineProperty(stream, 'isTTY', { value: false, configurable: true });
  return stream;
};

describe('captureInkInstance', () => {
  it('captures an Ink instance with the fields the resize hack mutates', () => {
    const stdout = makeFakeStdout();
    const { result, ink } = captureInkInstance(stdout, () =>
      render(<Text>x</Text>, { stdout, exitOnCtrlC: false, patchConsole: false }),
    );

    try {
      if (!ink) throw new Error('captureInkInstance failed to intercept the WeakMap entry');
      expect(typeof ink.lastOutput).toBe('string');

      // fullStaticOutput must be writable.
      ink.fullStaticOutput = 'sentinel';
      expect(ink.fullStaticOutput).toBe('sentinel');
    } finally {
      result.unmount();
    }
  });
});
