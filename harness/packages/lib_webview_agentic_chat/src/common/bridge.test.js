import { createBridge } from './bridge.ts';

describe('bridge', () => {
  let bridge;
  let mockMessageBus;

  beforeEach(() => {
    mockMessageBus = {
      sendNotification: jest.fn(),
      onNotification: jest.fn(),
    };

    bridge = createBridge(mockMessageBus);
  });
  describe('sendRequest', () => {
    it('calls messageBus.sendNotification with correct parameters', () => {
      const eventName = 'getWorkflowById';
      const payload = { data: 'testData' };

      bridge.sendNotification(eventName, payload);

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(eventName, payload);
    });
  });

  describe('logToOutputChannel', () => {
    it('calls messageBus.sendNotification with correct parameters', () => {
      const payload = { level: 'error', message: 'Test error message' };
      bridge.logToOutputChannel(payload);

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('logToOutputChannel', payload);
    });
  });

  describe('setResponseListener', () => {
    it('calls messageBus.onNotification with correct parameters', () => {
      const eventName = 'setProjectPath';
      const callback = jest.fn();

      bridge.setResponseListener(eventName, callback);

      expect(mockMessageBus.onNotification).toHaveBeenCalledWith(eventName, callback);
    });
  });
});
