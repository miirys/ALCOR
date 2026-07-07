import type { Connection } from 'vscode-languageserver';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type ErrorNotifier, DefaultErrorNotifier } from './error_notifier';

describe('Error Notifier', () => {
  let log: Logger;
  let connection: jest.Mocked<Connection>;
  let errorNotifier: ErrorNotifier;
  const mockShowErrorMessage = jest.fn();
  const mockShowDocument = jest.fn();

  beforeEach(() => {
    // FIXME: Use TestLogger
    log = createFakePartial<Logger>({ error: jest.fn() });
    connection = {
      window: {
        showErrorMessage: mockShowErrorMessage,
        showDocument: mockShowDocument,
      },
    } as unknown as jest.Mocked<Connection>;
    errorNotifier = new DefaultErrorNotifier(connection, log);
  });

  describe('showErrorMessage', () => {
    const message = 'Message.';
    const docUrl = 'https://example.com';

    it('calls LS showErrorMessage with expected params', async () => {
      await errorNotifier.showErrorMessage({ message, docUrl });

      expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);
      const expectedMessage = `${message} View the logs for more details.`;
      expect(mockShowErrorMessage).toHaveBeenCalledWith(expectedMessage);
    });

    it('logs error with docUrl', async () => {
      await errorNotifier.showErrorMessage({ message, docUrl });
      expect(log.error).toHaveBeenCalledTimes(1);
      const expectedMessage = `${message} See ${docUrl} for more details.`;
      expect(log.error).toHaveBeenCalledWith(expectedMessage);
    });

    it('does not repeatedly show error message when one is already shown', async () => {
      await errorNotifier.showErrorMessage({ message, docUrl });
      await errorNotifier.showErrorMessage({ message, docUrl });
      await errorNotifier.showErrorMessage({ message, docUrl });

      expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledTimes(3);
    });
  });
});
