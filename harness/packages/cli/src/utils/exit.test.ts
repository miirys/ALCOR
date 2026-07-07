import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ServiceProvider } from '@gitlab/needle';
import { Logger, LogWriter } from '@gitlab-org/logging';
import { ExitHandler } from './exit';

describe('ExitHandler', () => {
  let exitHandler: ExitHandler;
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let processOnSpy: jest.SpiedFunction<typeof process.on>;

  beforeEach(() => {
    jest.useFakeTimers();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processOnSpy = jest.spyOn(process, 'on').mockImplementation((() => process) as never);
    exitHandler = new ExitHandler();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('registers SIGINT handler', () => {
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('registers SIGTERM handler', () => {
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('registers SIGCONT handler', () => {
      expect(processOnSpy).toHaveBeenCalledWith('SIGCONT', expect.any(Function));
    });
  });

  describe('resume (SIGCONT)', () => {
    const getSigcontHandler = (): (() => void) => {
      const call = processOnSpy.mock.calls.find(([signal]) => signal === 'SIGCONT');
      return call?.[1] as () => void;
    };

    it('calls the TUI resume callback', () => {
      const resume = jest.fn<() => void>();
      exitHandler.setTuiResume(resume);

      getSigcontHandler()();

      expect(resume).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no resume callback is set', () => {
      expect(() => getSigcontHandler()()).not.toThrow();
    });

    it('swallows errors thrown by the resume callback', () => {
      exitHandler.setTuiResume(
        jest.fn<() => void>().mockImplementation(() => {
          throw new Error('resume failed');
        }),
      );

      expect(() => getSigcontHandler()()).not.toThrow();
    });

    it('does not resume while shutting down', async () => {
      const resume = jest.fn<() => void>();
      exitHandler.setTuiResume(resume);

      const exitPromise = exitHandler.exit(0);
      getSigcontHandler()();

      expect(resume).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();
      await exitPromise;
    });
  });

  describe('exit', () => {
    describe('exit code', () => {
      it.each([
        { code: 0, description: 'success code' },
        { code: 1, description: 'general error code' },
        { code: 42, description: 'arbitrary code' },
      ])('exits with $description ($code)', async ({ code }) => {
        const exitPromise = exitHandler.exit(code);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(processExitSpy).toHaveBeenCalledWith(code);
      });
    });

    describe('when called multiple times', () => {
      it('only processes shutdown once', async () => {
        const exitPromise1 = exitHandler.exit(0);
        const exitPromise2 = exitHandler.exit(1);
        await jest.runAllTimersAsync();
        await Promise.race([exitPromise1, exitPromise2]);

        expect(processExitSpy).toHaveBeenCalledTimes(1);
        expect(processExitSpy).toHaveBeenCalledWith(0);
      });
    });

    describe('when TUI cleanup is set', () => {
      let mockTuiCleanup: jest.MockedFunction<() => Promise<void>>;

      beforeEach(() => {
        mockTuiCleanup = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        exitHandler.setTuiCleanup(mockTuiCleanup);
      });

      it('calls TUI cleanup before exiting', async () => {
        const exitPromise = exitHandler.exit(0);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(mockTuiCleanup).toHaveBeenCalledTimes(1);
      });

      describe('when TUI cleanup throws', () => {
        beforeEach(() => {
          mockTuiCleanup.mockRejectedValue(new Error('TUI cleanup failed'));
        });

        it('continues with exit', async () => {
          const exitPromise = exitHandler.exit(0);
          await jest.runAllTimersAsync();
          await exitPromise;

          expect(processExitSpy).toHaveBeenCalledWith(0);
        });
      });
    });

    describe('when DI container is set', () => {
      let mockContainer: ServiceProvider;
      let mockDisposeAsync: jest.MockedFunction<() => Promise<void>>;
      let mockLogWriter: LogWriter;
      let mockFlush: jest.MockedFunction<() => Promise<void>>;

      beforeEach(() => {
        mockDisposeAsync = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        mockFlush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        mockLogWriter = createFakePartial<LogWriter>({
          flush: mockFlush,
        });
        mockContainer = createFakePartial<ServiceProvider>({
          dispose: mockDisposeAsync,
          getRequiredService: jest.fn().mockImplementation((service) => {
            if (service === Logger) {
              return { info: jest.fn(), error: jest.fn() };
            }
            if (service === LogWriter) {
              return mockLogWriter;
            }
            return {};
          }) as ServiceProvider['getRequiredService'],
        });
        exitHandler.setDiContainer(mockContainer);
      });

      it('disposes DI container before exiting', async () => {
        const exitPromise = exitHandler.exit(0);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(mockDisposeAsync).toHaveBeenCalledTimes(1);
      });

      it('flushes log writer before exiting', async () => {
        const exitPromise = exitHandler.exit(0);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(mockFlush).toHaveBeenCalledTimes(1);
      });

      describe('when DI disposal throws', () => {
        beforeEach(() => {
          mockDisposeAsync.mockRejectedValue(new Error('DI cleanup failed'));
        });

        it('continues with exit', async () => {
          const exitPromise = exitHandler.exit(0);
          await jest.runAllTimersAsync();
          await exitPromise;

          expect(processExitSpy).toHaveBeenCalledWith(0);
        });
      });
    });

    describe('finalMessage', () => {
      let stderrWriteSpy: jest.SpiedFunction<typeof process.stderr.write>;

      beforeEach(() => {
        stderrWriteSpy = jest
          .spyOn(process.stderr, 'write')
          .mockImplementation((() => true) as never);
      });

      it('writes the final message to stderr after TUI cleanup, with the given exit code', async () => {
        const finalMessage =
          'GitLab Duo CLI encountered an unexpected error and had to close.\n\nboom\n\nPlease start a new session and run /feedback to report this bug.';
        const callOrder: string[] = [];
        exitHandler.setTuiCleanup(
          jest.fn<() => Promise<void>>().mockImplementation(async () => {
            callOrder.push('cleanup');
          }),
        );
        stderrWriteSpy.mockImplementation((() => {
          callOrder.push('write');
          return true;
        }) as never);

        const exitPromise = exitHandler.exit(1, { finalMessage });
        await jest.runAllTimersAsync();
        await exitPromise;

        // Written after cleanup so it lands below the restored screen.
        expect(callOrder).toEqual(['cleanup', 'write']);
        expect(stderrWriteSpy).toHaveBeenCalledWith(`${finalMessage}\n`);
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });
    });

    describe('exitCode', () => {
      it('is undefined before exit is called', () => {
        expect(exitHandler.exitCode).toBeUndefined();
      });

      it('is set before container disposal', async () => {
        let codeAtDisposal: number | undefined;
        exitHandler.setDiContainer(
          createFakePartial<ServiceProvider>({
            dispose: jest.fn<() => Promise<void>>().mockImplementation(async () => {
              codeAtDisposal = exitHandler.exitCode;
            }),
            getRequiredService: jest.fn().mockReturnValue({
              info: jest.fn(),
              error: jest.fn(),
            }) as ServiceProvider['getRequiredService'],
          }),
        );

        const exitPromise = exitHandler.exit(42);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(codeAtDisposal).toBe(42);
      });
    });

    describe('cleanup order', () => {
      let mockTuiCleanup: jest.MockedFunction<() => Promise<void>>;
      let mockDisposeAsync: jest.MockedFunction<() => Promise<void>>;
      let callOrder: string[];

      beforeEach(() => {
        callOrder = [];
        mockTuiCleanup = jest.fn<() => Promise<void>>().mockImplementation(async () => {
          callOrder.push('tui');
        });
        mockDisposeAsync = jest.fn<() => Promise<void>>().mockImplementation(async () => {
          callOrder.push('di');
        });

        exitHandler.setTuiCleanup(mockTuiCleanup);
        exitHandler.setDiContainer(
          createFakePartial<ServiceProvider>({
            dispose: mockDisposeAsync,
            getRequiredService: jest.fn().mockReturnValue({
              info: jest.fn(),
              error: jest.fn(),
            }) as ServiceProvider['getRequiredService'],
          }),
        );
      });

      it('cleans up TUI before DI container', async () => {
        const exitPromise = exitHandler.exit(0);
        await jest.runAllTimersAsync();
        await exitPromise;

        expect(callOrder).toEqual(['tui', 'di']);
      });
    });
  });
});
