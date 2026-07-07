import {
  DuoWorkflowEvent,
  WorkflowStatusCode,
  DuoWorkflowStatus,
  WorkflowExecutorError,
  WorkflowRetryEvent,
  isWorkflowRetryEvent,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';
import { DuoWorkflowTracker } from '@gitlab-org/telemetry';
import { Logger } from '@gitlab-org/logging';
import { delay } from '@gitlab-org/resiliency';
import { asyncGeneratorFromArray, createFakePartial } from '@gitlab-org/test-utils';
import { RunWorkflowOptions } from '../executor';
import { WorkflowTokenService } from '../../api/workflow_token_service';
import { NodeExecutor } from './node_executor';
import { DefaultNodeExecutorWithRetry } from './node_executor_with_retry';

jest.mock('@gitlab-org/resiliency', () => ({
  ...jest.requireActual('@gitlab-org/resiliency'),
  delay: jest.fn(),
}));

describe('NodeExecutorWithRetry', () => {
  let nodeExecutorWithRetry: DefaultNodeExecutorWithRetry;
  let mockNodeExecutor: NodeExecutor;
  let mockLogger: Logger;
  let mockDuoWorkflowTracker: DuoWorkflowTracker;
  let mockWorkflowTokenService: WorkflowTokenService;
  let mockDelay: jest.MockedFunction<typeof delay>;

  const createRunWorkflowOptions = (type?: WorkflowType): RunWorkflowOptions => ({
    workflowId: 'test-workflow-123',
    goal: 'Test goal',
    type,
    workspaceFolderPath: '/test/workspace',
    workspaceFolderUri: 'file:///test/workspace',
    additionalContext: [],
    metadata: {},
  });

  const mockWorkflowToken = {
    duo_workflow_service: { token: 'dws-token', token_expires_at: 9999999999 },
    gitlab_rails: { token: 'rails-token', token_expires_at: 9999999999 },
    workflow_metadata: { extended_logging: false },
    server_capabilities: [],
  };

  const createDuoWorkflowEvent = (status: DuoWorkflowStatus): DuoWorkflowEvent => ({
    checkpoint: 'test-checkpoint',
    errors: [],
    workflowGoal: 'test',
    workflowStatus: status,
  });

  const createWorkflowErrorEvent = (
    statusCode: WorkflowStatusCode,
    message = 'Test error message',
  ): WorkflowExecutorError => new WorkflowExecutorError(message, statusCode);

  beforeEach(() => {
    jest.useFakeTimers();
    mockDelay = jest.mocked(delay);
    // Mirror the real delay() abort semantics so the retry wrapper's abort path
    // (which delegates to delay(ms, signal)) resolves promptly when stopped.
    mockDelay.mockImplementation(
      (ms, signal) =>
        new Promise((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, ms);
          function onAbort() {
            clearTimeout(timer);
            resolve();
          }
          signal?.addEventListener('abort', onAbort, { once: true });
        }),
    );

    mockDuoWorkflowTracker = createFakePartial<DuoWorkflowTracker>({});

    mockLogger = createFakePartial<Logger>({
      warn: jest.fn(),
      error: jest.fn(),
    });

    mockNodeExecutor = createFakePartial<NodeExecutor>({
      runWorkflow: jest.fn(),
      disposeAsync: jest.fn().mockResolvedValue(undefined),
      stopWorkflow: jest.fn(),
      interruptRunningCommand: jest.fn(),
      isCommandRunning: jest.fn().mockReturnValue(false),
    });

    mockWorkflowTokenService = createFakePartial<WorkflowTokenService>({
      getTokenFromCache: jest.fn().mockReturnValue(mockWorkflowToken),
      revokeToken: jest.fn().mockResolvedValue(undefined),
    });

    nodeExecutorWithRetry = new DefaultNodeExecutorWithRetry(
      mockDuoWorkflowTracker,
      mockNodeExecutor,
      mockLogger,
      mockWorkflowTokenService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes without circuit breaker dependencies', () => {
      expect(nodeExecutorWithRetry).toBeInstanceOf(DefaultNodeExecutorWithRetry);
    });
  });

  describe('dispose', () => {
    it('delegates to the underlying node executor', async () => {
      await nodeExecutorWithRetry.disposeAsync();

      expect(mockNodeExecutor.disposeAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopWorkflow', () => {
    it('delegates to the underlying node executor', () => {
      nodeExecutorWithRetry.stopWorkflow();

      expect(mockNodeExecutor.stopWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  describe('interruptRunningCommand', () => {
    it('delegates to the underlying node executor', () => {
      nodeExecutorWithRetry.interruptRunningCommand();

      expect(mockNodeExecutor.interruptRunningCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('isCommandRunning', () => {
    describe('when the underlying executor reports a command is running', () => {
      beforeEach(() => {
        jest.mocked(mockNodeExecutor.isCommandRunning).mockReturnValue(true);
      });

      it('returns true', () => {
        expect(nodeExecutorWithRetry.isCommandRunning()).toBe(true);
      });
    });

    describe('when the underlying executor reports no command is running', () => {
      it('returns false', () => {
        expect(nodeExecutorWithRetry.isCommandRunning()).toBe(false);
      });
    });
  });

  describe('runWorkflow', () => {
    describe('when workflow succeeds on first attempt', () => {
      let mockWorkflowGenerator: AsyncGenerator<DuoWorkflowEvent>;
      let options: RunWorkflowOptions;

      beforeEach(() => {
        options = createRunWorkflowOptions();

        mockWorkflowGenerator = asyncGeneratorFromArray([
          createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
          createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED),
        ]);

        jest.mocked(mockNodeExecutor.runWorkflow).mockReturnValue(mockWorkflowGenerator);
      });

      it('yields all events without retrying', async () => {
        const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];

        for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
          events.push(event);
        }

        expect(events).toHaveLength(2);
        expect(events[0]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
        expect(events[1]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED));
        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(1);
        expect(mockDelay).not.toHaveBeenCalled();
      });
    });

    describe('when workflow fails with retryable error then succeeds', () => {
      let options: RunWorkflowOptions;
      let firstAttemptGenerator: AsyncGenerator<DuoWorkflowEvent | WorkflowExecutorError>;
      let secondAttemptGenerator: AsyncGenerator<DuoWorkflowEvent>;

      beforeEach(() => {
        options = createRunWorkflowOptions();

        firstAttemptGenerator = asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
          createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
          createWorkflowErrorEvent(
            WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
            'Connection failed',
          ),
        ]);

        secondAttemptGenerator = asyncGeneratorFromArray([
          createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
          createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED),
        ]);

        jest
          .mocked(mockNodeExecutor.runWorkflow)
          .mockReturnValueOnce(firstAttemptGenerator)
          .mockReturnValueOnce(secondAttemptGenerator);
      });

      it('yields events from first attempt, retries with backoff, then yields success events', async () => {
        const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

        const generatorPromise = (async () => {
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }
        })();

        // Fast-forward through the delay
        await jest.advanceTimersByTimeAsync(1000);

        await generatorPromise;

        // Filter out the interleaved retry event to assert on the real workflow events.
        const realEvents = events.filter((event) => !isWorkflowRetryEvent(event));
        expect(realEvents).toHaveLength(3); // 1 from first attempt + 2 from second attempt
        expect(realEvents[0]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
        expect(realEvents[1]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
        expect(realEvents[2]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED));

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ goal: 'Test goal' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockDelay).toHaveBeenCalledTimes(1); // Should be called once for retry
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Workflow execution failed, retrying (1/5): Workflow could not connect to the Workflow service. See also https://docs.gitlab.com/user/duo_agent_platform/troubleshooting/#network-issues',
        );
      });
    });

    describe('when workflow fails with non-retryable error', () => {
      let options: RunWorkflowOptions;
      let mockWorkflowGenerator: AsyncGenerator<DuoWorkflowEvent | WorkflowExecutorError>;

      beforeEach(() => {
        options = createRunWorkflowOptions();

        mockWorkflowGenerator = asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
          createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
          createWorkflowErrorEvent(WorkflowStatusCode.AUTH_TOKEN_ERROR, 'Auth token error'),
        ]);

        jest.mocked(mockNodeExecutor.runWorkflow).mockReturnValue(mockWorkflowGenerator);
      });

      it('yields events then immediately yields the error without retrying', async () => {
        const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];

        for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
          events.push(event);
        }

        expect(events).toHaveLength(2);
        expect(events[0]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
        expect(events[1]).toEqual(
          createWorkflowErrorEvent(WorkflowStatusCode.AUTH_TOKEN_ERROR, 'Auth token error'),
        );

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(1);
        expect(mockDelay).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Max retries exceeded or non-retryable error: Workflow could not use your token to connect to your GitLab instance.',
        );
      });
    });

    describe('when workflow fails with retryable error and exhausts all retries', () => {
      let options: RunWorkflowOptions;

      beforeEach(() => {
        options = createRunWorkflowOptions();

        const makeFailingGenerator = () =>
          asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
            createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
            createWorkflowErrorEvent(
              WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
              'Connection failed',
            ),
          ]);

        jest
          .mocked(mockNodeExecutor.runWorkflow)
          .mockReturnValueOnce(makeFailingGenerator())
          .mockReturnValueOnce(makeFailingGenerator())
          .mockReturnValueOnce(makeFailingGenerator())
          .mockReturnValueOnce(makeFailingGenerator())
          .mockReturnValueOnce(makeFailingGenerator());
      });

      it('retries maximum times then yields final error', async () => {
        const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

        const generatorPromise = (async () => {
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }
        })();

        // Fast-forward through all delays (1s + 2s + 4s + 8s = 15s total)
        await jest.advanceTimersByTimeAsync(20_000);

        await generatorPromise;

        // Retry events are now interleaved between attempts; separate them from
        // the "real" workflow events so the original 6-event expectation holds.
        const retryEvents = events.filter(isWorkflowRetryEvent);
        const realEvents = events.filter((event) => !isWorkflowRetryEvent(event));

        expect(realEvents).toHaveLength(6); // 5 running events + 1 final error
        expect(realEvents[5]).toEqual(
          createWorkflowErrorEvent(
            WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
            'Connection failed',
          ),
        );

        // Exactly 4 retry events were emitted (after attempts 1-4, none for attempt 5).
        expect(retryEvents).toHaveLength(4);
        expect(retryEvents.map((event) => event.attempt)).toEqual([1, 2, 3, 4]);

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(5);
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ goal: 'Test goal' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          4,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          5,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockDelay).toHaveBeenCalledTimes(4); // Only 4 delays (after attempts 1–4)
        expect(mockLogger.warn).toHaveBeenCalledTimes(4);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Max retries exceeded or non-retryable error: Workflow could not connect to the Workflow service. See also https://docs.gitlab.com/user/duo_agent_platform/troubleshooting/#network-issues',
        );
      });
    });

    describe('when workflow throws an exception', () => {
      let options: RunWorkflowOptions;

      beforeEach(() => {
        options = createRunWorkflowOptions();

        jest
          .mocked(mockNodeExecutor.runWorkflow)
          .mockImplementationOnce(() => {
            throw new Error('Network error');
          })
          .mockReturnValueOnce(
            asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
          );
      });

      it('catches exception, retries, and succeeds', async () => {
        const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

        const generatorPromise = (async () => {
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }
        })();

        await jest.advanceTimersByTimeAsync(1000);
        await generatorPromise;

        // Filter out the interleaved retry event to assert on the real workflow events.
        const realEvents = events.filter((event) => !isWorkflowRetryEvent(event));
        expect(realEvents).toHaveLength(1);
        expect(realEvents[0]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED));

        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ goal: 'Test goal' }),
        );
        expect(mockNodeExecutor.runWorkflow).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ goal: '' }),
        );
        expect(mockDelay).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Workflow execution failed, retrying (1/5): Your request was valid but Workflow failed to complete it. Please try again.',
        );
      });
    });

    describe('exponential backoff delay schedule', () => {
      it('uses exact delay values: 1s after attempt 1, 2s after attempt 2, 4s after attempt 3, 8s after attempt 4', async () => {
        const options = createRunWorkflowOptions();

        const makeFailingGenerator = () =>
          asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
            createWorkflowErrorEvent(
              WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
              'Connection failed',
            ),
          ]);

        jest
          .mocked(mockNodeExecutor.runWorkflow)
          .mockReturnValueOnce(makeFailingGenerator()) // attempt 1 → delay 1s
          .mockReturnValueOnce(makeFailingGenerator()) // attempt 2 → delay 2s
          .mockReturnValueOnce(makeFailingGenerator()) // attempt 3 → delay 4s
          .mockReturnValueOnce(makeFailingGenerator()) // attempt 4 → delay 8s
          .mockReturnValueOnce(makeFailingGenerator()); // attempt 5 → final failure

        const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
        const generatorPromise = (async () => {
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }
        })();

        await jest.advanceTimersByTimeAsync(20_000);
        await generatorPromise;

        expect(mockDelay).toHaveBeenCalledTimes(4);
        expect(mockDelay).toHaveBeenNthCalledWith(1, 1_000, expect.any(AbortSignal)); // 1s after attempt 1
        expect(mockDelay).toHaveBeenNthCalledWith(2, 2_000, expect.any(AbortSignal)); // 2s after attempt 2
        expect(mockDelay).toHaveBeenNthCalledWith(3, 4_000, expect.any(AbortSignal)); // 4s after attempt 3
        expect(mockDelay).toHaveBeenNthCalledWith(4, 8_000, expect.any(AbortSignal)); // 8s after attempt 4
      });

      it('fires the first retry immediately (no delay before attempt 1)', async () => {
        const options = createRunWorkflowOptions();

        jest
          .mocked(mockNodeExecutor.runWorkflow)
          .mockReturnValueOnce(
            asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
              createWorkflowErrorEvent(
                WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                'Connection failed',
              ),
            ]),
          )
          .mockReturnValueOnce(
            asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
          );

        const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
        const generatorPromise = (async () => {
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }
        })();

        // Advance only 1s (the delay after attempt 1) to let the retry fire
        await jest.advanceTimersByTimeAsync(1_000);
        await generatorPromise;

        // Attempt 1 runs immediately; delay of 1s; attempt 2 runs and succeeds
        expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        expect(mockDelay).toHaveBeenCalledTimes(1);
        expect(mockDelay).toHaveBeenCalledWith(1_000, expect.any(AbortSignal));
      });
    });

    describe('token revocation', () => {
      describe('when the workflow succeeds on the first attempt', () => {
        it('revokes the token once for the workflow', async () => {
          const options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValue(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );

          const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }

          expect(mockWorkflowTokenService.revokeToken).toHaveBeenCalledTimes(1);
          expect(mockWorkflowTokenService.revokeToken).toHaveBeenCalledWith(
            'test-workflow-123',
            mockWorkflowToken,
          );
        });
      });

      describe('when workflow type is CHAT', () => {
        it('does not revoke the token', async () => {
          const options = createRunWorkflowOptions(WorkflowType.CHAT);

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValue(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );

          const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }

          expect(mockWorkflowTokenService.getTokenFromCache).not.toHaveBeenCalled();
          expect(mockWorkflowTokenService.revokeToken).not.toHaveBeenCalled();
        });
      });

      describe('when no cached token is available', () => {
        it('does not attempt to revoke', async () => {
          const options = createRunWorkflowOptions();

          jest.mocked(mockWorkflowTokenService.getTokenFromCache).mockReturnValue(null);

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValue(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );

          const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }

          expect(mockWorkflowTokenService.revokeToken).not.toHaveBeenCalled();
        });
      });

      describe('when a retryable error is followed by a successful retry', () => {
        it('revokes the token once after the final attempt', async () => {
          const options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(
              asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
                createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
                createWorkflowErrorEvent(
                  WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                  'WS connection failed',
                ),
              ]),
            )
            .mockReturnValueOnce(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );

          const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(1000);
          await generatorPromise;

          expect(mockWorkflowTokenService.revokeToken).toHaveBeenCalledTimes(1);
          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        });
      });

      describe('when all retries are exhausted', () => {
        it('revokes the token once after the final attempt', async () => {
          const options = createRunWorkflowOptions();

          const retryableFailure = (): AsyncGenerator<DuoWorkflowEvent | WorkflowExecutorError> =>
            asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
              createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
              createWorkflowErrorEvent(
                WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                'Connection failed',
              ),
            ]);

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure());

          const events: (DuoWorkflowEvent | WorkflowExecutorError)[] = [];
          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          // Advance past all 4 delays: 1s + 2s + 4s + 8s = 15s total
          await jest.advanceTimersByTimeAsync(20_000);
          await generatorPromise;

          expect(mockWorkflowTokenService.revokeToken).toHaveBeenCalledTimes(1);
          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(5);
        });
      });
    });

    describe('retry events', () => {
      describe('when a retryable error EVENT is followed by a successful retry', () => {
        let options: RunWorkflowOptions;

        beforeEach(() => {
          options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(
              asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
                createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
                createWorkflowErrorEvent(
                  WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                  'Connection failed',
                ),
              ]),
            )
            .mockReturnValueOnce(
              asyncGeneratorFromArray([
                createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
                createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED),
              ]),
            );
        });

        it('yields exactly one retry event between the two attempts', async () => {
          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(1000);
          await generatorPromise;

          const retryEvents = events.filter(isWorkflowRetryEvent);
          expect(retryEvents).toHaveLength(1);
          expect(retryEvents[0]).toEqual({
            kind: 'retry',
            attempt: 1,
            maxAttempts: 5,
            backoffMs: 1000,
          });

          // The retry event sits between the first attempt's events and the second.
          expect(events).toHaveLength(4);
          expect(events[0]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
          expect(isWorkflowRetryEvent(events[1])).toBe(true);
          expect(events[2]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING));
          expect(events[3]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED));

          // Real events still flow normally.
          const realEvents = events.filter((event) => !isWorkflowRetryEvent(event));
          expect(realEvents).toHaveLength(3);

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        });
      });

      describe('when a thrown exception (CATCH path) is followed by a successful retry', () => {
        let options: RunWorkflowOptions;

        beforeEach(() => {
          options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockImplementationOnce(() => {
              throw new Error('Network error');
            })
            .mockReturnValueOnce(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );
        });

        it('yields exactly one retry event before the success', async () => {
          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(1000);
          await generatorPromise;

          const retryEvents = events.filter(isWorkflowRetryEvent);
          expect(retryEvents).toHaveLength(1);
          expect(retryEvents[0]).toEqual({
            kind: 'retry',
            attempt: 1,
            maxAttempts: 5,
            backoffMs: 1000,
          });

          // Retry event is yielded before the FINISHED event.
          expect(events).toHaveLength(2);
          expect(isWorkflowRetryEvent(events[0])).toBe(true);
          expect(events[1]).toEqual(createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED));

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(2);
        });
      });

      describe('when the workflow succeeds on the first attempt', () => {
        it('yields no retry events', async () => {
          const options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValue(
              asyncGeneratorFromArray([
                createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
                createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED),
              ]),
            );

          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];
          for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
            events.push(event);
          }

          expect(events.filter(isWorkflowRetryEvent)).toHaveLength(0);
          expect(mockDelay).not.toHaveBeenCalled();
        });
      });

      describe('when all retries are exhausted', () => {
        it('yields exactly 4 retry events with the exact backoff schedule and none for attempt 5', async () => {
          const options = createRunWorkflowOptions();

          const retryableFailure = (): AsyncGenerator<DuoWorkflowEvent | WorkflowExecutorError> =>
            asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
              createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
              createWorkflowErrorEvent(
                WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                'Connection failed',
              ),
            ]);

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure())
            .mockReturnValueOnce(retryableFailure());

          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];
          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(20_000);
          await generatorPromise;

          const retryEvents = events.filter(isWorkflowRetryEvent);
          expect(retryEvents).toHaveLength(4);
          expect(retryEvents).toEqual([
            { kind: 'retry', attempt: 1, maxAttempts: 5, backoffMs: 1000 },
            { kind: 'retry', attempt: 2, maxAttempts: 5, backoffMs: 2000 },
            { kind: 'retry', attempt: 3, maxAttempts: 5, backoffMs: 4000 },
            { kind: 'retry', attempt: 4, maxAttempts: 5, backoffMs: 8000 },
          ]);

          // No retry event for attempt 5; the terminal error is still the last real event.
          const realEvents = events.filter((event) => !isWorkflowRetryEvent(event));
          expect(realEvents[realEvents.length - 1]).toEqual(
            createWorkflowErrorEvent(
              WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
              'Connection failed',
            ),
          );

          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(5);
        });
      });

      describe('when stopWorkflow is called during the backoff', () => {
        let options: RunWorkflowOptions;

        beforeEach(() => {
          options = createRunWorkflowOptions();

          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(
              asyncGeneratorFromArray<DuoWorkflowEvent | WorkflowExecutorError>([
                createDuoWorkflowEvent(DuoWorkflowStatus.RUNNING),
                createWorkflowErrorEvent(
                  WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
                  'Connection failed',
                ),
              ]),
            )
            // Would succeed on attempt 2 — but attempt 2 must never start.
            .mockReturnValueOnce(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );
        });

        it('resolves promptly, starts no further attempt, and emits no FINISHED event', async () => {
          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];
          let retrySeen = false;

          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
              if (isWorkflowRetryEvent(event)) {
                retrySeen = true;
              }
            }
          })();

          // Advance a small slice of the 1000ms backoff so attempt 1 completes and
          // the retry event is yielded, but the backoff has NOT elapsed.
          await jest.advanceTimersByTimeAsync(100);
          expect(retrySeen).toBe(true);

          // Abort during the backoff. The abort listener fires synchronously and
          // resolves the Promise.race without advancing timers.
          nodeExecutorWithRetry.stopWorkflow();

          // Flush microtasks so the awaited race settles and the loop returns.
          await Promise.resolve();
          await jest.advanceTimersByTimeAsync(0);
          await generatorPromise;

          // Attempt 2 never started.
          expect(mockNodeExecutor.runWorkflow).toHaveBeenCalledTimes(1);

          // The generator completed without yielding the FINISHED event.
          expect(
            events.some(
              (event) =>
                !isWorkflowRetryEvent(event) &&
                !(event instanceof WorkflowExecutorError) &&
                event.workflowStatus === DuoWorkflowStatus.FINISHED,
            ),
          ).toBe(false);

          // stopWorkflow delegates to the underlying executor.
          expect(mockNodeExecutor.stopWorkflow).toHaveBeenCalledTimes(1);
        });

        it('emits no further retry events after the abort lands', async () => {
          const events: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] = [];

          const generatorPromise = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(options)) {
              events.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(100);

          // Exactly one retry event so far (after attempt 1).
          expect(events.filter(isWorkflowRetryEvent)).toHaveLength(1);

          nodeExecutorWithRetry.stopWorkflow();
          await Promise.resolve();
          await jest.advanceTimersByTimeAsync(0);
          await generatorPromise;

          // No further retry events were emitted after the abort.
          expect(events.filter(isWorkflowRetryEvent)).toHaveLength(1);
        });

        it('runs normally on a subsequent run after a stop (controller is reset per run)', async () => {
          // The executor instance is reused across runs (memoized per workflowId
          // by the ExecutorManager). A stop during one run must not permanently
          // abort the next run.
          const firstRunOptions = createRunWorkflowOptions();

          const firstRunDrained: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] =
            [];
          const firstRun = (async () => {
            for await (const event of nodeExecutorWithRetry.runWorkflow(firstRunOptions)) {
              firstRunDrained.push(event);
            }
          })();

          await jest.advanceTimersByTimeAsync(100);
          nodeExecutorWithRetry.stopWorkflow();
          await Promise.resolve();
          await jest.advanceTimersByTimeAsync(0);
          await firstRun;

          // Second run on the SAME instance with a clean, successful stream.
          jest
            .mocked(mockNodeExecutor.runWorkflow)
            .mockReturnValueOnce(
              asyncGeneratorFromArray([createDuoWorkflowEvent(DuoWorkflowStatus.FINISHED)]),
            );

          const secondRunEvents: (DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent)[] =
            [];
          for await (const event of nodeExecutorWithRetry.runWorkflow(createRunWorkflowOptions())) {
            secondRunEvents.push(event);
          }

          // The second run must NOT no-op: it yields the FINISHED event.
          expect(
            secondRunEvents.some(
              (event) =>
                !isWorkflowRetryEvent(event) &&
                !(event instanceof WorkflowExecutorError) &&
                event.workflowStatus === DuoWorkflowStatus.FINISHED,
            ),
          ).toBe(true);
        });
      });
    });
  });
});
