import { WebviewPlugin } from '@gitlab-org/webview-plugin';
import { Connection } from 'vscode-languageserver';
import { VulnerabilityDetailsMessages, WEBVIEW_ID, WEBVIEW_TITLE } from '../contract';

export const remoteSecurityWebviewPlugin = (
  connection: Connection,
): WebviewPlugin<VulnerabilityDetailsMessages> => ({
  id: WEBVIEW_ID,
  title: WEBVIEW_TITLE,
  setup: ({ webview, extension }) => {
    extension.onNotification('updateDetails', (message) => {
      webview.onInstanceConnected((_webviewInstanceId, messageBus) => {
        messageBus.sendNotification('updateDetails', {
          vulnerability: message.vulnerability,
          filePath: message.filePath,
          timestamp: message.timestamp,
        });
      });
    });

    webview.onInstanceConnected((_webviewInstanceId, messageBus) => {
      messageBus.onNotification('openLink', async (message) => {
        await connection.sendNotification('$/gitlab/openUrl', { url: message.href });
      });
    });
  },
});
