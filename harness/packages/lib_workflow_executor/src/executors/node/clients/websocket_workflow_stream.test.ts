import WebSocket from 'isomorphic-ws';
import type { InstanceInfo } from '@gitlab-org/core';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial, asMutable } from '@gitlab-org/test-utils';
import { Action } from '@gitlab-org/duo-workflow-service';
import { WebSocketWorkflowStream } from './websocket_workflow_stream';

type SocketListener = (
  data?: WebSocket.RawData | WebSocket.MessageEvent | Error | WebSocket.ErrorEvent | number,
  reason?: Buffer,
) => void;

describe('WebSocketWorkflowStream', () => {
  let mockSocket: WebSocket;
  let logger: Logger;
  let stream: WebSocketWorkflowStream;
  let mockEventListeners: {
    [key: string]: SocketListener[];
  };

  beforeEach(() => {
    mockEventListeners = {};
    logger = new TestLogger();

    jest.useFakeTimers();

    mockSocket = createFakePartial<WebSocket>({
      on: jest.fn().mockImplementation((event: string, listener: SocketListener) => {
        mockEventListeners[event] = mockEventListeners[event] || [];
        mockEventListeners[event].push(listener);
      }),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    });

    stream = new WebSocketWorkflowStream(mockSocket, logger);
  });

  afterEach(() => jest.useRealTimers());

  describe('constructor', () => {
    it('should set up event handlers on the socket', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('write', () => {
    describe('when socket is open', () => {
      beforeEach(() => {
        asMutable(mockSocket).readyState = WebSocket.OPEN;
      });

      it('should send JSON stringified data to the socket', () => {
        const testData = { type: 'test', data: 'value' };

        const result = stream.write(testData);

        expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(testData));
        expect(result).toBe(true);
      });

      it('should handle data that cannot be JSON stringified', () => {
        const circularData: { self?: unknown } = {};
        circularData.self = circularData;

        expect(() => stream.write(circularData)).toThrow();
      });
    });

    describe('when socket is not open', () => {
      it.each([
        { name: 'CONNECTING', state: WebSocket.CONNECTING },
        { name: 'CLOSING', state: WebSocket.CLOSING },
        { name: 'CLOSED', state: WebSocket.CLOSED },
      ])('should return false when socket is $name', ({ state }) => {
        asMutable(mockSocket).readyState = state;

        const result = stream.write({ test: 'data' });

        expect(mockSocket.send).not.toHaveBeenCalled();
        expect(result).toBe(false);
      });
    });

    describe('when socket.send throws an error', () => {
      it('should propagate the error when socket.send fails', () => {
        asMutable(mockSocket).readyState = WebSocket.OPEN;
        const sendError = new Error('Send failed');
        mockSocket.send = jest.fn().mockImplementation(() => {
          throw sendError;
        });

        expect(() => stream.write({ test: 'data' })).toThrow(sendError);
      });
    });
  });

  describe('end', () => {
    it('should close the socket with status code 1000', () => {
      stream.end();

      expect(mockSocket.close).toHaveBeenCalledWith(1000);
    });
  });

  describe('socket event handling', () => {
    describe('message event', () => {
      let testData: unknown;
      let expectedAction: Action;

      beforeEach(() => {
        testData = {
          requestID: 'test-123',
          grep: { searchDirectory: '/test', pattern: 'test', caseInsensitive: false },
        };
        expectedAction = Action.fromJSON({
          requestID: 'test-123',
          grep: { searchDirectory: '/test', pattern: 'test', caseInsensitive: false },
        });
      });

      describe('when receiving message with data property', () => {
        it('should extract data from message event object', () => {
          const messageEvent = createFakePartial<WebSocket.MessageEvent>({
            data: JSON.stringify(testData),
          });
          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](messageEvent);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });

        it('should extract ArrayBuffer data from message event object', () => {
          const jsonString = JSON.stringify(testData);
          const arrayBufferData = new ArrayBuffer(jsonString.length);
          const view = new Uint8Array(arrayBufferData);
          for (let i = 0; i < jsonString.length; i++) {
            view[i] = jsonString.charCodeAt(i);
          }
          const messageEvent = createFakePartial<WebSocket.MessageEvent>({ data: arrayBufferData });

          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](messageEvent);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });

        it('should extract Buffer array data from message event object', () => {
          const jsonString = JSON.stringify(testData);
          const midPoint = Math.floor(jsonString.length / 2);
          const bufferArrayData = [
            Buffer.from(jsonString.slice(0, midPoint), 'utf8'),
            Buffer.from(jsonString.slice(midPoint), 'utf8'),
          ];
          const messageEvent = createFakePartial<WebSocket.MessageEvent>({ data: bufferArrayData });
          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](messageEvent);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });

        it('should skip processing when message event data is null', () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const messageEvent = createFakePartial<WebSocket.MessageEvent>({ data: null as any });
          const dataEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('data', dataEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](messageEvent);

          expect(dataEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });

        it('should skip processing when message event data is undefined', () => {
          const messageEvent = createFakePartial<WebSocket.MessageEvent>({ data: undefined });
          const dataEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('data', dataEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](messageEvent);

          expect(dataEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });
      });

      describe('when receiving Buffer message', () => {
        it('should convert Buffer to string and parse JSON', () => {
          const bufferMessage = Buffer.from(JSON.stringify(testData), 'utf8');
          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](bufferMessage);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });
      });

      describe('when receiving ArrayBuffer message', () => {
        it('should convert ArrayBuffer to string and parse JSON', () => {
          const jsonString = JSON.stringify(testData);
          const arrayBufferMessage = new ArrayBuffer(jsonString.length);
          const view = new Uint8Array(arrayBufferMessage);
          for (let i = 0; i < jsonString.length; i++) {
            view[i] = jsonString.charCodeAt(i);
          }
          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](arrayBufferMessage);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });
      });

      describe('when receiving Buffer array message', () => {
        it('should concatenate Buffer array to string and parse JSON', () => {
          const jsonString = JSON.stringify(testData);
          const midPoint = Math.floor(jsonString.length / 2);
          const bufferArrayMessage = [
            Buffer.from(jsonString.slice(0, midPoint), 'utf8'),
            Buffer.from(jsonString.slice(midPoint), 'utf8'),
          ];
          const dataEventSpy = jest.fn();

          stream.on('data', dataEventSpy);

          mockEventListeners.message[0](bufferArrayMessage);

          expect(dataEventSpy).toHaveBeenCalledWith(expectedAction);
        });
      });

      describe('when receiving invalid JSON', () => {
        it('should emit error event', () => {
          const invalidJson = 'invalid json';
          const errorEventSpy = jest.fn();

          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](Buffer.from(invalidJson, 'utf8'));

          expect(errorEventSpy).toHaveBeenCalledWith(expect.any(Error));
        });
      });

      describe('when receiving empty or undefined message', () => {
        it.each([
          { description: 'empty string', message: '' },
          { description: 'undefined string', message: 'undefined' },
        ])('should skip processing for $description', ({ message }) => {
          const dataEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('data', dataEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](Buffer.from(message, 'utf8'));

          expect(dataEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });

        it('should skip processing for null', () => {
          const dataEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('data', dataEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](null as unknown as WebSocket.RawData);

          expect(dataEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });
      });

      describe('when receiving unknown message format', () => {
        it('should skip processing when message format is unknown', () => {
          const unknownMessage = createFakePartial<WebSocket.MessageEvent>({
            unknownProperty: 'value',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          const dataEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('data', dataEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.message[0](unknownMessage);

          expect(dataEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });
      });
    });

    describe('open event', () => {
      it('should emit open event', () => {
        const openEventSpy = jest.fn();

        stream.on('open', openEventSpy);

        mockEventListeners.open[0]();

        expect(openEventSpy).toHaveBeenCalled();
      });
    });

    describe('error event', () => {
      describe('when receiving Error object', () => {
        it('should emit error event with the Error object', () => {
          const testError = new Error('Test error');
          const errorEventSpy = jest.fn();

          stream.on('error', errorEventSpy);

          mockEventListeners.error[0](testError);

          expect(errorEventSpy).toHaveBeenCalledWith(testError);
        });
      });

      describe('when receiving non-Error object', () => {
        it('should emit error event with converted Error object', () => {
          const testErrorEvent = createFakePartial<WebSocket.ErrorEvent>({
            type: 'error',
            message: 'Test error',
          });
          const errorEventSpy = jest.fn();

          stream.on('error', errorEventSpy);

          mockEventListeners.error[0](testErrorEvent);

          expect(errorEventSpy).toHaveBeenCalledWith(expect.any(Error));
          expect(errorEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              message: '[object Object]',
            }),
          );
        });
      });
    });

    describe('unexpected-response event', () => {
      it('should emit a WebsocketStreamError carrying the HTTP status code and drain the response', () => {
        const errorEventSpy = jest.fn();
        const resume = jest.fn();

        stream.on('error', errorEventSpy);

        // The 'unexpected-response' listener signature is (request, response);
        // cast the response to satisfy the shared mock listener type.
        mockEventListeners['unexpected-response'][0](undefined, {
          statusCode: 401,
          statusMessage: 'Unauthorized',
          resume,
        } as unknown as Buffer);

        expect(errorEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'WebsocketStreamError',
            code: 401,
            reason: 'Unauthorized',
          }),
        );
        expect(resume).toHaveBeenCalled();
      });

      it('should not throw when there are no error listeners attached', () => {
        expect(() =>
          mockEventListeners['unexpected-response'][0](undefined, {
            statusCode: 403,
          } as unknown as Buffer),
        ).not.toThrow();
      });
    });

    describe('close event', () => {
      it('should clear the keepalive ping interval', () => {
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        mockEventListeners.close[0](1000, Buffer.from(''));

        expect(clearIntervalSpy).toHaveBeenCalled();
      });

      describe('when close code is 1000 (normal closure)', () => {
        it('should emit end event', () => {
          const endEventSpy = jest.fn();
          const errorEventSpy = jest.fn();

          stream.on('end', endEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.close[0](1000, Buffer.from('Normal closure'));

          expect(endEventSpy).toHaveBeenCalled();
          expect(errorEventSpy).not.toHaveBeenCalled();
        });
      });

      describe('when close code is not 1000 (abnormal closure)', () => {
        const endEventSpy = jest.fn();
        const errorEventSpy = jest.fn();

        it('should emit error event with WebsocketStreamError', () => {
          stream.on('end', endEventSpy);
          stream.on('error', errorEventSpy);

          mockEventListeners.close[0](1011, Buffer.from('Internal error'));

          expect(endEventSpy).not.toHaveBeenCalled();
          expect(errorEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'WebsocketStreamError',
              message: 'WebSocket closed abnormally.',
              code: 1011,
              reason: 'Internal error',
            }),
          );
        });

        it('should not throw when there are no error listeners attached', () => {
          // A late abnormal close can fire after the connection promise has
          // already rejected and removed its one-shot listener. Node throws
          // when 'error' is emitted with no listeners, which previously
          // surfaced as an uncaughtException and shut the CLI down mid-retry.
          expect(() => mockEventListeners.close[0](1011, Buffer.from(''))).not.toThrow();
        });

        describe('when close code is 1006 (abnormal closure)', () => {
          describe('When instance version is 18.5.0 or higher', () => {
            beforeEach(() => {
              mockEventListeners = {};

              stream = new WebSocketWorkflowStream(
                mockSocket,
                logger,
                createFakePartial<InstanceInfo>({ instanceVersion: '18.5.0' }),
              );

              stream.on('end', endEventSpy);
              stream.on('error', errorEventSpy);

              mockEventListeners.close[0](1006, Buffer.from('Abnormal closure'));
            });

            it('should emit "error"', () => {
              expect(endEventSpy).not.toHaveBeenCalled();
              expect(errorEventSpy).toHaveBeenCalled();
            });
          });

          describe('when instance version is below 18.5.0', () => {
            beforeEach(() => {
              mockEventListeners = {};

              stream = new WebSocketWorkflowStream(
                mockSocket,
                logger,
                createFakePartial<InstanceInfo>({ instanceVersion: '18.4.0' }),
              );

              stream.on('end', endEventSpy);
              stream.on('error', errorEventSpy);

              mockEventListeners.close[0](1006, Buffer.from('Abnormal closure'));
            });

            it('should emit "end"', () => {
              expect(endEventSpy).toHaveBeenCalled();
              expect(errorEventSpy).not.toHaveBeenCalled();
            });
          });
        });
      });
    });
  });

  describe('keepalive ping functionality', () => {
    let pingMock: jest.MockedFunction<WebSocket['ping']>;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000);

      pingMock = jest.fn();
      mockSocket.ping = pingMock;

      stream = new WebSocketWorkflowStream(mockSocket, logger);
    });

    describe('when keepalive ping interval triggers', () => {
      describe('when socket is in OPEN state', () => {
        beforeEach(() => {
          asMutable(mockSocket).readyState = WebSocket.OPEN;
        });

        it('should send ping with current timestamp', () => {
          jest.advanceTimersByTime(45000);

          expect(pingMock).toHaveBeenCalledWith(
            Buffer.from('1234567890000'),
            undefined,
            expect.any(Function),
          );
        });

        describe('when ping callback receives no error', () => {
          it('should not throw or emit error events', () => {
            const errorSpy = jest.fn();
            stream.on('error', errorSpy);

            jest.advanceTimersByTime(45000);

            const pingCallback = pingMock.mock.calls[0][2];
            if (pingCallback) {
              pingCallback(undefined as unknown as Error);
            }

            expect(errorSpy).not.toHaveBeenCalled();
          });
        });

        describe('when ping callback receives an error', () => {
          it('should not emit error events to stream listeners', () => {
            const errorSpy = jest.fn();
            stream.on('error', errorSpy);

            jest.advanceTimersByTime(45000);

            const pingCallback = pingMock.mock.calls[0][2];
            const pingError = new Error('Ping failed');
            if (pingCallback) {
              pingCallback(pingError);
            }

            expect(errorSpy).not.toHaveBeenCalled();
          });
        });
      });

      describe.each([
        { name: 'CONNECTING', state: WebSocket.CONNECTING },
        { name: 'CLOSING', state: WebSocket.CLOSING },
        { name: 'CLOSED', state: WebSocket.CLOSED },
      ])('when socket is in $name state', ({ state }) => {
        beforeEach(() => {
          asMutable(mockSocket).readyState = state;
        });

        it('should not call socket.ping()', () => {
          jest.advanceTimersByTime(45000);
          expect(pingMock).not.toHaveBeenCalled();
        });
      });
    });
  });
});
