import {
  WebviewAddress,
  WebviewInstanceCreatedEventData,
  WebviewInstanceDestroyedEventData,
  WebviewInstanceNotificationEventData,
} from '../types';

export type MessageValidator<T> = (message: unknown) => message is T;

export const isWebviewAddress: MessageValidator<WebviewAddress> = (
  message: unknown,
): message is WebviewAddress =>
  typeof message === 'object' &&
  message !== null &&
  'webviewId' in message &&
  'webviewInstanceId' in message;

export const isWebviewInstanceCreatedEventData: MessageValidator<
  WebviewInstanceCreatedEventData
> = (message: unknown): message is WebviewInstanceCreatedEventData => isWebviewAddress(message);

export const isWebviewInstanceDestroyedEventData: MessageValidator<
  WebviewInstanceDestroyedEventData
> = (message: unknown): message is WebviewInstanceDestroyedEventData => isWebviewAddress(message);

export const isWebviewInstanceMessageEventData: MessageValidator<
  WebviewInstanceNotificationEventData
> = (message: unknown): message is WebviewInstanceNotificationEventData =>
  isWebviewAddress(message) && 'type' in message;
