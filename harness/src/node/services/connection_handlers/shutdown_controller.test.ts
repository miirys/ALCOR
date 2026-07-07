import { TestLogger } from '@gitlab-org/logging';
import { ExecutorManager } from '@gitlab-org/workflow-executor/node';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ShutdownController } from './shutdown_controller';

describe('ShutdownController', () => {
  let controller: ShutdownController;
  let logger: TestLogger;
  let executorManager: ExecutorManager;

  beforeEach(() => {
    logger = new TestLogger();
    executorManager = createFakePartial<ExecutorManager>({
      disposeAsync: jest.fn().mockResolvedValue(undefined),
    });

    controller = new ShutdownController(logger, executorManager);
  });

  describe('shutdown', () => {
    it('should disconnect all workflow executors', async () => {
      const result = await controller.shutdown();
      expect(executorManager.disposeAsync).toHaveBeenCalled();

      expect(result).toBeNull();
    });
  });

  describe('endpoints', () => {
    it('should provide endpoints from the controller', () => {
      const endpoints = controller.getEndpoints();

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].methodName).toBe('shutdown');
      expect(endpoints[0].type).toBe('request');
    });
  });
});
