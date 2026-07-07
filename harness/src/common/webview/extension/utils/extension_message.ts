import { WebviewId } from '@gitlab-org/webview-plugin';

export type ExtensionMessage = {
  pluginId: WebviewId;
  type: string;
  payload: unknown;
};

export const isExtensionMessage = (message: unknown): message is ExtensionMessage => {
  return (
    typeof message === 'object' && message !== null && 'pluginId' in message && 'type' in message
  );
};
