// setup/plugin/webview_controller.test.ts

import {
  MessageMap,
  WebviewAddress,
  WebviewId,
  WebviewInstanceId,
} from '@gitlab-org/webview-plugin';
import { createMockLogger } from '../../test_utils/mocks';
import { WebviewRuntimeMessageBus, DefaultWebviewRuntimeMessageBus } from '../messaging';
import { WebviewController } from './webview_controller';

const TEST_WEBVIEW_ID = 'test-webview-id' as WebviewId;
const TEST_WEBVIEW_INSTANCE_ID = 'test-webview-instance-id' as WebviewInstanceId;
const TEST_WEBVIEW_ADDRESS: WebviewAddress = {
  webviewId: TEST_WEBVIEW_ID,
  webviewInstanceId: TEST_WEBVIEW_INSTANCE_ID,
};

describe('WebviewController', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let runtimeMessageBus: WebviewRuntimeMessageBus;
  let mockMessageBusFactory: jest.Mock;
  let controller: WebviewController<MessageMap>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    runtimeMessageBus = new DefaultWebviewRuntimeMessageBus();
    mockMessageBusFactory = jest.fn().mockReturnValue({
      dispose: jest.fn(),
    });
    controller = new WebviewController(
      TEST_WEBVIEW_ID,
      runtimeMessageBus,
      mockMessageBusFactory,
      mockLogger,
    );
  });

  describe('constructor', () => {
    it('should initialize with the correct webviewId', () => {
      // Assert
      expect(controller.webviewId).toBe(TEST_WEBVIEW_ID);
    });

    it('should set up event subscriptions', () => {
      // Assert
      expect(runtimeMessageBus.hasListeners('webview:connect')).toBe(true);
      expect(runtimeMessageBus.hasListeners('webview:disconnect')).toBe(true);
    });
  });

  describe('onInstanceConnected', () => {
    it('should add the handler and manage disposables', () => {
      const mockDisposable = {
        dispose: jest.fn(),
      };
      const mockHandler = jest.fn().mockReturnValue(mockDisposable);

      controller.onInstanceConnected(mockHandler);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);

      expect(mockHandler).toHaveBeenCalledWith(TEST_WEBVIEW_INSTANCE_ID, expect.anything());

      runtimeMessageBus.publish('webview:disconnect', TEST_WEBVIEW_ADDRESS);
      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should allow multiple handlers', () => {
      // Arrange
      const mockHandler1 = jest.fn();
      const mockHandler2 = jest.fn();

      // Act
      controller.onInstanceConnected(mockHandler1);
      controller.onInstanceConnected(mockHandler2);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);

      // Assert
      expect(mockHandler1).toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send the notification to all connected instances', () => {
      const mockMessageBus1 = { sendNotification: jest.fn() };
      const mockMessageBus2 = { sendNotification: jest.fn() };
      mockMessageBusFactory
        .mockReturnValueOnce(mockMessageBus1)
        .mockReturnValueOnce(mockMessageBus2);

      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);
      runtimeMessageBus.publish('webview:connect', {
        ...TEST_WEBVIEW_ADDRESS,
        webviewInstanceId: 'instance2' as WebviewInstanceId,
      });

      const notificationType = 'testNotification';
      const notificationPayload = { data: 'testData' };
      controller.broadcast(notificationType, notificationPayload);

      expect(mockMessageBus1.sendNotification).toHaveBeenCalledWith(
        notificationType,
        notificationPayload,
      );
      expect(mockMessageBus2.sendNotification).toHaveBeenCalledWith(
        notificationType,
        notificationPayload,
      );
    });

    it('should not send notifications if there are no connected instances', () => {
      const mockMessageBus = { sendNotification: jest.fn() };
      mockMessageBusFactory.mockReturnValue(mockMessageBus);

      const notificationType = 'testNotification';
      const notificationPayload = { data: 'testData' };
      controller.broadcast(notificationType, notificationPayload);

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalled();
    });

    it('should only send notifications to instances connected with the same webviewId', () => {
      const mockMessageBus1 = { sendNotification: jest.fn() };
      const mockMessageBus2 = { sendNotification: jest.fn() };
      mockMessageBusFactory
        .mockReturnValueOnce(mockMessageBus1)
        .mockReturnValueOnce(mockMessageBus2);

      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);
      runtimeMessageBus.publish('webview:connect', {
        webviewId: 'different-id' as WebviewId,
        webviewInstanceId: 'instance2' as WebviewInstanceId,
      });

      const notificationType = 'testNotification';
      const notificationPayload = { data: 'testData' };
      controller.broadcast(notificationType, notificationPayload);

      expect(mockMessageBus1.sendNotification).toHaveBeenCalledWith(
        notificationType,
        notificationPayload,
      );
      expect(mockMessageBus2.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('instance connection', () => {
    it('should create a new message bus for a new instance', () => {
      // Arrange
      const address = TEST_WEBVIEW_ADDRESS;

      // Act
      runtimeMessageBus.publish('webview:connect', address);

      // Assert
      expect(mockMessageBusFactory).toHaveBeenCalledWith(address);
    });

    it('should not create a new message bus for an already connected instance', () => {
      // Arrange
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);
      mockMessageBusFactory.mockClear();

      // Act
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);

      // Assert
      expect(mockMessageBusFactory).not.toHaveBeenCalled();
    });

    it('should ignore connections for different webviewIds', () => {
      // Arrange
      const differentAddress: WebviewAddress = {
        ...TEST_WEBVIEW_ADDRESS,
        webviewId: 'different-id' as WebviewId,
      };

      // Act
      runtimeMessageBus.publish('webview:connect', differentAddress);

      // Assert
      expect(mockMessageBusFactory).not.toHaveBeenCalled();
    });
  });

  describe('instance disconnection', () => {
    it('should dispose the message bus on disconnection', () => {
      // Arrange
      const mockMessageBus = { dispose: jest.fn() };
      mockMessageBusFactory.mockReturnValue(mockMessageBus);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);

      // Act
      runtimeMessageBus.publish('webview:disconnect', TEST_WEBVIEW_ADDRESS);

      // Assert
      expect(mockMessageBus.dispose).toHaveBeenCalled();
    });

    it('should ignore disconnections for untracked instances', () => {
      // Arrange
      const mockMessageBus = { dispose: jest.fn() };
      mockMessageBusFactory.mockReturnValue(mockMessageBus);

      // Act
      runtimeMessageBus.publish('webview:disconnect', TEST_WEBVIEW_ADDRESS);

      // Assert
      expect(mockMessageBus.dispose).not.toHaveBeenCalled();
    });

    it('should ignore disconnections for different webviewIds', () => {
      // Arrange
      const mockMessageBus = { dispose: jest.fn() };
      mockMessageBusFactory.mockReturnValue(mockMessageBus);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);
      const differentAddress: WebviewAddress = {
        ...TEST_WEBVIEW_ADDRESS,
        webviewId: 'different-id' as WebviewId,
      };

      // Act
      runtimeMessageBus.publish('webview:disconnect', differentAddress);

      // Assert
      expect(mockMessageBus.dispose).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose all message buses', () => {
      // Arrange
      const mockMessageBus1 = { dispose: jest.fn() };
      const mockMessageBus2 = { dispose: jest.fn() };
      mockMessageBusFactory
        .mockReturnValueOnce(mockMessageBus1)
        .mockReturnValueOnce(mockMessageBus2);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);
      runtimeMessageBus.publish('webview:connect', {
        ...TEST_WEBVIEW_ADDRESS,
        webviewInstanceId: 'instance2' as WebviewInstanceId,
      });

      // Act
      controller.dispose();

      // Assert
      expect(mockMessageBus1.dispose).toHaveBeenCalled();
      expect(mockMessageBus2.dispose).toHaveBeenCalled();
    });

    it('should remove all event listeners', () => {
      // Arrange
      // Act
      controller.dispose();

      // Assert
      expect(runtimeMessageBus.hasListeners('webview:connect')).toBe(false);
      expect(runtimeMessageBus.hasListeners('webview:disconnect')).toBe(false);
    });

    it('should not react to events after disposal', () => {
      // Arrange
      controller.dispose();
      const mockHandler = jest.fn();

      // Act
      controller.onInstanceConnected(mockHandler);
      runtimeMessageBus.publish('webview:connect', TEST_WEBVIEW_ADDRESS);

      // Assert
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockMessageBusFactory).not.toHaveBeenCalled();
    });
  });
});
