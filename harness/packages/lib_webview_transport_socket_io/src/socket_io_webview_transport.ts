import { randomUUID } from 'crypto';
import { Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WebviewId, WebviewInstanceId } from '@gitlab-org/webview-plugin';
import {
  Transport,
  MessagesToServer,
  MessagesToClient,
  TransportMessageHandler,
} from '@gitlab-org/webview-transport';
import { Server, Socket } from 'socket.io';
import {
  WebviewTransportEventEmitterMessages,
  createWebviewTransportEventEmitter,
  buildConnectionId,
  WebviewSocketConnectionId,
  isSocketNotificationMessage,
  isSocketRequestMessage,
  isSocketResponseMessage,
} from './utils';
import { WebviewInstanceInfo } from './types';

const LOGGER_PREFIX = '[SocketIOWebViewTransport]';
const NAMESPACE_REGEX_PATTERN = /^\/webview\/(.+)$/;
const SOCKET_NOTIFICATION_CHANNEL = 'notification';
const SOCKET_REQUEST_CHANNEL = 'request';
const SOCKET_RESPONSE_CHANNEL = 'response';

export class SocketIOWebViewTransport implements Transport {
  #server: Server;

  #logger?: Logger;

  #messageEmitter = createWebviewTransportEventEmitter();

  #connections: Map<WebviewSocketConnectionId, Socket> = new Map();

  constructor(server: Server, logger?: Logger) {
    this.#server = server;
    this.#logger = logger ? withPrefix(logger, LOGGER_PREFIX) : undefined;

    this.#initialize();
  }

  #initialize(): void {
    this.#logger?.debug('Initializing webview transport');

    const namespace = this.#server.of(NAMESPACE_REGEX_PATTERN);

    namespace.on('connection', (socket) => {
      const match = socket.nsp.name.match(NAMESPACE_REGEX_PATTERN);
      if (!match) {
        this.#logger?.error('Failed to parse namespace for socket connection');
        return;
      }
      const webviewId = match[1] as WebviewId;
      const webviewInstanceId = randomUUID() as WebviewInstanceId;
      const webviewInstanceInfo: WebviewInstanceInfo = {
        webviewId,
        webviewInstanceId,
      };

      const connectionId = buildConnectionId(webviewInstanceInfo);
      this.#connections.set(connectionId, socket);
      this.#messageEmitter.emit('webview_instance_created', webviewInstanceInfo);

      socket.on(SOCKET_NOTIFICATION_CHANNEL, (message: unknown) => {
        if (!isSocketNotificationMessage(message)) {
          this.#logger?.debug(`[${connectionId}] received notification with invalid format`);
          return;
        }

        this.#logger?.debug(`[${connectionId}] received notification`);

        this.#messageEmitter.emit('webview_instance_notification_received', {
          ...webviewInstanceInfo,
          type: message.type,
          payload: message.payload,
        });
      });

      socket.on(SOCKET_REQUEST_CHANNEL, (message: unknown) => {
        if (!isSocketRequestMessage(message)) {
          this.#logger?.debug(`[${connectionId}] received request with invalid format`);
          return;
        }

        this.#logger?.debug(`[${connectionId}] received request`);
        this.#messageEmitter.emit('webview_instance_request_received', {
          ...webviewInstanceInfo,
          type: message.type,
          payload: message.payload,
          requestId: message.requestId,
        });
      });

      socket.on(SOCKET_RESPONSE_CHANNEL, (message: unknown) => {
        if (!isSocketResponseMessage(message)) {
          this.#logger?.debug(`[${connectionId}] received response with invalid format`);
          return;
        }

        this.#logger?.debug(`[${connectionId}] received response`);
        this.#messageEmitter.emit('webview_instance_response_received', {
          ...webviewInstanceInfo,
          type: message.type,
          payload: message.payload,
          requestId: message.requestId,
          success: message.success,
          reason: message.reason ?? '',
        });
      });

      socket.on('error', (error) => {
        this.#logger?.debug(`[${connectionId}] error`, error);
      });

      socket.on('disconnect', (reason) => {
        this.#logger?.debug(`[${connectionId}] disconnected with reason: ${reason}`);
        this.#connections.delete(connectionId);
        this.#messageEmitter.emit('webview_instance_destroyed', webviewInstanceInfo);
      });
    });

    this.#logger?.debug('transport initialized');
  }

  async publish<K extends keyof MessagesToClient>(
    type: K,
    message: MessagesToClient[K],
  ): Promise<void> {
    const connectionId = buildConnectionId({
      webviewId: message.webviewId,
      webviewInstanceId: message.webviewInstanceId,
    });

    const connection = this.#connections.get(connectionId);
    if (!connection) {
      this.#logger?.error(`No active socket found for ID ${connectionId}`);
      return;
    }

    switch (type) {
      case 'webview_instance_notification':
        connection.emit(SOCKET_NOTIFICATION_CHANNEL, {
          type: message.type,
          payload: message.payload,
        });
        return;
      case 'webview_instance_request':
        connection.emit(SOCKET_REQUEST_CHANNEL, {
          type: message.type,
          payload: message.payload,
          requestId: (message as MessagesToClient['webview_instance_request']).requestId,
        });
        return;
      case 'webview_instance_response':
        connection.emit(SOCKET_RESPONSE_CHANNEL, {
          type: message.type,
          payload: message.payload,
          requestId: (message as MessagesToClient['webview_instance_response']).requestId,
        });
        return;
      default:
        this.#logger?.error(`Unknown message type ${type}`);
    }
  }

  on<K extends keyof MessagesToServer>(
    type: K,
    callback: TransportMessageHandler<MessagesToServer[K]>,
  ): Disposable {
    this.#messageEmitter.on(type, callback as WebviewTransportEventEmitterMessages[K]);

    return {
      dispose: () =>
        this.#messageEmitter.off(type, callback as WebviewTransportEventEmitterMessages[K]),
    };
  }

  dispose() {
    this.#messageEmitter.removeAllListeners();

    for (const connection of this.#connections.values()) {
      connection.disconnect();
    }

    this.#connections.clear();
  }
}
