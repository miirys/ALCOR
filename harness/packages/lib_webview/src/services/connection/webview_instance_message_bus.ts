import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { MessageBus as WebviewMessageBus, MessageMap, Method } from '@gitlab-org/message-bus';
import { Handler, SimpleRegistry } from '@gitlab-org/handler-registry';
import { WebviewAddress } from '@gitlab-org/webview-plugin';
import { WebviewRuntimeMessageBus, WebviewRuntimeResponseMessage } from '../messaging';
import { buildWebviewAddressFilter, generateRequestId } from './utils';

type RequestId = string;

type NotificationHandler = (payload: unknown) => void;
type RequestHandler = (requestId: RequestId, payload: unknown) => void;
type ResponseHandler = (message: WebviewRuntimeResponseMessage) => void;

export class WebviewInstanceMessageBus<T extends MessageMap = MessageMap>
  implements WebviewMessageBus<T>, Disposable
{
  #address: WebviewAddress;

  #runtimeMessageBus: WebviewRuntimeMessageBus;

  #eventSubscriptions = new CompositeDisposable();

  #notificationEvents = new SimpleRegistry<NotificationHandler>();

  #requestEvents = new SimpleRegistry<RequestHandler>();

  #pendingResponseEvents = new SimpleRegistry<ResponseHandler>();

  #logger: Logger;

  constructor(
    webviewAddress: WebviewAddress,
    runtimeMessageBus: WebviewRuntimeMessageBus,
    logger: Logger,
  ) {
    this.#address = webviewAddress;
    this.#runtimeMessageBus = runtimeMessageBus;
    this.#logger = withPrefix(
      logger,
      `[WebviewInstanceMessageBus:${webviewAddress.webviewId}:${webviewAddress.webviewInstanceId}]`,
    );

    this.#logger.debug('initializing');

    const eventFilter = buildWebviewAddressFilter(webviewAddress);

    this.#eventSubscriptions.add(
      this.#runtimeMessageBus.subscribe(
        'webview:notification',
        async (message) => {
          try {
            await this.#notificationEvents.handle(message.type, message.payload);
          } catch (error) {
            this.#logger.debug(
              `Failed to handle webview instance notification: ${message.type}`,
              error instanceof Error ? error : undefined,
            );
          }
        },
        eventFilter,
      ),
      this.#runtimeMessageBus.subscribe(
        'webview:request',
        async (message) => {
          try {
            await this.#requestEvents.handle(message.type, message.requestId, message.payload);
          } catch (error) {
            this.#logger.error(error as Error);
          }
        },
        eventFilter,
      ),
      this.#runtimeMessageBus.subscribe(
        'webview:response',
        async (message) => {
          try {
            await this.#pendingResponseEvents.handle(message.requestId, message);
          } catch (error) {
            this.#logger.error(error as Error);
          }
        },
        eventFilter,
      ),
    );

    this.#logger.debug('initialized');
  }

  sendNotification(type: Method, payload?: unknown): void {
    this.#logger.debug(`Sending notification: ${type}`);
    this.#runtimeMessageBus.publish('plugin:notification', {
      ...this.#address,
      type,
      payload,
    });
  }

  onNotification(type: Method, handler: Handler): Disposable {
    return this.#notificationEvents.register(type, handler);
  }

  async sendRequest(type: Method, payload?: unknown): Promise<never> {
    const requestId = generateRequestId();
    this.#logger.debug(`Sending request: ${type}, ID: ${requestId}`);

    let timeout: NodeJS.Timeout | undefined;

    return new Promise((resolve, reject) => {
      const pendingRequestHandle = this.#pendingResponseEvents.register(
        requestId,
        (message: WebviewRuntimeResponseMessage) => {
          if (message.success) {
            resolve(message.payload as PromiseLike<never>);
          } else {
            reject(new Error(message.reason));
          }

          clearTimeout(timeout);
          pendingRequestHandle.dispose();
        },
      );

      this.#runtimeMessageBus.publish('plugin:request', {
        ...this.#address,
        requestId,
        type,
        payload,
      });

      timeout = setTimeout(() => {
        pendingRequestHandle.dispose();
        this.#logger.debug(`Request with ID: ${requestId} timed out`);
        reject(new Error('Request timed out'));
      }, 10000);
    });
  }

  onRequest(type: Method, handler: Handler): Disposable {
    return this.#requestEvents.register(type, async (requestId: RequestId, payload: unknown) => {
      try {
        const result = await handler(payload);
        this.#runtimeMessageBus.publish('plugin:response', {
          ...this.#address,
          requestId,
          type,
          success: true,
          payload: result,
        });
      } catch (error) {
        this.#logger.error(`Error handling request of type ${type}:`, error as Error);

        this.#runtimeMessageBus.publish('plugin:response', {
          ...this.#address,
          requestId,
          type,
          success: false,
          reason: (error as Error).message,
        });
      }
    });
  }

  dispose(): void {
    this.#eventSubscriptions.dispose();
    this.#notificationEvents.dispose();
    this.#requestEvents.dispose();
    this.#pendingResponseEvents.dispose();
  }
}
