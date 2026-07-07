import { createInterfaceId } from '@gitlab/needle';
import { MessageBus } from '@gitlab-org/message-bus';
import { MessageMap, WebviewId } from '@gitlab-org/webview-plugin';

export interface ExtensionMessageBusProvider {
  getMessageBus<T extends MessageMap>(webviewId: WebviewId): MessageBus<T>;
}

export const ExtensionMessageBusProvider = createInterfaceId<ExtensionMessageBusProvider>(
  'ExtensionMessageBusProvider',
);
