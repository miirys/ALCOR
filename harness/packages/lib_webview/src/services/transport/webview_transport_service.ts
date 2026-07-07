import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Disposable } from '@gitlab-org/disposable';
import { Transport } from '@gitlab-org/webview-transport';
import { WebviewRuntimeMessageBus } from '../messaging';
import { WebviewRuntimeTransportMediator } from './webview_runtime_transport_mediator';

export interface WebviewTransportService {
  registerTransport(transport: Transport): Disposable;
}
export const WebviewTransportService =
  createInterfaceId<WebviewTransportService>('WebviewTransportService');

@Injectable(WebviewTransportService, [WebviewRuntimeMessageBus, Logger])
export class DefaultWebviewTransportService implements WebviewTransportService, Disposable {
  #webviewRuntimeMessageBus: WebviewRuntimeMessageBus;

  #managedTransports: Map<Transport, Disposable> = new Map();

  #logger: Logger;

  constructor(webviewRuntimeMessageBus: WebviewRuntimeMessageBus, logger: Logger) {
    this.#logger = withPrefix(logger, '[WebviewTransportService]');
    this.#webviewRuntimeMessageBus = webviewRuntimeMessageBus;
  }

  registerTransport(transport: Transport): Disposable {
    const transportName = transport.constructor.name;

    this.#logger.debug(`Registering transport: ${transportName}`);

    try {
      if (this.#managedTransports.has(transport)) {
        throw new Error('Transport has already been registered');
      }

      return this.#setupTransport(transport);
    } catch (error) {
      this.#logger.error(
        `Failed to register transport: ${transportName}`,
        error instanceof Error ? error : undefined,
      );

      return { dispose: () => {} };
    }
  }

  #setupTransport(transport: Transport): Disposable {
    const transportName = transport.constructor.name;

    const mediator = new WebviewRuntimeTransportMediator(transport, this.#webviewRuntimeMessageBus);

    this.#managedTransports.set(transport, mediator);
    this.#logger.debug(`Transport registered successfully: ${transportName}`);

    return {
      dispose: () => {
        this.#logger.debug(`Disposing transport: ${transportName}`);
        const managedMediator = this.#managedTransports.get(transport);
        if (managedMediator) {
          managedMediator.dispose();
          this.#managedTransports.delete(transport);
          this.#logger.debug(`Transport disposed: ${transportName}`);
        }
      },
    };
  }

  dispose(): void {
    this.#logger.debug(`Disposing ${this.#managedTransports.size} managed transports`);
    this.#managedTransports.forEach((mediator, transport) => {
      const transportName = transport.constructor.name;
      this.#logger.debug(`Disposing transport: ${transportName}`);
      mediator.dispose();
    });
    this.#managedTransports.clear();
    this.#logger.debug('All transports disposed');
  }
}
