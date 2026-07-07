import { AsyncDisposable, createInterfaceId, ServiceLocator } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { NodeExecutor } from './node/node_executor';
import { NodeExecutorWithRetry } from './node/node_executor_with_retry';

export const EXECUTOR_IDLE_DISPOSE_TIME_MS = 30 * 60 * 1000; // 30 minutes

type ExecutorEntry = {
  executor: NodeExecutor;
  disposeTimeout?: NodeJS.Timeout;
};

export interface ExecutorManager extends AsyncDisposable {
  getExecutorForWorkflow(workflowId: string): NodeExecutor;
  setupExecutorDisposal(workflowId: string): void;
  clearExecutorDisposal(workflowId: string): void;
  disposeExecutor(workflowId: string): Promise<void>;
}

export const ExecutorManager = createInterfaceId<ExecutorManager>('ExecutorManager');

export class DefaultExecutorManager implements ExecutorManager {
  #nodeExecutors = new Map<string, ExecutorEntry>();

  #logger: Logger;

  #container: ServiceLocator;

  constructor(container: ServiceLocator, logger: Logger) {
    this.#container = container;
    this.#logger = withPrefix(logger, '[ExecutorManager]');
  }

  getExecutorForWorkflow(workflowId: string): NodeExecutor {
    if (!this.#nodeExecutors.has(workflowId)) {
      this.#nodeExecutors.set(workflowId, {
        executor: this.#createExecutor(),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#nodeExecutors.get(workflowId)!.executor;
  }

  setupExecutorDisposal(workflowId: string): void {
    const executorEntry = this.#nodeExecutors.get(workflowId);
    if (!executorEntry) {
      return;
    }

    const timeout = setTimeout(() => {
      this.disposeExecutor(workflowId).catch((err) => {
        this.#logger.error(`Error disposing executor for workflow "${workflowId}"`, err);
      });
    }, EXECUTOR_IDLE_DISPOSE_TIME_MS);
    this.#nodeExecutors.set(workflowId, {
      executor: executorEntry.executor,
      disposeTimeout: timeout,
    });
  }

  clearExecutorDisposal(workflowId: string): void {
    const executorEntry = this.#nodeExecutors.get(workflowId);
    if (!executorEntry?.disposeTimeout) {
      return;
    }

    clearTimeout(executorEntry.disposeTimeout);
    this.#nodeExecutors.set(workflowId, {
      executor: executorEntry.executor,
      disposeTimeout: undefined,
    });
  }

  async disposeExecutor(workflowId: string): Promise<void> {
    this.#logger.debug(`Disposing executor for workflow "${workflowId}".`);
    const { executor, disposeTimeout } = this.#nodeExecutors.get(workflowId) || {};
    clearTimeout(disposeTimeout);

    await executor?.disposeAsync();
    this.#nodeExecutors.delete(workflowId);
  }

  async disposeAsync(): Promise<void> {
    this.#logger.info(`Disposing ExecutorManager (${this.#nodeExecutors.size} active executors)`);
    const workflowIds = [...this.#nodeExecutors.keys()];
    await Promise.all(workflowIds.map((workflowId) => this.disposeExecutor(workflowId)));
  }

  #createExecutor(): NodeExecutor {
    this.#logger.debug(`Creating Duo Workflow Executor with type "node"`);

    return this.#container.getRequiredService(NodeExecutorWithRetry);
  }
}
