import { CreateMessageDefinitions, MessageBus, MessageDefinitions } from '@gitlab-org/message-bus';
import type { PartialDeep } from 'type-fest';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId } from '@gitlab/needle';
import { WebviewId, WebviewConnection } from './types';

export type DisposeFunc = () => void;

/**
 * Represents a structured message map for a webview plugin.
 */
export type PluginMessageMap = {
  extensionToPlugin: MessageDefinitions;
  pluginToExtension: MessageDefinitions;
  webviewToPlugin: MessageDefinitions;
  pluginToWebview: MessageDefinitions;
};

/**
 * Utility type for creating a plugin message map with default values. This utility type helps plugin authors define the message map for their plugins without needing to specify every detail. It ensures that the required message structures are in place and provides sensible defaults for any unspecified parts.
 *
 * @template T - The partial message map provided by the plugin author. This type should extend `PartialDeep<WebviewPluginMessageMap>`.
 */
export type CreatePluginMessageMap<T extends PartialDeep<PluginMessageMap>> = {
  extensionToPlugin: CreateMessageDefinitions<T['extensionToPlugin']>;
  pluginToExtension: CreateMessageDefinitions<T['pluginToExtension']>;
  webviewToPlugin: CreateMessageDefinitions<T['webviewToPlugin']>;
  pluginToWebview: CreateMessageDefinitions<T['pluginToWebview']>;
};

export type WebviewPluginSetupParams<T extends PluginMessageMap> = {
  webview: WebviewConnection<{
    toWebview: T['pluginToWebview'];
    fromWebview: T['webviewToPlugin'];
  }>;
  extension: MessageBus<{
    inbound: T['extensionToPlugin'];
    outbound: T['pluginToExtension'];
  }>;
};

/**
 * The `WebviewPluginSetupFunc` is responsible for setting up the communication between the webview plugin and the extension, as well as between the webview plugin and individual webview instances.
 *
 * @template TWebviewPluginMessageMap - Message types recognized by the plugin.
 * @param webviewMessageBus - The message bus for communication with individual webview instances.
 * @param extensionMessageBus - The message bus for communication with the webview host (extension).
 * @returns An optional function to dispose of resources when the plugin is unloaded.
 */
type WebviewPluginSetupFunc<T extends PluginMessageMap> = (
  context: WebviewPluginSetupParams<T>,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Disposable | void;

/**
 * The `WebviewPlugin` is a user implemented type defining the integration of the webview plugin with a webview host (extension) and webview instances.
 *
 * @template TWebviewPluginMessageMap - Message types recognized by the plugin.
 */
export type WebviewPlugin<
  TWebviewPluginMessageMap extends PartialDeep<PluginMessageMap> = PluginMessageMap,
> = {
  id: WebviewId;
  title: string;
  setup: WebviewPluginSetupFunc<CreatePluginMessageMap<TWebviewPluginMessageMap>>;
};

export const WebviewPlugin = createInterfaceId<WebviewPlugin>('WebviewPlugin');
