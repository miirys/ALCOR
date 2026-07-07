import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  WebviewAddress,
  WebviewConnection,
  WebviewId,
  WebviewMessages,
} from '@gitlab-org/webview-plugin';
import { Logger } from '@gitlab-org/logging';
import { WebviewRuntimeMessageBus } from '../messaging';
import { WebviewInstanceMessageBus } from './webview_instance_message_bus';
import { WebviewController } from './webview_controller';

export interface WebviewConnectionProvider {
  getConnection<T extends WebviewMessages>(webviewId: WebviewId<T>): WebviewConnection<T>;
}

export const WebviewConnectionProvider = createInterfaceId<WebviewConnectionProvider>(
  'WebviewConnectionProvider',
);

@Injectable(WebviewConnectionProvider, [WebviewRuntimeMessageBus, Logger])
export class DefaultWebviewConnectionProvider implements WebviewConnectionProvider {
  #runtimeMessageBus: WebviewRuntimeMessageBus;

  #logger: Logger;

  constructor(webviewRuntimeMessageBus: WebviewRuntimeMessageBus, logger: Logger) {
    this.#logger = logger;
    this.#runtimeMessageBus = webviewRuntimeMessageBus;
  }

  getConnection<T extends WebviewMessages>(webviewId: WebviewId<T>): WebviewConnection<T> {
    const webviewInstanceMessageBusFactory = (address: WebviewAddress) => {
      return new WebviewInstanceMessageBus(address, this.#runtimeMessageBus, this.#logger);
    };

    return new WebviewController(
      webviewId,
      this.#runtimeMessageBus,
      webviewInstanceMessageBusFactory,
      this.#logger,
    );
  }
}
