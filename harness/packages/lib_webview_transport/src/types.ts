import { WebviewId, WebviewInstanceId } from '@gitlab-org/webview-plugin';
import { Disposable } from '@gitlab-org/disposable';

export type WebviewAddress = {
  webviewId: WebviewId;
  webviewInstanceId: WebviewInstanceId;
};

export type WebviewRequestInfo = {
  requestId: string;
};

export type WebviewEventInfo = {
  type: string;
  payload?: unknown;
};

export type WebviewInstanceCreatedEventData = WebviewAddress;
export type WebviewInstanceDestroyedEventData = WebviewAddress;
export type WebviewInstanceNotificationEventData = WebviewAddress & WebviewEventInfo;
export type WebviewInstanceRequestEventData = WebviewAddress &
  WebviewEventInfo &
  WebviewRequestInfo;

export type SuccessfulResponse = {
  success: true;
};

export type FailedResponse = {
  success: false;
  reason: string;
};

export type WebviewInstanceResponseEventData = WebviewAddress &
  WebviewRequestInfo &
  WebviewEventInfo &
  (SuccessfulResponse | FailedResponse);

export type MessagesToServer = {
  webview_instance_created: WebviewInstanceCreatedEventData;
  webview_instance_destroyed: WebviewInstanceDestroyedEventData;
  webview_instance_notification_received: WebviewInstanceNotificationEventData;
  webview_instance_request_received: WebviewInstanceRequestEventData;
  webview_instance_response_received: WebviewInstanceResponseEventData;
};

export type MessagesToClient = {
  webview_instance_notification: WebviewInstanceNotificationEventData;
  webview_instance_request: WebviewInstanceRequestEventData;
  webview_instance_response: WebviewInstanceResponseEventData;
};

export interface TransportMessageHandler<T> {
  (payload: T): void;
}

export interface TransportListener {
  on<K extends keyof MessagesToServer>(
    type: K,
    callback: TransportMessageHandler<MessagesToServer[K]>,
  ): Disposable;
}

export interface TransportPublisher {
  publish<K extends keyof MessagesToClient>(type: K, payload: MessagesToClient[K]): Promise<void>;
}

export interface Transport extends TransportListener, TransportPublisher {}
