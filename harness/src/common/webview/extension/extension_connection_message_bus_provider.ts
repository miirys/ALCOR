import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ExtensionMessageBusProvider } from '@gitlab-org/webview';
import { MessageBus, MessageMap } from '@gitlab-org/message-bus';
import { Connection } from 'vscode-languageserver';
import { WebviewId } from '@gitlab-org/webview-plugin';
import { ExtensionConnectionMessageBus } from './extension_connection_message_bus';
import { ExtensionMessageHandlerRegistry } from './utils/extension_message_handler_registry';
import { handleNotificationMessage } from './handlers/handle_notification_message';
import { handleRequestMessage } from './handlers/handle_request_message';
import { RpcMethods } from './types';

const DEFAULT_NOTIFICATION_RPC_METHOD = '$/gitlab/plugin/notification';
const DEFAULT_REQUEST_RPC_METHOD = '$/gitlab/plugin/request';

type ExtensionConnectionMessageBusProviderProps = {
  connection: Connection;
  logger: Logger;
  notificationRpcMethod?: string;
  requestRpcMethod?: string;
};

export class ExtensionConnectionMessageBusProvider
  implements ExtensionMessageBusProvider, Disposable
{
  #connection: Connection;

  #rpcMethods: RpcMethods;

  #logger: Logger;

  #notificationHandlers = new ExtensionMessageHandlerRegistry();

  #requestHandlers = new ExtensionMessageHandlerRegistry();

  #baseLogger: Logger;

  #disposables = new CompositeDisposable();

  constructor({
    connection,
    logger,
    notificationRpcMethod = DEFAULT_NOTIFICATION_RPC_METHOD,
    requestRpcMethod = DEFAULT_REQUEST_RPC_METHOD,
  }: ExtensionConnectionMessageBusProviderProps) {
    this.#connection = connection;
    this.#baseLogger = logger;
    this.#logger = withPrefix(logger, '[ExtensionConnectionMessageBusProvider]');

    this.#rpcMethods = {
      notification: notificationRpcMethod,
      request: requestRpcMethod,
    };

    this.#setupConnectionSubscriptions();
  }

  getMessageBus<T extends MessageMap>(pluginId: WebviewId): MessageBus<T> {
    return new ExtensionConnectionMessageBus({
      pluginId,
      connection: this.#connection,
      rpcMethods: this.#rpcMethods,
      handlers: {
        notification: this.#notificationHandlers,
        request: this.#requestHandlers,
      },
      logger: this.#baseLogger,
    });
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #setupConnectionSubscriptions() {
    this.#disposables.add(
      this.#connection.onNotification(
        this.#rpcMethods.notification,
        handleNotificationMessage(this.#notificationHandlers, this.#logger),
      ),
    );

    this.#disposables.add(
      this.#connection.onRequest(
        this.#rpcMethods.request,
        handleRequestMessage(this.#requestHandlers, this.#logger),
      ),
    );
  }
}
