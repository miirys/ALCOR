import { RpcMessageDefinition, RpcMessageDefinitionProvider } from '@gitlab-org/rpc';
import { z } from 'zod';
import { RpcMessageSender } from './rpc_message_sender';
import { RpcParamsValidationError, RpcResponseValidationError } from './errors';

export interface MessageConnection {
  sendRequest(method: string, params?: unknown): Promise<unknown>;
  sendNotification(method: string, params?: unknown): Promise<void>;
}

export class DefaultRpcMessageSender implements RpcMessageSender {
  readonly #connection: MessageConnection;

  readonly #messageDefinitions: RpcMessageDefinitionProvider;

  constructor(connection: MessageConnection, messageDefinitions: RpcMessageDefinitionProvider) {
    this.#connection = connection;
    this.#messageDefinitions = messageDefinitions;
  }

  send = async <TParams, TResponse>(
    message: RpcMessageDefinition<TParams, TResponse>,
    params?: TParams,
  ): Promise<TResponse> => {
    if (!this.#messageDefinitions.getMessageDefinitions().includes(message)) {
      throw new Error(`Unknown message ${message.methodName}.`);
    }

    if (message.paramsSchema && params !== undefined) {
      this.#validate(
        message.paramsSchema,
        params,
        message.methodName,
        (m, d) => new RpcParamsValidationError(m, d),
      );
    }

    if (message.type === 'notification') {
      await this.#connection.sendNotification(message.methodName, params);
      return undefined as TResponse;
    }

    if (message.type === 'request') {
      const result = await this.#connection.sendRequest(message.methodName, params);
      return this.#validate(
        message.responseSchema,
        result,
        message.methodName,
        (m, d) => new RpcResponseValidationError(m, d),
      );
    }

    throw new Error(`Unknown message type`);
  };

  #validate<T>(
    schema: z.Schema<T>,
    value: unknown,
    methodName: string,
    errorFactory: (methodName: string, details: string) => Error,
  ): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw errorFactory(methodName, result.error.message);
    }
    return result.data;
  }
}
