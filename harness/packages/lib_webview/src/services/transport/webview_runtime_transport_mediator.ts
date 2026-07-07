import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { WebviewInstanceId } from '@gitlab-org/webview-plugin';
import {
  Transport,
  WebviewAddress,
  WebviewInstanceNotificationEventData,
  WebviewInstanceRequestEventData,
  WebviewInstanceResponseEventData,
  MessagesToServer as TransportEventMap,
  isWebviewAddress,
} from '@gitlab-org/webview-transport';
import {
  WebviewRuntimeMessageBus,
  WebviewRuntimeMessages,
  WebviewRuntimeNotificationMessage,
  WebviewRuntimeRequestMessage,
  WebviewRuntimeResponseMessage,
} from '../messaging/webview_runtime_message_bus';

type Handler<TPayload> = (data: TPayload) => void | Promise<void>;
type HandlerMap<TEventMap extends Record<string, unknown>> = Partial<{
  [K in keyof TEventMap]: Handler<TEventMap[K]>;
}>;

type ManagedInstances = Set<WebviewInstanceId>;
type IsManagedEventFilter = (event: unknown) => boolean;

const createIsManagedFunc =
  (managedInstances: ManagedInstances): IsManagedEventFilter =>
  (event: unknown) => {
    if (isWebviewAddress(event)) {
      return managedInstances.has(event.webviewInstanceId);
    }

    return true;
  };

export class WebviewRuntimeTransportMediator implements Disposable {
  readonly #managedInstances = new Set<WebviewInstanceId>();

  readonly #transport: Transport;

  readonly #runtimeMessageBus: WebviewRuntimeMessageBus;

  readonly #disposable = new CompositeDisposable();

  constructor(transport: Transport, runtimeMessageBus: WebviewRuntimeMessageBus) {
    this.#transport = transport;
    this.#runtimeMessageBus = runtimeMessageBus;

    this.#setupTransportEvents();
    this.#setupRuntimeEvents();
  }

  #setupTransportEvents(): void {
    const transportHandlers: HandlerMap<TransportEventMap> = {
      webview_instance_created: this.#onInstanceCreated.bind(this),
      webview_instance_destroyed: this.#onInstanceDestroyed.bind(this),
      webview_instance_notification_received: this.#onInstanceNotificationReceived.bind(this),
      webview_instance_request_received: this.#onInstanceRequestReceived.bind(this),
      webview_instance_response_received: this.#onInstanceResponseReceived.bind(this),
    };

    (
      Object.entries(transportHandlers) as [
        keyof TransportEventMap,
        Handler<TransportEventMap[keyof TransportEventMap]>,
      ][]
    ).forEach(([event, handler]) => {
      this.#disposable.add(this.#transport.on(event, handler));
    });
  }

  #setupRuntimeEvents(): void {
    const isManaged = createIsManagedFunc(this.#managedInstances);

    const runtimeHandlers: HandlerMap<WebviewRuntimeMessages> = {
      'plugin:notification': this.#onPluginNotification.bind(this),
      'plugin:request': this.#onPluginRequest.bind(this),
      'plugin:response': this.#onPluginResponse.bind(this),
    };

    (
      Object.entries(runtimeHandlers) as [
        keyof WebviewRuntimeMessages,
        Handler<WebviewRuntimeMessages[keyof WebviewRuntimeMessages]>,
      ][]
    ).forEach(([event, handler]) => {
      this.#runtimeMessageBus.subscribe(event as keyof WebviewRuntimeMessages, handler, isManaged);
    });
  }

  #onInstanceCreated(address: WebviewAddress) {
    this.#managedInstances.add(address.webviewInstanceId);
    this.#runtimeMessageBus.publish('webview:connect', address);
  }

  #onInstanceDestroyed(address: WebviewAddress) {
    this.#managedInstances.delete(address.webviewInstanceId);
    this.#runtimeMessageBus.publish('webview:disconnect', address);
  }

  #onInstanceNotificationReceived(message: WebviewInstanceNotificationEventData) {
    this.#runtimeMessageBus.publish('webview:notification', message);
  }

  #onInstanceRequestReceived(message: WebviewInstanceRequestEventData) {
    this.#runtimeMessageBus.publish('webview:request', message);
  }

  #onInstanceResponseReceived(message: WebviewInstanceResponseEventData) {
    this.#runtimeMessageBus.publish('webview:response', message);
  }

  async #onPluginNotification(message: WebviewRuntimeNotificationMessage) {
    await this.#transport.publish('webview_instance_notification', message);
  }

  async #onPluginRequest(message: WebviewRuntimeRequestMessage) {
    await this.#transport.publish('webview_instance_request', message);
  }

  async #onPluginResponse(message: WebviewRuntimeResponseMessage) {
    await this.#transport.publish('webview_instance_response', message);
  }

  dispose(): void {
    this.#disposable.dispose();
  }
}
