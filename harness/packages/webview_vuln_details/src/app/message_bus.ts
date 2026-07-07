import { resolveMessageBus } from '@gitlab-org/webview-client';
import { VulnerabilityDetailsMessages, WEBVIEW_ID } from '../contract';

export const messageBus = resolveMessageBus<{
  inbound: VulnerabilityDetailsMessages['pluginToWebview'];
  outbound: VulnerabilityDetailsMessages['webviewToPlugin'];
}>({
  webviewId: WEBVIEW_ID,
});
