import { registerControllerNotifications, registerControllerRequests } from './setup';

describe('setup controllers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMessageBus: any;

  beforeEach(() => {
    mockMessageBus = {
      onNotification: jest.fn(),
      sendNotification: jest.fn(),
      onRequest: jest.fn(),
    };
  });
  // WRite tests for the setup.ts file next to this one in the directory
  describe('registerControllerNotifications', () => {
    it('should register controllers with the message bus', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();

      registerControllerNotifications(mockMessageBus, [mockCallback1, mockCallback2]);

      expect(mockMessageBus.onNotification).toHaveBeenCalledTimes(2);
      expect(mockMessageBus.onNotification).toHaveBeenCalledWith(
        mockCallback1.name,
        expect.any(Function),
      );
      expect(mockMessageBus.onNotification).toHaveBeenCalledWith(
        mockCallback2.name,
        expect.any(Function),
      );
    });

    it('should handle single response from callback', async () => {
      const mockCallback = jest
        .fn()
        .mockResolvedValue({ eventName: 'testEvent', data: 'testData' });

      registerControllerNotifications(mockMessageBus, [mockCallback]);

      const registeredCallback = mockMessageBus.onNotification.mock.calls[0][1];
      await registeredCallback();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('testEvent', 'testData');
    });

    it('should handle multiple responses from callback', async () => {
      const mockCallback = jest.fn().mockResolvedValue([
        { eventName: 'testEvent1', data: 'testData1' },
        { eventName: 'testEvent2', data: 'testData2' },
      ]);

      registerControllerNotifications(mockMessageBus, [mockCallback]);

      const registeredCallback = mockMessageBus.onNotification.mock.calls[0][1];
      await registeredCallback();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('testEvent1', 'testData1');
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('testEvent2', 'testData2');
    });

    it('should not send notification for "noreply" response', async () => {
      const mockCallback = jest.fn().mockResolvedValue('noreply');

      registerControllerNotifications(mockMessageBus, [mockCallback]);

      const registeredCallback = mockMessageBus.onNotification.mock.calls[0][1];
      await registeredCallback();

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalled();
    });

    it('should not send the workflowError message when the callback is successful', async () => {
      const mockCallback = jest
        .fn()
        .mockResolvedValue({ eventName: 'testEvent', data: 'testData' });
      registerControllerNotifications(mockMessageBus, [mockCallback]);

      const registeredCallback = mockMessageBus.onNotification.mock.calls[0][1];
      await registeredCallback();
      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
        'workflowError',
        expect.anything(),
      );
    });

    describe('when there is an error in the callback', () => {
      it('should send a workflowError notification with the error message', async () => {
        const mockCallback = jest.fn().mockRejectedValue(new Error('Test error'));

        registerControllerNotifications(mockMessageBus, [mockCallback]);

        const registeredCallback = mockMessageBus.onNotification.mock.calls[0][1];
        await registeredCallback();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', 'Test error');
      });
    });
  });

  describe('registerControllerRequests', () => {
    it('should register request handlers with the message bus', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();

      registerControllerRequests(mockMessageBus, [mockCallback1, mockCallback2]);

      expect(mockMessageBus.onRequest).toHaveBeenCalledTimes(2);
      expect(mockMessageBus.onRequest).toHaveBeenCalledWith(
        mockCallback1.name,
        expect.any(Function),
      );
      expect(mockMessageBus.onRequest).toHaveBeenCalledWith(
        mockCallback2.name,
        expect.any(Function),
      );
    });

    describe('when handling successful requests', () => {
      let mockCallback: jest.Mock;
      let registeredHandler: (payload: unknown) => Promise<unknown>;

      beforeEach(() => {
        const testResult = { data: 'test response' };
        mockCallback = jest.fn().mockResolvedValue(testResult);
        registerControllerRequests(mockMessageBus, [mockCallback]);
        const [firstCall] = mockMessageBus.onRequest.mock.calls;
        [, registeredHandler] = firstCall;
      });

      it('should return the result from the callback', async () => {
        const result = await registeredHandler('test payload');

        expect(mockCallback).toHaveBeenCalledWith('test payload');
        expect(result).toEqual({ data: 'test response' });
      });
    });

    describe('when there is an error in the callback', () => {
      let registeredHandler: (payload: unknown) => Promise<unknown>;

      describe('with error message', () => {
        beforeEach(() => {
          const mockCallback = jest.fn().mockRejectedValue(new Error('Test error'));
          registerControllerRequests(mockMessageBus, [mockCallback]);
          const [firstCall] = mockMessageBus.onRequest.mock.calls;
          [, registeredHandler] = firstCall;
        });

        it('should throw an error with the original message', async () => {
          await expect(registeredHandler('test payload')).rejects.toThrow('Test error');
        });
      });

      describe('without error message', () => {
        beforeEach(() => {
          const mockCallback = jest.fn().mockRejectedValue(new Error(''));
          registerControllerRequests(mockMessageBus, [mockCallback]);
          const [firstCall] = mockMessageBus.onRequest.mock.calls;
          [, registeredHandler] = firstCall;
        });

        it('should throw a generic error when no error message is available', async () => {
          await expect(registeredHandler('test payload')).rejects.toThrow(
            'An unexpected error occurred while processing your request.',
          );
        });
      });
    });
  });
});
