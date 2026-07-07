import { Socket } from 'socket.io-client';
import { MessageMap } from '@gitlab-org/message-bus';
import { generateRequestId } from '../../generate_request_id';
import { CONNECTION_LOST_NOTIFICATION_METHOD } from '../../constants';
import {
  SocketIoMessageBus,
  SOCKET_NOTIFICATION_CHANNEL,
  SOCKET_REQUEST_CHANNEL,
  SOCKET_RESPONSE_CHANNEL,
  SOCKET_CONNECT_EVENT,
  SOCKET_DISCONNECT_EVENT,
  SocketEvents,
  REQUEST_TIMEOUT_MS,
} from './socket_io_message_bus';

jest.mock('../../generate_request_id');

interface TestMessageMap extends MessageMap {
  inbound: {
    notifications: {
      testNotification: string;
    };
    requests: {
      testRequest: {
        params: number;
        result: string;
      };
    };
  };
  outbound: {
    notifications: {
      testOutboundNotification: boolean;
    };
    requests: {
      testOutboundRequest: {
        params: string;
        result: number;
      };
    };
  };
}

const TEST_REQUEST_ID = 'mock-request-id';

describe('SocketIoMessageBus', () => {
  let mockSocket: jest.Mocked<Socket>;
  let messageBus: SocketIoMessageBus<TestMessageMap>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(generateRequestId).mockReturnValue(TEST_REQUEST_ID);

    mockSocket = {
      emit: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
    } as unknown as jest.Mocked<Socket>;

    messageBus = new SocketIoMessageBus<TestMessageMap>(mockSocket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendNotification', () => {
    it('should emit a notification event', async () => {
      const messageType = 'testOutboundNotification';
      const payload = true;

      await messageBus.sendNotification(messageType, payload);

      expect(mockSocket.emit).toHaveBeenCalledWith('notification', {
        type: messageType,
        payload,
      });
    });
  });

  describe('sendRequest', () => {
    it('should emit a request event and resolve with the response', async () => {
      const messageType = 'testOutboundRequest';
      const payload = 'test';
      const response = 42;

      const promise = messageBus.sendRequest(messageType, payload);

      const handleResponse = getSocketEventHandler(mockSocket, SOCKET_RESPONSE_CHANNEL);
      handleResponse({ requestId: TEST_REQUEST_ID, payload: response });

      await expect(promise).resolves.toBe(response);
      expect(mockSocket.emit).toHaveBeenCalledWith('request', {
        requestId: TEST_REQUEST_ID,
        type: messageType,
        payload,
      });
    });

    it('should reject if the request times out', async () => {
      const messageType = 'testOutboundRequest';
      const payload = 'test';

      const promise = messageBus.sendRequest(messageType, payload);

      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);

      await expect(promise).rejects.toThrow('Request timed out');
    });
  });

  describe('onNotification', () => {
    it('should register a notification handler', () => {
      const messageType = 'testNotification';
      const handler = jest.fn();

      messageBus.onNotification(messageType, handler);

      const handleNotification = getSocketEventHandler(mockSocket, SOCKET_NOTIFICATION_CHANNEL);
      handleNotification({ type: messageType, payload: 'test' });

      expect(handler).toHaveBeenCalledWith('test');
    });
  });

  describe('onRequest', () => {
    it('should register a request handler', async () => {
      const messageType = 'testRequest';
      const handler = jest.fn().mockResolvedValue('response');

      messageBus.onRequest(messageType, handler);

      const handleRequest = getSocketEventHandler(mockSocket, SOCKET_REQUEST_CHANNEL);
      await handleRequest({
        requestId: 'test-id',
        event: messageType,
        payload: 42,
      });

      expect(handler).toHaveBeenCalledWith(42);
      expect(mockSocket.emit).toHaveBeenCalledWith('response', {
        requestId: 'test-id',
        payload: 'response',
      });
    });
  });

  describe('dispose', () => {
    it('should remove all event listeners including disconnect', () => {
      messageBus.dispose();

      expect(mockSocket.off).toHaveBeenCalledTimes(4);
      expect(mockSocket.off).toHaveBeenCalledWith('notification', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('request', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('response', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith(SOCKET_DISCONNECT_EVENT, expect.any(Function));
    });
  });

  describe('when the socket disconnects', () => {
    describe('when the socket has connected at least once before', () => {
      beforeEach(() => {
        const [[, connectHandler]] = (mockSocket.once as jest.Mock).mock.calls.filter(
          ([event]: [string]) => event === SOCKET_CONNECT_EVENT,
        );
        connectHandler();
      });

      it('emits a connectionLost notification', async () => {
        const connectionLostHandler = jest.fn();
        messageBus.onNotification(
          CONNECTION_LOST_NOTIFICATION_METHOD as never,
          connectionLostHandler,
        );

        const handleDisconnect = getSocketEventHandler(mockSocket, SOCKET_DISCONNECT_EVENT);
        await handleDisconnect();

        expect(connectionLostHandler).toHaveBeenCalled();
      });
    });

    describe('when the socket has never connected before', () => {
      it('does not emit a connectionLost notification', async () => {
        const connectionLostHandler = jest.fn();
        messageBus.onNotification(
          CONNECTION_LOST_NOTIFICATION_METHOD as never,
          connectionLostHandler,
        );

        const handleDisconnect = getSocketEventHandler(mockSocket, SOCKET_DISCONNECT_EVENT);
        await handleDisconnect();

        expect(connectionLostHandler).not.toHaveBeenCalled();
      });
    });
  });
});

function getSocketEventHandler(
  socket: jest.Mocked<Socket>,
  eventName: SocketEvents | typeof SOCKET_DISCONNECT_EVENT,
): (...args: unknown[]) => unknown {
  const [, handler] = socket.on.mock.calls.find((call) => call[0] === eventName)!;
  return handler;
}
