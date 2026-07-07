// packages/webview/src/features/flow/services/flowMessageBus.ts
import { resolveMessageBus } from '@gitlab-org/webview-client';
import type { MessageBus } from '@gitlab-org/message-bus';
import { FLOW_BUILDER_WEBVIEW_ID, type FlowBuilderMessages } from '@gitlab-org/flow-builder/flow';

/**
 * Client-side message bus type
 * For the webview client:
 * - inbound = messages from backend (toWebview)
 * - outbound = messages to backend (fromWebview)
 */
export type FlowMessageBus = MessageBus<{
  inbound: FlowBuilderMessages['toWebview'];
  outbound: FlowBuilderMessages['fromWebview'];
}>;

let messageBusInstance: FlowMessageBus | null = null;

/**
 * Get or create the flow message bus instance
 */
export function getFlowMessageBus(): FlowMessageBus {
  if (!messageBusInstance) {
    messageBusInstance = resolveMessageBus<{
      inbound: FlowBuilderMessages['toWebview'];
      outbound: FlowBuilderMessages['fromWebview'];
    }>({
      webviewId: FLOW_BUILDER_WEBVIEW_ID,
    });
  }

  return messageBusInstance;
}

/**
 * Dispose the message bus instance
 */
export function disposeFlowMessageBus(): void {
  if (messageBusInstance && 'dispose' in messageBusInstance) {
    if (typeof messageBusInstance.dispose === 'function') {
      messageBusInstance.dispose();
    }
  }
  messageBusInstance = null;
}
