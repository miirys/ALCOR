import { Disposable } from '@gitlab-org/disposable';

/**
 * Represents the type of message being sent.
 */
export type Method = string;

/**
 * Represents the state of a message payload and can either be empty (no data) or contain a single data item.
 * Payloads are wrapped in a tuple to maintain consistent structure and type-checking capabilities across message handlers.
 *
 * @example
 * type NoPayload = [];
 * type WithStringPayload = [string];
 */
export type MessagePayload = unknown | undefined;

export type KeysWithOptionalValues<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

/**
 * Maps notification message types to their corresponding payloads.
 * @typedef {Record<Method, MessagePayload>} NotificationMap
 */
export type NotificationMap = Record<Method, MessagePayload>;

/**
 * Interface for publishing notifications.
 * @interface
 * @template {NotificationMap} TNotifications
 */
export interface NotificationPublisher<TNotifications extends NotificationMap> {
  sendNotification<T extends KeysWithOptionalValues<TNotifications>>(type: T): void;
  sendNotification<T extends keyof TNotifications>(type: T, payload: TNotifications[T]): void;
}

/**
 * Interface for listening to notifications.
 * @interface
 * @template {NotificationMap} TNotifications
 */
export interface NotificationListener<TNotifications extends NotificationMap> {
  onNotification<T extends KeysWithOptionalValues<TNotifications>>(
    type: T,
    handler: () => void,
  ): Disposable;
  onNotification<T extends keyof TNotifications & string>(
    type: T,
    handler: (payload: TNotifications[T]) => void,
  ): Disposable;
}

/**
 * Maps request message types to their corresponding request/response payloads.
 * @typedef {Record<Method, {params: MessagePayload; result: MessagePayload;}>} RequestMap
 */
export type RequestMap = Record<
  Method,
  {
    params: MessagePayload;
    result: MessagePayload;
  }
>;

type KeysWithOptionalParams<R extends RequestMap> = {
  [K in keyof R]: R[K]['params'] extends undefined ? never : K;
}[keyof R];

/**
 * Extracts the response payload type from a request type.
 * @template {MessagePayload} T
 * @typedef {T extends [never] ? void : T[0]} ExtractRequestResponse
 */
export type ExtractRequestResult<T extends RequestMap[keyof RequestMap]> =
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  T['result'] extends undefined ? void : T['result'];

/**
 * Interface for publishing requests.
 * @interface
 * @template {RequestMap} TRequests
 */
export interface RequestPublisher<TRequests extends RequestMap> {
  sendRequest<T extends KeysWithOptionalParams<TRequests>>(
    type: T,
  ): Promise<ExtractRequestResult<TRequests[T]>>;
  sendRequest<T extends keyof TRequests>(
    type: T,
    payload: TRequests[T]['params'],
  ): Promise<ExtractRequestResult<TRequests[T]>>;
}

/**
 * Interface for listening to requests.
 * @interface
 * @template {RequestMap} TRequests
 */
export interface RequestListener<TRequests extends RequestMap> {
  onRequest<T extends keyof TRequests>(
    type: T,
    handler: (payload: TRequests[T]['params']) => Promise<ExtractRequestResult<TRequests[T]>>,
  ): Disposable;
  onRequest<T extends KeysWithOptionalParams<TRequests>>(
    type: T,
    handler: () => Promise<ExtractRequestResult<TRequests[T]>>,
  ): Disposable;
}

/**
 * Defines the structure for message definitions, including notifications and requests.
 */
export type MessageDefinitions<
  TNotifications extends NotificationMap = NotificationMap,
  TRequests extends RequestMap = RequestMap,
> = {
  notifications: TNotifications;
  requests: TRequests;
};

export type MessageMap<
  TInboundMessageDefinitions extends MessageDefinitions = MessageDefinitions,
  TOutboundMessageDefinitions extends MessageDefinitions = MessageDefinitions,
> = {
  inbound: TInboundMessageDefinitions;
  outbound: TOutboundMessageDefinitions;
};

export interface MessageBus<T extends MessageMap = MessageMap>
  extends NotificationPublisher<T['outbound']['notifications']>,
    NotificationListener<T['inbound']['notifications']>,
    RequestPublisher<T['outbound']['requests']>,
    RequestListener<T['inbound']['requests']> {}
