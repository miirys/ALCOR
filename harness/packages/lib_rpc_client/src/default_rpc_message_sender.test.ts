import { z } from 'zod';
import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { DefaultRpcMessageSender, MessageConnection } from './default_rpc_message_sender';
import { RpcValidationError } from './errors';

const testNotification: RpcMessageDefinition<{ key: string }, void> = {
  type: 'notification',
  methodName: 'test/notification',
  paramsSchema: z.object({ key: z.string() }),
};

const testRequest: RpcMessageDefinition<{ id: number }, { name: string }> = {
  type: 'request',
  methodName: 'test/request',
  paramsSchema: z.object({ id: z.number() }),
  responseSchema: z.object({ name: z.string() }),
};

const messageWithInvalidType: RpcMessageDefinition<unknown, unknown> = {
  type: 'unknown' as never, // Simulate an invalid type
  methodName: 'test/unknown',
  paramsSchema: z.unknown(),
};

describe('DefaultRpcMessageSender', () => {
  let connection: jest.Mocked<MessageConnection>;
  let sender: DefaultRpcMessageSender;

  beforeEach(() => {
    connection = {
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
    } as unknown as jest.Mocked<MessageConnection>;

    sender = new DefaultRpcMessageSender(connection, {
      getMessageDefinitions: () => [testNotification, testRequest, messageWithInvalidType],
    });
  });

  describe('send', () => {
    it('should send a valid notification message', async () => {
      await sender.send(testNotification, { key: 'value' });

      expect(connection.sendNotification).toHaveBeenCalledWith('test/notification', {
        key: 'value',
      });
    });

    it('should throw RpcValidationError for invalid notification params', async () => {
      await expect(sender.send(testNotification, { key: 123 } as never)).rejects.toThrow(
        RpcValidationError,
      );
    });

    it('should send a valid request and return the parsed response', async () => {
      connection.sendRequest.mockResolvedValue({ name: 'Alice' });

      const result = await sender.send(testRequest, { id: 1 });

      expect(result).toEqual({ name: 'Alice' });
      expect(connection.sendRequest).toHaveBeenCalledWith('test/request', { id: 1 });
    });

    it('should throw RpcValidationError for invalid request params', async () => {
      await expect(sender.send(testRequest, { id: 'not-a-number' } as never)).rejects.toThrow(
        RpcValidationError,
      );
    });

    it('should throw RpcValidationError for invalid request response', async () => {
      connection.sendRequest.mockResolvedValue({ name: 123 });

      await expect(sender.send(testRequest, { id: 1 })).rejects.toThrow(RpcValidationError);
    });

    it('should throw an error for unknown message types', async () => {
      await expect(sender.send(messageWithInvalidType, {})).rejects.toThrow('Unknown message type');
    });

    it('should bubble up errors from the connection layer', async () => {
      connection.sendRequest.mockRejectedValue(new Error('Connection failure'));

      await expect(sender.send(testRequest, { id: 1 })).rejects.toThrow('Connection failure');
    });
  });
});
