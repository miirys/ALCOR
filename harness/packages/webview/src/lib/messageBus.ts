import { resolveMessageBus } from '@gitlab-org/webview-client';

import { MCP_DASHBOARD_WEBVIEW_ID } from '@gitlab-org/ai-configuration-webview/contract';

/**
 * Initialize the global message bus for theme updates and other system-wide notifications.
 * This automatically sets up theme change listeners via resolveMessageBus.
 *
 * The theme listener applies CSS custom properties (--editor-*) directly to document.documentElement
 * whenever a theme update notification is received from the extension.
 */
export function initializeGlobalMessageBus() {
  return resolveMessageBus({
    webviewId: MCP_DASHBOARD_WEBVIEW_ID,
  });
}
