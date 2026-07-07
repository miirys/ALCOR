import { Connection } from 'vscode-languageserver';
import { isDisposable } from '@gitlab-org/disposable';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { NullLogger } from '@gitlab-org/logging';
import { ExtensionMessageHandlerRegistry } from './utils/extension_message_handler_registry';
import { ExtensionConnectionMessageBus } from './extension_connection_message_bus';

describe('ExtensionConnectionMessageBus', () => {
  const TEST_CHANNELS = {
    request: 'mockRequestChannel',
    notification: 'mockNotificationChannel',
  };
  const TEST_WEBVIEW_ID = 'mockWebviewId' as WebviewId;

  let mockConnection: Connection;
  let notificationHandlers: ExtensionMessageHandlerRegistry;
  let requestHandlers: ExtensionMessageHandlerRegistry;
  let bus: ExtensionConnectionMessageBus;

  beforeEach(() => {
    mockConnection = {
      sendRequest: jest.fn(),
      sendNotification: jest.fn(),
    } as unknown as Connection;
    notificationHandlers = new ExtensionMessageHandlerRegistry();
    requestHandlers = new ExtensionMessageHandlerRegistry();

    bus = new ExtensionConnectionMessageBus({
      pluginId: TEST_WEBVIEW_ID,
      connection: mockConnection,
      rpcMethods: TEST_CHANNELS,
      handlers: {
        notification: notificationHandlers,
        request: requestHandlers,
      },
      logger: new NullLogger(),
    });
  });

  describe('onRequest', () => {
    it('registers a request handler', () => {
      // Arrange
      const requestType = 'requestType';
      const handler = jest.fn();

      // Act
      const disposable = bus.onRequest(requestType, handler);

      // Assert
      expect(requestHandlers.has({ pluginId: TEST_WEBVIEW_ID, type: requestType })).toBeTruthy();
      expect(isDisposable(disposable)).toBeTruthy();
    });
  });

  describe('onNotification', () => {
    it('registers a notification handler', () => {
      // Arrange
      const notificationType = 'notificationType';
      const handler = jest.fn();

      // Act
      const disposable = bus.onNotification(notificationType, handler);

      // Assert
      expect(
        notificationHandlers.has({ pluginId: TEST_WEBVIEW_ID, type: notificationType }),
      ).toBeTruthy();
      expect(isDisposable(disposable)).toBeTruthy();
    });
  });

  describe('sendRequest', () => {
    it('sends a request via the connection', async () => {
      // Arrange
      const requestType = 'requestType';
      const payload = { param: 'value' };
      mockConnection.sendRequest = jest.fn().mockResolvedValue('response');

      // Act
      const result = await bus.sendRequest(requestType, payload);

      // Assert
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(TEST_CHANNELS.request, {
        pluginId: TEST_WEBVIEW_ID,
        type: requestType,
        payload,
      });
      expect(result).toBe('response');
    });
  });

  describe('sendNotification', () => {
    it('sends a notification via the connection', async () => {
      // Arrange
      const notificationType = 'notificationType';
      const payload = { param: 'value' };

      // Act
      await bus.sendNotification(notificationType, payload);

      // Assert
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(TEST_CHANNELS.notification, {
        pluginId: TEST_WEBVIEW_ID,
        type: notificationType,
        payload,
      });
    });
  });
});
