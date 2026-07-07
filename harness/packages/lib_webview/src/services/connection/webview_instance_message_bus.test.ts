import { WebviewAddress, WebviewId, WebviewInstanceId } from '@gitlab-org/webview-plugin';
import { createMockLogger } from '../../test_utils/mocks';
import { DefaultWebviewRuntimeMessageBus, WebviewRuntimeMessageBus } from '../messaging';
import { WebviewInstanceMessageBus } from './webview_instance_message_bus';

const TEST_WEBVIEW_ID = 'test-webview-id' as WebviewId;
const TEST_WEBVIEW_INSTANCE_ID = 'test-webview-instance-id' as WebviewInstanceId;
const TEST_WEBVIEW_ADDRESS: WebviewAddress = {
  webviewId: TEST_WEBVIEW_ID,
  webviewInstanceId: TEST_WEBVIEW_INSTANCE_ID,
};

describe('WebviewInstanceMessageBus', () => {
  let runtimeMessageBus: WebviewRuntimeMessageBus;
  let address: WebviewAddress;
  let messageBus: WebviewInstanceMessageBus;

  beforeEach(() => {
    runtimeMessageBus = new DefaultWebviewRuntimeMessageBus();
    address = TEST_WEBVIEW_ADDRESS;
    messageBus = new WebviewInstanceMessageBus(address, runtimeMessageBus, createMockLogger());
    jest.useFakeTimers();
  });

  describe('constructor', () => {
    it('should initialize and set up event subscriptions', () => {
      expect(runtimeMessageBus.hasListeners('webview:notification')).toBe(true);
      expect(runtimeMessageBus.hasListeners('webview:request')).toBe(true);
      expect(runtimeMessageBus.hasListeners('webview:response')).toBe(true);
    });
  });

  describe('sendNotification', () => {
    it('should publish a notification event', () => {
      // Arrange
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      const type = 'test-notification';
      const payload = { data: 'test' };

      // Act
      messageBus.sendNotification(type, payload);

      // Assert
      expect(publishSpy).toHaveBeenCalledWith('plugin:notification', {
        ...address,
        type,
        payload,
      });
    });
  });

  describe('onNotification', () => {
    it('should register a notification handler and trigger it when a matching notification is received', (done) => {
      // Arrange
      const type = 'test-notification';
      const payload = { data: 'test' };

      // Act
      messageBus.onNotification(type, (data) => {
        // Assert
        expect(data).toEqual(payload);
        done();
      });

      runtimeMessageBus.publish('webview:notification', { ...address, type, payload });
    });

    it('should not trigger for non-matching notification types', () => {
      // Arrange
      const handler = jest.fn();
      messageBus.onNotification('test-type', handler);

      // Act
      runtimeMessageBus.publish('webview:notification', {
        ...address,
        type: 'other-type',
        payload: {},
      });

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return a disposable that removes the handler when disposed', () => {
      // Arrange
      const type = 'test-notification';
      const handler = jest.fn();
      const disposable = messageBus.onNotification(type, handler);

      // Act
      disposable.dispose();
      runtimeMessageBus.publish('webview:notification', { ...address, type, payload: {} });

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('sendRequest', () => {
    it('should send a request and resolve with the response', async () => {
      // Arrange
      const type = 'test-request';
      const payload = { data: 'test' };
      const response = { result: 'success' };
      let capturedRequestId: string | undefined;
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const subscription = runtimeMessageBus.subscribe('plugin:request', (message) => {
        capturedRequestId = message.requestId;
      });

      // Act
      const requestPromise = messageBus.sendRequest(type, payload);
      runtimeMessageBus.publish('webview:response', {
        ...address,
        requestId: capturedRequestId!,
        type,
        success: true,
        payload: response,
      });

      // Assert
      expect(publishSpy).toHaveBeenCalledWith(
        'plugin:request',
        expect.objectContaining({
          ...address,
          type,
          payload,
        }),
      );
      expect(capturedRequestId).toBeDefined();
      await expect(requestPromise).resolves.toEqual(response);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      subscription.dispose();
    });

    it('should reject if the request times out', async () => {
      // Arrange
      jest.useFakeTimers();

      // Act
      const requestPromise = messageBus.sendRequest('test-request');
      jest.advanceTimersByTime(10000);

      // Assert
      await expect(requestPromise).rejects.toThrow('Request timed out');
      jest.useRealTimers();
    });

    it('should reject if the response indicates failure', async () => {
      // Arrange
      const type = 'test-request';
      let capturedRequestId: string | undefined;
      const subscription = runtimeMessageBus.subscribe('plugin:request', (message) => {
        capturedRequestId = message.requestId;
      });

      // Act
      const requestPromise = messageBus.sendRequest(type);
      runtimeMessageBus.publish('webview:response', {
        ...address,
        requestId: capturedRequestId!,
        type,
        success: false,
        reason: 'Test failure',
      });

      // Assert
      await expect(requestPromise).rejects.toThrow('Test failure');
      subscription.dispose();
    });

    it('should handle multiple concurrent requests', async () => {
      // Arrange
      const type = 'test-request';
      const payload1 = { data: 'test1' };
      const payload2 = { data: 'test2' };
      const response1 = { result: 'success1' };
      const response2 = { result: 'success2' };
      const subscription = runtimeMessageBus.subscribe('plugin:request', (message) => {
        runtimeMessageBus.publish('webview:response', {
          ...address,
          requestId: message.requestId,
          type,
          success: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: (message.payload as any).data === 'test1' ? response1 : response2,
        });
      });

      // Act
      const [result1, result2] = await Promise.all([
        messageBus.sendRequest(type, payload1),
        messageBus.sendRequest(type, payload2),
      ]);

      // Assert
      expect(result1).toEqual(response1);
      expect(result2).toEqual(response2);
      subscription.dispose();
    });
  });

  describe('onRequest', () => {
    it('should handle synchronous requests and send successful responses', async () => {
      // Arrange
      const type = 'test-request';
      const payload = { data: 'test' };
      const requestId = 'test-id';
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      messageBus.onRequest(type, (data) => {
        expect(data).toEqual(payload);
        return { result: 'success' };
      });

      // Act
      runtimeMessageBus.publish('webview:request', {
        ...address,
        requestId,
        type,
        payload,
      });
      await jest.runAllTimersAsync();

      // Assert
      expect(publishSpy).toHaveBeenCalledWith(
        'plugin:response',
        expect.objectContaining({
          ...address,
          requestId,
          type,
          success: true,
          payload: { result: 'success' },
        }),
      );
    });

    it('should handle async requests and send successful response', async () => {
      // Arrange
      const type = 'test-request';
      const payload = { data: 'test' };
      const requestId = 'test-id';
      const response = { result: 'async-success' };
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      messageBus.onRequest(type, async (data) => {
        expect(data).toEqual(payload);
        await Promise.resolve(); // async handler
        return response;
      });

      // Act
      runtimeMessageBus.publish('webview:request', {
        ...address,
        requestId,
        type,
        payload,
      });
      await jest.runAllTimersAsync();

      // Assert
      expect(publishSpy).toHaveBeenCalledWith(
        'plugin:response',
        expect.objectContaining({
          ...address,
          requestId,
          type,
          success: true,
          payload: response,
        }),
      );
    });

    it('should handle errors in request handlers and send failure responses', async () => {
      // Arrange
      const type = 'test-request';
      const requestId = 'test-id';
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      messageBus.onRequest(type, () => {
        throw new Error('Test error');
      });

      // Act
      runtimeMessageBus.publish('webview:request', {
        ...address,
        requestId,
        type,
        payload: {},
      });

      // Assert
      expect(publishSpy).toHaveBeenCalledWith(
        'plugin:response',
        expect.objectContaining({
          ...address,
          requestId,
          type,
          success: false,
          reason: 'Test error',
        }),
      );
    });

    it('should not handle requests for unregistered types', async () => {
      // Arrange
      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');

      // Act
      runtimeMessageBus.publish('webview:request', {
        ...address,
        requestId: 'test-id',
        type: 'unregistered-type',
        payload: {},
      });

      // Assert
      expect(publishSpy).not.toHaveBeenCalledWith('plugin:response', expect.anything());
    });

    it('should return a disposable that removes the request handler when disposed', async () => {
      // Arrange
      const type = 'test-request';
      const handler = jest.fn();
      const disposable = messageBus.onRequest(type, handler);

      // Act
      disposable.dispose();
      runtimeMessageBus.publish('webview:request', {
        ...address,
        type,
        requestId: 'test',
        payload: {},
      });

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should remove all event listeners and handlers', async () => {
      // Arrange
      const notificationHandler = jest.fn();
      const requestHandler = jest.fn();
      messageBus.onNotification('test', notificationHandler);
      messageBus.onRequest('test', requestHandler);

      // Act
      messageBus.dispose();
      runtimeMessageBus.publish('webview:notification', { ...address, type: 'test', payload: {} });
      runtimeMessageBus.publish('webview:request', {
        ...address,
        requestId: 'test',
        type: 'test',
        payload: {},
      });

      // Assert
      expect(notificationHandler).not.toHaveBeenCalled();
      expect(requestHandler).not.toHaveBeenCalled();
      expect(runtimeMessageBus.hasListeners('webview:notification')).toBe(false);
      expect(runtimeMessageBus.hasListeners('webview:request')).toBe(false);
      expect(runtimeMessageBus.hasListeners('webview:response')).toBe(false);
    });

    it('should not affect other instances of WebviewInstanceMessageBus', () => {
      // Arrange
      const otherAddress: WebviewAddress = {
        ...address,
        webviewInstanceId: 'other-instance' as WebviewInstanceId,
      };
      const otherMessageBus = new WebviewInstanceMessageBus(
        otherAddress,
        runtimeMessageBus,
        createMockLogger(),
      );
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      messageBus.onNotification('test', handler1);
      otherMessageBus.onNotification('test', handler2);

      // Act
      messageBus.dispose();
      runtimeMessageBus.publish('webview:notification', { ...address, type: 'test', payload: {} });
      runtimeMessageBus.publish('webview:notification', {
        ...otherAddress,
        type: 'test',
        payload: {},
      });

      // Assert
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
