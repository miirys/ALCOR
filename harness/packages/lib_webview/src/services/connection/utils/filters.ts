import { WebviewAddress, WebviewId } from '@gitlab-org/webview-plugin';

export const buildWebviewIdFilter =
  (webviewId: WebviewId) =>
  <T extends { webviewId: WebviewId }>(event: T): boolean => {
    return event.webviewId === webviewId;
  };

export const buildWebviewAddressFilter =
  (address: WebviewAddress) =>
  <T extends WebviewAddress>(event: T): boolean => {
    return (
      event.webviewId === address.webviewId && event.webviewInstanceId === address.webviewInstanceId
    );
  };
