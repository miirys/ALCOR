import { TestLogger } from '@gitlab-org/logging';
import { SystemContextManager } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConnectionService } from '@gitlab-org/legacy-common';
import { DefaultSystemContextInitializedHandler } from './system_context_initialized_handler';

describe('SystemContextInitializedHandler', () => {
  let systemContextManager: SystemContextManager;
  let logger: TestLogger;
  let registeredHandler: () => void;
  let connectionService: ConnectionService;

  beforeEach(() => {
    systemContextManager = createFakePartial<SystemContextManager>({
      precalculateOnInitialized: jest.fn().mockResolvedValue(undefined),
    });
    logger = new TestLogger();
    connectionService = createFakePartial<ConnectionService>({
      registerInitializedHandler: jest.fn().mockImplementation((handler: () => void) => {
        registeredHandler = handler;
      }),
    });
    const handler = new DefaultSystemContextInitializedHandler(
      systemContextManager,
      logger,
      connectionService,
    );
    expect(handler).toBeDefined();
  });

  it('registers an initialized handler on the connection service', () => {
    expect(connectionService.registerInitializedHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  describe('when the initialized handler is called', () => {
    describe('when precalculateOnInitialized succeeds', () => {
      it('calls precalculateOnInitialized on the system context manager', async () => {
        registeredHandler();

        await new Promise(process.nextTick);

        expect(systemContextManager.precalculateOnInitialized).toHaveBeenCalled();
      });
    });

    describe('when precalculateOnInitialized fails', () => {
      beforeEach(() => {
        jest
          .mocked(systemContextManager.precalculateOnInitialized)
          .mockRejectedValue(new Error('Precalculation failed'));
      });

      it('logs the error', async () => {
        registeredHandler();

        await new Promise(process.nextTick);

        expect(logger.errorLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'Failed to precalculate system context on initialized',
            ),
          }),
        );
      });

      it('does not throw', () => {
        expect(() => registeredHandler()).not.toThrow();
      });
    });
  });
});
