import { HashedRegistry } from '@gitlab-org/handler-registry';
import { WebviewId } from '@gitlab-org/webview-plugin';

export type ExtensionMessageHandlerKey = {
  pluginId: WebviewId;
  type: string;
};

export class ExtensionMessageHandlerRegistry extends HashedRegistry<ExtensionMessageHandlerKey> {
  constructor() {
    super((key) => `${key.pluginId}:${key.type}`);
  }
}
