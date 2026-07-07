import {
  generateErrorMessageFromStatusCode,
  WorkflowStatusCode,
  WorkflowStatusCodeMessages,
  isWorkflowExecutorErrorEvent,
  WorkflowExecutorError,
  WorkflowRetryEvent,
  WorkflowStreamEvent,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';
import { DuoWorkflowTracker } from '@gitlab-org/telemetry';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { calculateExponentialBackoff, delay } from '@gitlab-org/resiliency';
import { RunWorkflowOptions } from '../executor';
import { WorkflowTokenService } from '../../api/workflow_token_service';

import { NodeExecutor } from './node_executor';
import { resolveWorkflowStatusCode } from './resolve_status_code';

export interface NodeExecutorWithRetry extends NodeExecutor {}

export const NodeExecutorWithRetry = createInterfaceId<NodeExecutor>('NodeExecutor');

/**
 * Maximum number of retry attempts for workflow execution.
 * With exponential backoff (base 1s, exponent 2), retries are spread
 * across the stop-handshake window so that if the previous session stops quickly,
 * an earlier retry will succeed rather than waiting a fixed initial delay.
 *
 * Delay schedule: 0s → 1s → 2s → 4s → 8s
 */
const MAX_EXECUTOR_RETRY_ATTEMPTS = 5;

@Service({
  dependencies: [DuoWorkflowTracker, NodeExecutor, Logger, WorkflowTokenService],
  lifetime: ServiceLifetime.Transient,
})
@Implements(NodeExecutorWithRetry)
export class DefaultNodeExecutorWithRetry implements NodeExecutorWithRetry {
  #nodeExecutor: NodeExecutor;

  #logger: Logger;

  #workflowTokenService: WorkflowTokenService;

  #abortPendingRetryController = new AbortController();

  constructor(
    _duoWorkflowTracker: DuoWorkflowTracker,
    nodeExecutor: NodeExecutor,
    logger: Logger,
    workflowTokenService: WorkflowTokenService,
  ) {
    this.#nodeExecutor = nodeExecutor;
    this.#logger = logger;
    this.#workflowTokenService = workflowTokenService;
  }

  async disposeAsync(): Promise<void> {
    await this.#nodeExecutor.disposeAsync();
  }

  async *runWorkflow(opts: RunWorkflowOptions): AsyncGenerator<WorkflowStreamEvent, void, unknown> {
    this.#abortPendingRetryController = new AbortController();

    try {
      for (let attempt = 1; attempt <= MAX_EXECUTOR_RETRY_ATTEMPTS; attempt++) {
        if (this.#abortPendingRetryController.signal.aborted) {
          // User cancelled the workflow during the previous attempt or backoff, so don't try the workflow again
          return;
        }

        try {
          // Retries send an empty goal to signal the backend that this is a retry vs a new prompt
          const isRetry = attempt > 1;
          const runOpts = isRetry ? { ...opts, goal: '' } : opts;

          const result = yield* this.#attemptWorkflowExecution(runOpts, attempt);

          if (!result.needsRetry) {
            return; // Either succeeded or hit final failure
          }

          // Surface retry progress to consumers, then apply backoff before the next attempt.
          const backoffMs = calculateExponentialBackoff(attempt);
          yield this.#createRetryEvent(attempt, backoffMs);

          // eslint-disable-next-line no-await-in-loop
          await delay(backoffMs, this.#abortPendingRetryController.signal);
          if (this.#abortPendingRetryController.signal.aborted) {
            return;
          }
        } catch (error) {
          const statusCode = resolveWorkflowStatusCode(error);

          if (this.#shouldAttemptRetry(attempt, statusCode)) {
            const message = generateErrorMessageFromStatusCode(statusCode);
            this.#logger.warn(
              `Workflow execution failed, retrying (${attempt}/${MAX_EXECUTOR_RETRY_ATTEMPTS}): ${message}`,
            );

            const backoffMs = calculateExponentialBackoff(attempt);
            yield this.#createRetryEvent(attempt, backoffMs);

            // eslint-disable-next-line no-await-in-loop
            await delay(backoffMs, this.#abortPendingRetryController.signal);
            if (this.#abortPendingRetryController.signal.aborted) {
              return;
            }
          } else {
            // Final failure - yield error event for the exception
            this.#logger.error(
              `Max retries exceeded or non-retryable error: ${generateErrorMessageFromStatusCode(statusCode)}`,
            );
            yield new WorkflowExecutorError(
              WorkflowStatusCodeMessages[statusCode] ||
                generateErrorMessageFromStatusCode(statusCode),
              statusCode,
            );
            return;
          }
        }
      }
    } finally {
      // Revoke the token once the run is complete (including after all retry attempts)
      await this.#revokeActiveToken(opts);
    }
  }

  async #revokeActiveToken(opts: RunWorkflowOptions): Promise<void> {
    const { workflowId, type } = opts;

    if (type === WorkflowType.CHAT) {
      return;
    }

    const token = this.#workflowTokenService.getTokenFromCache({
      workflowType: type ?? WorkflowType.SOFTWARE_DEVELOPMENT,
      workflowId,
    });

    if (!token) {
      return;
    }

    try {
      await this.#workflowTokenService.revokeToken(workflowId, token);
    } catch {
      // Nothing to do, the error was already logged inside the tokenService
    }
  }

  async *#attemptWorkflowExecution(
    opts: RunWorkflowOptions,
    attempt: number,
  ): AsyncGenerator<WorkflowStreamEvent, { needsRetry: boolean }, unknown> {
    const workflowEvents = this.#nodeExecutor.runWorkflow(opts);

    for await (const event of workflowEvents) {
      if (!isWorkflowExecutorErrorEvent(event)) {
        yield event;
        // eslint-disable-next-line no-continue
        continue;
      }

      if (this.#shouldAttemptRetry(attempt, event.statusCode)) {
        const message = generateErrorMessageFromStatusCode(event.statusCode);
        this.#logger.warn(
          `Workflow execution failed, retrying (${attempt}/${MAX_EXECUTOR_RETRY_ATTEMPTS}): ${message}`,
        );
        return { needsRetry: true };
      }

      this.#logger.error(
        `Max retries exceeded or non-retryable error: ${generateErrorMessageFromStatusCode(event.statusCode)}`,
      );
      yield event; // final error is yielded to consumers
      return { needsRetry: false };
    }

    // If we got here, all events were processed successfully
    return { needsRetry: false };
  }

  #createRetryEvent(attempt: number, backoffMs: number): WorkflowRetryEvent {
    return {
      kind: 'retry',
      attempt,
      maxAttempts: MAX_EXECUTOR_RETRY_ATTEMPTS,
      backoffMs,
    };
  }

  #shouldAttemptRetry(attempt: number, statusCode: WorkflowStatusCode): boolean {
    return attempt < MAX_EXECUTOR_RETRY_ATTEMPTS && this.#shouldRetryStatusCode(statusCode);
  }

  #shouldRetryStatusCode(statusCode: WorkflowStatusCode): boolean {
    const nonRetryableCodes = [
      WorkflowStatusCode.AUTH_TOKEN_ERROR,
      WorkflowStatusCode.INVALID_API_CONFIGURATION,
    ];
    return !nonRetryableCodes.includes(statusCode);
  }

  stopWorkflow() {
    // Ensure we abort any in-progress retry/backoff-delay so we don't re-start a workflow
    this.#abortPendingRetryController.abort();
    this.#nodeExecutor.stopWorkflow();
  }

  interruptRunningCommand() {
    this.#nodeExecutor.interruptRunningCommand();
  }

  isCommandRunning(): boolean {
    return this.#nodeExecutor.isCommandRunning();
  }
}
