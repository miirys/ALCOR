import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { ServiceLocator } from '@gitlab/needle';
import { NodeExecutor } from './node/node_executor';
import { NodeExecutorWithRetry } from './node/node_executor_with_retry';
import { DefaultExecutorManager, EXECUTOR_IDLE_DISPOSE_TIME_MS } from './executor_manager';

describe('ExecutorManager', () => {
  let executorManager: DefaultExecutorManager;
  let mockContainer: ServiceLocator;
  let mockNodeExecutor: NodeExecutor;
  let mockLogger: TestLogger;

  beforeEach(() => {
    jest.useFakeTimers();
    mockLogger = new TestLogger();

    mockNodeExecutor = createFakePartial<NodeExecutor>({
      disposeAsync: jest.fn().mockResolvedValue(undefined),
      stopWorkflow: jest.fn(),
    });

    mockContainer = createFakePartial<ServiceLocator>({
      getRequiredService: jest.fn().mockReturnValue(mockNodeExecutor),
    });

    executorManager = new DefaultExecutorManager(mockContainer, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getExecutorForWorkflow', () => {
    it('should create new executor for new workflow', () => {
      const executor = executorManager.getExecutorForWorkflow('workflow-1');

      expect(mockContainer.getRequiredService).toHaveBeenCalledTimes(1);
      expect(mockContainer.getRequiredService).toHaveBeenCalledWith(NodeExecutorWithRetry);
      expect(executor).toBe(mockNodeExecutor);
    });

    it('should reuse existing executor for same workflow', () => {
      const executor1 = executorManager.getExecutorForWorkflow('workflow-1');
      const executor2 = executorManager.getExecutorForWorkflow('workflow-1');

      expect(mockContainer.getRequiredService).toHaveBeenCalledTimes(1);
      expect(executor1).toBe(executor2);
    });

    it('should create separate executors for different workflows', () => {
      const executor1 = executorManager.getExecutorForWorkflow('workflow-1');
      const executor2 = executorManager.getExecutorForWorkflow('workflow-2');

      expect(mockContainer.getRequiredService).toHaveBeenCalledTimes(2);
      expect(executor1).toBe(mockNodeExecutor);
      expect(executor2).toBe(mockNodeExecutor);
    });
  });

  describe('disposal timeout system', () => {
    beforeEach(() => {
      executorManager.getExecutorForWorkflow('workflow-1');
    });

    it('should set up disposal timeout', async () => {
      executorManager.setupExecutorDisposal('workflow-1');

      expect(mockNodeExecutor.disposeAsync).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(EXECUTOR_IDLE_DISPOSE_TIME_MS);

      expect(mockNodeExecutor.disposeAsync).toHaveBeenCalled();
    });

    it('should clear existing timeout', async () => {
      executorManager.setupExecutorDisposal('workflow-1');
      executorManager.clearExecutorDisposal('workflow-1');

      await jest.advanceTimersByTimeAsync(EXECUTOR_IDLE_DISPOSE_TIME_MS);

      expect(mockNodeExecutor.disposeAsync).not.toHaveBeenCalled();
    });

    it('should dispose executor immediately', async () => {
      await executorManager.disposeExecutor('workflow-1');

      expect(mockNodeExecutor.disposeAsync).toHaveBeenCalled();
    });
  });

  describe('disposeAsync', () => {
    it('should dispose all executors', async () => {
      executorManager.getExecutorForWorkflow('workflow-1');
      executorManager.getExecutorForWorkflow('workflow-2');

      await executorManager.disposeAsync();

      expect(mockNodeExecutor.disposeAsync).toHaveBeenCalledTimes(2);
    });
  });
});
