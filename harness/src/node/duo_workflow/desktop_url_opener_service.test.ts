import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { showDocumentRequest } from './workflow_rpc_messages';
import { DefaultDesktopWorkflowUrlOpenerService } from './desktop_url_opener_service';

jest.useFakeTimers();

describe('DefaultDesktopWorkflowUrlOpenerService', () => {
  let desktopWorkflowUrlOpenerService: DefaultDesktopWorkflowUrlOpenerService;
  let mockRpcMessageSender: RpcMessageSender;
  let mockLogger: TestLogger;
  const testUrl = 'https://gitlab.com/test/url';

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockRpcMessageSender = createFakePartial<RpcMessageSender>({
      send: jest.fn(),
    });

    desktopWorkflowUrlOpenerService = new DefaultDesktopWorkflowUrlOpenerService(
      mockLogger,
      mockRpcMessageSender,
    );
  });

  describe('openUrl', () => {
    describe('when rpc command succeeds', () => {
      beforeEach(() => {
        jest.mocked(mockRpcMessageSender.send).mockResolvedValue(undefined);
      });

      it('sends the openURL request with the correct URL', async () => {
        await desktopWorkflowUrlOpenerService.openUrl(testUrl);

        expect(mockRpcMessageSender.send).toHaveBeenCalledWith(showDocumentRequest, {
          uri: testUrl,
          external: true,
          takeFocus: true,
        });
      });

      it('logs a debug message when successful', async () => {
        await desktopWorkflowUrlOpenerService.openUrl(testUrl);

        expect(mockLogger.debugLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(`Trying to open url (${testUrl})`),
          }),
        );
      });
    });

    describe('when rpc command fails', () => {
      const errorMessage = 'Failed to open URL';

      beforeEach(() => {
        jest.mocked(mockRpcMessageSender.send).mockRejectedValue(new Error(errorMessage));
      });

      it('catches the error and logs an info message', async () => {
        await desktopWorkflowUrlOpenerService.openUrl(testUrl);

        expect(mockLogger.infoLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(`Failed to open url (${testUrl}): ${errorMessage}`),
          }),
        );
      });
    });
  });
});
