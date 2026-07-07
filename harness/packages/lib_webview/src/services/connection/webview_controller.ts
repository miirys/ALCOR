import { CompositeDisposable, Disposable, isDisposable } from '@gitlab-org/disposable';
import {
  MessageMap,
  WebviewConnection,
  WebviewId,
  WebviewMessageBusManagerHandler,
  WebviewInstanceId,
  WebviewAddress,
} from '@gitlab-org/webview-plugin';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WebviewRuntimeMessageBus } from '../messaging';
import { buildWebviewIdFilter } from './utils';
import { WebviewInstanceMessageBus } from './webview_instance_message_bus';

type WebviewInstanceInfo = {
  messageBus: WebviewInstanceMessageBus<MessageMap>;
  pluginCallbackDisposables: CompositeDisposable;
};

export interface WebviewMessageBusFactory {
  (webviewAddress: WebviewAddress): WebviewInstanceMessageBus<MessageMap>;
}

export class WebviewController<T extends MessageMap>
  implements
    WebviewConnection<{
      fromWebview: T['inbound'];
      toWebview: T['outbound'];
    }>,
    Disposable
{
  readonly webviewId: WebviewId;

  #messageBusFactory: WebviewMessageBusFactory;

  #handlers = new Set<WebviewMessageBusManagerHandler<T>>();

  #instanceInfos = new Map<WebviewInstanceId, WebviewInstanceInfo>();

  #compositeDisposable = new CompositeDisposable();

  #logger: Logger;

  constructor(
    webviewId: WebviewId,
    runtimeMessageBus: WebviewRuntimeMessageBus,
    messageBusFactory: WebviewMessageBusFactory,
    logger: Logger,
  ) {
    this.#logger = withPrefix(logger, `[WebviewController:${webviewId}]`);
    this.webviewId = webviewId;
    this.#messageBusFactory = messageBusFactory;
    this.#subscribeToEvents(runtimeMessageBus);
  }

  broadcast<TMethod extends keyof T['outbound']['notifications'] & string>(
    type: TMethod,
    payload: T['outbound']['notifications'][TMethod],
  ) {
    for (const info of this.#instanceInfos.values()) {
      info.messageBus.sendNotification(type.toString(), payload);
    }
  }

  onInstanceConnected(handler: WebviewMessageBusManagerHandler<T>) {
    this.#handlers.add(handler);

    for (const [instanceId, info] of this.#instanceInfos) {
      const disposable = handler(instanceId, info.messageBus);
      if (isDisposable(disposable)) {
        info.pluginCallbackDisposables.add(disposable);
      }
    }
  }

  dispose(): void {
    this.#compositeDisposable.dispose();
    this.#instanceInfos.forEach((info) => info.messageBus.dispose());
    this.#instanceInfos.clear();
  }

  #subscribeToEvents(runtimeMessageBus: WebviewRuntimeMessageBus) {
    const eventFilter = buildWebviewIdFilter(this.webviewId);

    this.#compositeDisposable.add(
      runtimeMessageBus.subscribe('system:notification', ({ type, payload }) => {
        this.broadcast(type, payload as never);
      }),
      runtimeMessageBus.subscribe('webview:connect', this.#handleConnected.bind(this), eventFilter),
      runtimeMessageBus.subscribe(
        'webview:disconnect',
        this.#handleDisconnected.bind(this),
        eventFilter,
      ),
    );
  }

  #handleConnected(address: WebviewAddress) {
    this.#logger.debug(`Instance connected: ${address.webviewInstanceId}`);

    if (this.#instanceInfos.has(address.webviewInstanceId)) {
      // we are already connected with this webview instance
      return;
    }

    const messageBus = this.#messageBusFactory(address);

    const pluginCallbackDisposables = new CompositeDisposable();
    this.#instanceInfos.set(address.webviewInstanceId, {
      messageBus,
      pluginCallbackDisposables,
    });

    this.#handlers.forEach((handler) => {
      const disposable = handler(address.webviewInstanceId, messageBus);
      if (isDisposable(disposable)) {
        pluginCallbackDisposables.add(disposable);
      }
    });
  }

  #handleDisconnected(address: WebviewAddress) {
    this.#logger.debug(`Instance disconnected: ${address.webviewInstanceId}`);

    const instanceInfo = this.#instanceInfos.get(address.webviewInstanceId);
    if (!instanceInfo) {
      // we aren't tracking this instance
      return;
    }

    instanceInfo.pluginCallbackDisposables.dispose();
    instanceInfo.messageBus.dispose();

    this.#instanceInfos.delete(address.webviewInstanceId);
  }
}
