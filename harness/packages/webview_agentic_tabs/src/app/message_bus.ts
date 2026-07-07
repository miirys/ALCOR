import { resolveMessageBus } from '@gitlab-org/webview-client';
import { DuoAgenticTabMessages, WEBVIEW_ID } from '../contract';

export const messageBus = resolveMessageBus<{
  inbound: DuoAgenticTabMessages['pluginToWebview'];
  outbound: DuoAgenticTabMessages['webviewToPlugin'];
}>({
  webviewId: WEBVIEW_ID,
});
