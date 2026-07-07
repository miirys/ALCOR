import { MessageMap, WebviewId } from '@gitlab-org/webview-plugin';
import { Connection } from 'vscode-languageserver';
import { Disposable } from '@gitlab-org/disposable';
import { MessageBus, ExtractRequestResult } from '@gitlab-org/message-bus';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RpcMethods, Handlers } from './types';

type ExtensionConnectionMessageBusProps = {
  pluginId: WebviewId;
  connection: Connection;
  rpcMethods: RpcMethods;
  handlers: Handlers;
  logger: Logger;
};

export class ExtensionConnectionMessageBus<TMessageMap extends MessageMap = MessageMap>
  implements MessageBus<TMessageMap>
{
  #pluginId: WebviewId;

  #connection: Connection;

  #rpcMethods: RpcMethods;

  #handlers: Handlers;

  #logger: Logger;

  constructor({
    pluginId,
    connection,
    rpcMethods,
    handlers,
    logger,
  }: ExtensionConnectionMessageBusProps) {
    this.#pluginId = pluginId;
    this.#connection = connection;
    this.#rpcMethods = rpcMethods;
    this.#handlers = handlers;
    this.#logger = withPrefix(logger, `[ExtensionConnectionMessageBus:${pluginId}]`);
  }

  onRequest<T extends keyof TMessageMap['inbound']['requests'] & string>(
    type: T,
    handler: (
      payload: TMessageMap['inbound']['requests'][T]['params'],
    ) => Promise<ExtractRequestResult<TMessageMap['inbound']['requests'][T]>>,
  ): Disposable {
    this.#logger.debug(`Registering request handler for ${type}`);
    return this.#handlers.request.register({ pluginId: this.#pluginId, type }, handler);
  }

  onNotification<T extends keyof TMessageMap['inbound']['notifications'] & string>(
    type: T,
    handler: (payload: TMessageMap['inbound']['notifications'][T]) => void,
  ): Disposable {
    this.#logger.debug(`Registering request handler for ${type}`);
    return this.#handlers.notification.register({ pluginId: this.#pluginId, type }, handler);
  }

  sendRequest<T extends keyof TMessageMap['outbound']['requests'] & string>(
    type: T,
    payload?: TMessageMap['outbound']['requests'][T]['params'],
  ): Promise<ExtractRequestResult<TMessageMap['outbound']['requests'][T]>> {
    return this.#connection.sendRequest(this.#rpcMethods.request, {
      pluginId: this.#pluginId,
      type,
      payload,
    });
  }

  async sendNotification<T extends keyof TMessageMap['outbound']['notifications'] & string>(
    type: T,
    payload?: TMessageMap['outbound']['notifications'][T],
  ): Promise<void> {
    await this.#connection.sendNotification(this.#rpcMethods.notification, {
      pluginId: this.#pluginId,
      type,
      payload,
    });
  }
}
