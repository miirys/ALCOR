/* eslint-disable no-restricted-syntax -- module-scoped mocks from jest.unstable_mockModule aren't auto-cleared */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ChatElement, ErrorMessage, Message, ToolCall } from '@gitlab-org/tui';
import { AgentEventType, type RetryAgentEvent } from '../backend/backend';

const mockOpenSync = jest.fn<typeof import('node:fs').openSync>();
const mockWriteSync = jest.fn<typeof import('node:fs').writeSync>();
const mockCloseSync = jest.fn<typeof import('node:fs').closeSync>();

jest.unstable_mockModule('node:fs', () => ({
  openSync: mockOpenSync,
  writeSync: mockWriteSync,
  closeSync: mockCloseSync,
}));

const { TerminalProgressService: TerminalProgressServiceImpl } = await import(
  './terminal_progress_service'
);

async function* streamOf(
  ...elements: (ChatElement | RetryAgentEvent)[]
): AsyncGenerator<ChatElement | RetryAgentEvent> {
  for (const el of elements) {
    yield el;
  }
}

// eslint-disable-next-line require-yield
async function* throwingStream(): AsyncGenerator<ChatElement | RetryAgentEvent> {
  throw new Error('stream failure');
}

async function collectAll(
  gen: AsyncGenerator<ChatElement | RetryAgentEvent>,
): Promise<(ChatElement | RetryAgentEvent)[]> {
  const results: (ChatElement | RetryAgentEvent)[] = [];
  for await (const el of gen) {
    results.push(el);
  }
  return results;
}

const retryEvent: RetryAgentEvent = {
  type: AgentEventType.Retry,
  attempt: 1,
  maxAttempts: 5,
  backoffMs: 3000,
  timestamp: 1000,
};

const messageElement = createFakePartial<Message>({
  type: 'message',
  role: 'assistant',
  content: 'hello',
  isComplete: true,
});

const errorElement = createFakePartial<ErrorMessage>({
  type: 'error',
  error: 'something went wrong',
});

const approvalElement = createFakePartial<ToolCall>({
  type: 'tool',
  name: 'write_file',
  state: { type: 'approval_request', content: '' },
});

describe('TerminalProgressService', () => {
  const originalEnv = { ...process.env };
  const originalIsTTY = process.stdout.isTTY;
  let service: InstanceType<typeof TerminalProgressServiceImpl>;

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  describe('when not in a TTY environment', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      mockOpenSync.mockClear();
      service = new TerminalProgressServiceImpl(new TestLogger());
    });

    it('does not attempt to open /dev/tty', () => {
      expect(mockOpenSync).not.toHaveBeenCalled();
    });

    it('trackStream passes through elements without writing OSC', async () => {
      const elements = await collectAll(service.trackStream(streamOf(messageElement)));

      expect(elements).toEqual([messageElement]);
      expect(mockWriteSync).not.toHaveBeenCalled();
    });
  });

  describe('when /dev/tty is unavailable', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      mockOpenSync.mockImplementation(() => {
        throw new Error('ENOENT: /dev/tty not found');
      });
      service = new TerminalProgressServiceImpl(new TestLogger());
    });

    it('trackStream passes through elements without writing OSC', async () => {
      const elements = await collectAll(service.trackStream(streamOf(messageElement)));

      expect(elements).toEqual([messageElement]);
      expect(mockWriteSync).not.toHaveBeenCalled();
    });
  });

  describe('when in a TTY environment with /dev/tty available', () => {
    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.TMUX;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      mockOpenSync.mockReturnValue(3 as unknown as ReturnType<typeof import('node:fs').openSync>);
      mockWriteSync.mockReturnValue(
        undefined as unknown as ReturnType<typeof import('node:fs').writeSync>,
      );
      service = new TerminalProgressServiceImpl(new TestLogger());
      mockWriteSync.mockClear();
    });

    describe('trackStream', () => {
      describe('when the stream completes normally', () => {
        it('writes busy then idle', async () => {
          await collectAll(service.trackStream(streamOf(messageElement)));

          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;0\x1b\\');
        });

        it('passes through all elements unchanged', async () => {
          const elements = await collectAll(
            service.trackStream(streamOf(messageElement, messageElement)),
          );

          expect(elements).toHaveLength(2);
          expect(elements[0]).toEqual(messageElement);
          expect(elements[1]).toEqual(messageElement);
        });
      });

      describe('when the last element is an error', () => {
        it('writes busy then error', async () => {
          await collectAll(service.trackStream(streamOf(messageElement, errorElement)));

          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;2\x1b\\');
        });
      });

      describe('when the last element is a tool awaiting approval', () => {
        it('writes busy then paused', async () => {
          await collectAll(service.trackStream(streamOf(approvalElement)));

          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;4;50\x1b\\');
        });
      });

      describe('when a retry event is in the stream', () => {
        it('passes the retry event through and ignores it for the OSC indicator', async () => {
          const elements = await collectAll(
            service.trackStream(streamOf(retryEvent, messageElement)),
          );

          // Retry event is forwarded unchanged alongside the real element.
          expect(elements).toHaveLength(2);
          expect(elements[0]).toEqual(retryEvent);
          expect(elements[1]).toEqual(messageElement);

          // The terminal indicator goes busy then idle: the retry does not set
          // an error/paused state (it is excluded from lastElement tracking).
          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;0\x1b\\');
        });
      });

      describe('when the stream throws', () => {
        it('writes busy then error and re-throws', async () => {
          await expect(collectAll(service.trackStream(throwingStream()))).rejects.toThrow(
            'stream failure',
          );

          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;2\x1b\\');
        });
      });

      describe('when the stream is empty', () => {
        it('writes busy then idle', async () => {
          await collectAll(service.trackStream(streamOf()));

          expect(mockWriteSync).toHaveBeenCalledTimes(2);
          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;0\x1b\\');
        });
      });

      describe('when paused then resumed', () => {
        it('resets to busy on the new stream', async () => {
          await collectAll(service.trackStream(streamOf(approvalElement)));
          mockWriteSync.mockClear();

          await collectAll(service.trackStream(streamOf(messageElement)));

          expect(mockWriteSync).toHaveBeenNthCalledWith(1, 3, '\x1b]9;4;3\x1b\\');
          expect(mockWriteSync).toHaveBeenNthCalledWith(2, 3, '\x1b]9;4;0\x1b\\');
        });
      });

      describe('when writeSync fails mid-stream', () => {
        it('continues yielding elements without crashing', async () => {
          mockWriteSync.mockImplementation(() => {
            throw new Error('EIO: broken tty');
          });

          const elements = await collectAll(
            service.trackStream(streamOf(messageElement, messageElement)),
          );

          expect(elements).toHaveLength(2);
          expect(elements[0]).toEqual(messageElement);
          expect(elements[1]).toEqual(messageElement);
        });

        it('disables further writes after the first failure', async () => {
          let callCount = 0;
          mockWriteSync.mockImplementation(() => {
            callCount += 1;
            if (callCount === 1) throw new Error('EIO: broken tty');
            return undefined as unknown as ReturnType<typeof import('node:fs').writeSync>;
          });

          await collectAll(service.trackStream(streamOf(messageElement)));

          expect(callCount).toBe(1);
        });
      });
    });

    describe('when running inside tmux', () => {
      beforeEach(() => {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
        service = new TerminalProgressServiceImpl(new TestLogger());
        mockWriteSync.mockClear();
      });

      it('wraps sequences in tmux DCS passthrough', async () => {
        await collectAll(service.trackStream(streamOf(messageElement)));

        expect(mockWriteSync).toHaveBeenNthCalledWith(
          1,
          3,
          '\x1bPtmux;\x1b\x1b]9;4;3\x1b\x1b\\\x1b\\',
        );
        expect(mockWriteSync).toHaveBeenNthCalledWith(
          2,
          3,
          '\x1bPtmux;\x1b\x1b]9;4;0\x1b\x1b\\\x1b\\',
        );
      });
    });

    describe('dispose', () => {
      beforeEach(() => {
        mockCloseSync.mockClear();
      });

      it('clears progress and closes the tty handle', () => {
        service.dispose();

        expect(mockWriteSync).toHaveBeenCalledWith(3, '\x1b]9;4;0\x1b\\');
        expect(mockCloseSync).toHaveBeenCalledWith(3);
      });

      describe('when no tty was opened', () => {
        beforeEach(() => {
          mockOpenSync.mockImplementation(() => {
            throw new Error('ENOENT');
          });
          service = new TerminalProgressServiceImpl(new TestLogger());
        });

        it('does not call closeSync', () => {
          service.dispose();

          expect(mockCloseSync).not.toHaveBeenCalled();
        });
      });
    });
  });
});
