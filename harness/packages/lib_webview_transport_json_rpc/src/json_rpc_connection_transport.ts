import { Connection } from 'vscode-languageserver';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  Transport,
  MessagesToServer,
  TransportMessageHandler,
  MessagesToClient,
  isWebviewInstanceCreatedEventData,
  isWebviewInstanceDestroyedEventData,
  isWebviewInstanceMessageEventData,
} from '@gitlab-org/webview-transport';
import { Disposable } from '@gitlab-org/disposable';
import {
  createWebviewTransportEventEmitter,
  WebviewTransportEventEmitter,
  WebviewTransportEventEmitterMessages,
} from './utils/webview_transport_event_emitter';
import { withJsonRpcMessageValidation } from './utils/with_json_rpc_message_validation';

const LOGGER_PREFIX = '[JsonRpcConnectionTransport]';

const DEFAULT_WEBVIEW_CREATED_RPC_METHOD = '$/gitlab/webview/created';
const DEFAULT_WEBVIEW_DESTROYED_RPC_METHOD = '$/gitlab/webview/destroyed';
const DEFAULT_NOTIFICATION_RPC_METHOD = '$/gitlab/webview/notification';

const handleWebviewCreated = (messageEmitter: WebviewTransportEventEmitter, logger?: Logger) =>
  withJsonRpcMessageValidation(isWebviewInstanceCreatedEventData, logger, (message) => {
    messageEmitter.emit('webview_instance_created', message);
  });

const handleWebviewDestroyed = (messageEmitter: WebviewTransportEventEmitter, logger?: Logger) =>
  withJsonRpcMessageValidation(isWebviewInstanceDestroyedEventData, logger, (message) => {
    messageEmitter.emit('webview_instance_destroyed', message);
  });

const handleWebviewMessage = (messageEmitter: WebviewTransportEventEmitter, logger?: Logger) =>
  withJsonRpcMessageValidation(isWebviewInstanceMessageEventData, logger, (message) => {
    messageEmitter.emit('webview_instance_notification_received', message);
  });

export type JsonRpcConnectionTransportProps = {
  connection: Connection;
  logger: Logger;
  notificationRpcMethod?: string;
  webviewCreatedRpcMethod?: string;
  webviewDestroyedRpcMethod?: string;
};

export class JsonRpcConnectionTransport implements Transport {
  #messageEmitter = createWebviewTransportEventEmitter();

  #connection: Connection;

  #notificationChannel: string;

  #webviewCreatedChannel: string;

  #webviewDestroyedChannel: string;

  #logger?: Logger;

  #disposables: Disposable[] = [];

  constructor({
    connection,
    logger,
    notificationRpcMethod: notificationChannel = DEFAULT_NOTIFICATION_RPC_METHOD,
    webviewCreatedRpcMethod: webviewCreatedChannel = DEFAULT_WEBVIEW_CREATED_RPC_METHOD,
    webviewDestroyedRpcMethod: webviewDestroyedChannel = DEFAULT_WEBVIEW_DESTROYED_RPC_METHOD,
  }: JsonRpcConnectionTransportProps) {
    this.#connection = connection;
    this.#logger = logger ? withPrefix(logger, LOGGER_PREFIX) : undefined;
    this.#notificationChannel = notificationChannel;
    this.#webviewCreatedChannel = webviewCreatedChannel;
    this.#webviewDestroyedChannel = webviewDestroyedChannel;

    this.#subscribeToConnection();
  }

  #subscribeToConnection() {
    const channelToNotificationHandlerMap = {
      [this.#webviewCreatedChannel]: handleWebviewCreated(this.#messageEmitter, this.#logger),
      [this.#webviewDestroyedChannel]: handleWebviewDestroyed(this.#messageEmitter, this.#logger),
      [this.#notificationChannel]: handleWebviewMessage(this.#messageEmitter, this.#logger),
    };

    Object.entries(channelToNotificationHandlerMap).forEach(([channel, handler]) => {
      const disposable = this.#connection.onNotification(channel, handler);
      this.#disposables.push(disposable);
    });
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

  publish<K extends keyof MessagesToClient>(type: K, payload: MessagesToClient[K]): Promise<void> {
    if (type === 'webview_instance_notification') {
      return this.#connection.sendNotification(this.#notificationChannel, payload);
    }

    throw new Error(`Unknown message type: ${type}`);
  }

  dispose(): void {
    this.#messageEmitter.removeAllListeners();
    this.#disposables.forEach((disposable) => disposable.dispose());
    this.#logger?.debug('JsonRpcConnectionTransport disposed');
  }
}
