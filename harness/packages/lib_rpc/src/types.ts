import { z } from 'zod';

/**
 * Base interface for all message configurations.
 *
 * Represents the common properties shared by all message types.
 */
interface RpcMessageDefinitionBase {
  /**
   * The method name associated with the message.
   *
   * This is used as an identifier for routing or handling the message.
   */
  methodName: string;

  /**
   * The friendly name of the message.
   */
  name?: string;

  /**
   * A brief description of the message and its purpose.
   */
  description?: string;
}

/**
 * Configuration for a notification message.
 *
 * A notification is a one-way message that does not expect a response.
 *
 * @template TParams - The type of parameters accepted by this message.
 */
export interface RpcNotificationDefinition<TParams = unknown> extends RpcMessageDefinitionBase {
  /**
   * The type of the message, which is always 'notification'.
   */
  type: 'notification';

  /**
   * A schema describing the structure of the parameters for this notification.
   *
   * If `TParams` is `unknown`, this notification does not require parameters.
   */
  paramsSchema: z.ZodType<TParams>;
}

/**
 * Type guard that determines if an unknown item is a notification.
 *
 * @param {unknown} item - The item to test.
 * @returns {item is RpcNotificationDefinition} - True if the item is a notification, otherwise false.
 */
export const isNotification = (item: unknown): item is RpcNotificationDefinition => {
  return (
    typeof item === 'object' && item !== null && 'type' in item && item.type === 'notification'
  );
};

/**
 * Configuration for a request-response message.
 *
 * A request-response message expects a response to be sent back.
 *
 * @template TParams - The type of parameters accepted by this message.
 * @template TResponse - The type of response returned by this message.
 */
export interface RpcRequestDefinition<TParams = unknown, TResponse = void>
  extends RpcMessageDefinitionBase {
  /**
   * The type of the message, which is always 'request'.
   */
  type: 'request';

  /**
   * A schema describing the structure of the parameters for this request.
   *
   * If `TParams` is `unknown`, this request does not require parameters.
   */
  paramsSchema: z.ZodType<TParams>;

  /**
   * A schema describing the structure of the response for this request.
   */
  responseSchema: z.ZodType<TResponse>;
}

/**
 * Type guard that determines if an unknown item is a request.
 *
 * @param {unknown} item - The item to test.
 * @returns {item is RpcRequestDefinition} - True if the item is a request, otherwise false.
 */
export const isRequest = (item: unknown): item is RpcRequestDefinition => {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'request';
};

/**
 * Union type representing any type of message.
 *
 * A message can either be a notification or a request.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcMessageDefinition<TParams = any, TResponse = any> =
  | RpcNotificationDefinition<TParams>
  | RpcRequestDefinition<TParams, TResponse>;

export type InferParams<T extends RpcMessageDefinition> =
  T extends RpcMessageDefinition<infer TParams> ? TParams : unknown;

export type InferResponse<T extends RpcMessageDefinition> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-invalid-void-type
  T extends RpcMessageDefinition<any, infer TResponse> ? TResponse : void;
