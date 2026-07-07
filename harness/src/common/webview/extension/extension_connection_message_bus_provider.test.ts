import { Connection } from 'vscode-languageserver';
import { Logger } from '@gitlab-org/logging';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { ExtensionConnectionMessageBus } from './extension_connection_message_bus';
import { ExtensionConnectionMessageBusProvider } from './extension_connection_message_bus_provider';

describe('ExtensionConnectionMessageBusProvider', () => {
  let mockConnection: Connection;
  let mockChannel: string;
  let mockLogger: Logger;
  let provider: ExtensionConnectionMessageBusProvider;

  beforeEach(() => {
    mockConnection = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
    } as unknown as Connection;
    mockChannel = 'mockChannel';
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    provider = new ExtensionConnectionMessageBusProvider({
      connection: mockConnection,
      notificationRpcMethod: mockChannel,
      requestRpcMethod: mockChannel,
      logger: mockLogger,
    });
  });

  describe('getMessageBus', () => {
    it('returns an instance of ExtensionConnectionMessageBus', () => {
      // Arrange
      const webviewId = 'mockWebviewId' as WebviewId;

      // Act
      const messageBus = provider.getMessageBus(webviewId);

      // Assert
      expect(messageBus).toBeInstanceOf(ExtensionConnectionMessageBus);
    });
  });

  describe('#setupConnectionSubscriptions', () => {
    it('sets up connection subscriptions for notifications', () => {
      // Assert
      expect(mockConnection.onNotification).toHaveBeenCalled();
    });

    it('sets up connection subscriptions for requests', () => {
      // Assert
      expect(mockConnection.onRequest).toHaveBeenCalled();
    });
  });
});
