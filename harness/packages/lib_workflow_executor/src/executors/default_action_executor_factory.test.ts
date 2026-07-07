import { createFakePartial } from '@gitlab-org/test-utils';
import { Logger } from '@gitlab-org/logging';
import { DefaultActionExecutorFactory } from './default_action_executor_factory';
import { WorkflowActionHandler } from './node/actions';
import { DirectActionExecutor } from './direct_action_executor';

describe('DefaultActionExecutorFactory', () => {
  let mockLogger: Logger;
  let mockHandlers: WorkflowActionHandler[];

  beforeEach(() => {
    mockLogger = createFakePartial<Logger>({
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    });
    mockHandlers = [];
  });

  describe('#createExecutor', () => {
    it('returns a DirectActionExecutor', () => {
      const factory = new DefaultActionExecutorFactory(mockLogger, mockHandlers);
      const executor = factory.createExecutor();

      expect(executor).toBeInstanceOf(DirectActionExecutor);
    });

    it('returns a new instance on each call', () => {
      const factory = new DefaultActionExecutorFactory(mockLogger, mockHandlers);
      const first = factory.createExecutor();
      const second = factory.createExecutor();

      expect(first).not.toBe(second);
    });
  });
});
