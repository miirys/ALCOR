import type { ExtensionMessageHandlerRegistry } from './utils/extension_message_handler_registry';

export type RpcMethods = {
  notification: string;
  request: string;
};

export type Handlers = {
  notification: ExtensionMessageHandlerRegistry;
  request: ExtensionMessageHandlerRegistry;
};
