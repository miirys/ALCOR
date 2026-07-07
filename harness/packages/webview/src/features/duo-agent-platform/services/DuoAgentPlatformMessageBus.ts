import {
  DUO_AGENT_PLATFORM_WEBVIEW_ID,
  DuoAgentPlatformMessages,
} from '@gitlab-org/lib-duo-agent-platform/webview';
import { MessageBus } from '@gitlab-org/message-bus';
import { resolveMessageBus } from '@gitlab-org/webview-client';

export type DuoAgentPlatformMessageBus = MessageBus<{
  inbound: DuoAgentPlatformMessages['toWebview'];
  outbound: DuoAgentPlatformMessages['fromWebview'];
}>;

let messageBusInstance: DuoAgentPlatformMessageBus | null = null;

/**
 * Get or create the Duo Agent Platform message bus instance
 */
export function getDuoAgentPlatformMessageBus(): DuoAgentPlatformMessageBus {
  if (!messageBusInstance) {
    messageBusInstance = resolveMessageBus<{
      inbound: DuoAgentPlatformMessages['toWebview'];
      outbound: DuoAgentPlatformMessages['fromWebview'];
    }>({
      webviewId: DUO_AGENT_PLATFORM_WEBVIEW_ID,
    });
  }

  return messageBusInstance;
}

/**
 * Dispose the message bus instance
 */
export function disposeDuoAgentPlatformMessageBus(): void {
  if (messageBusInstance && 'dispose' in messageBusInstance) {
    if (typeof messageBusInstance.dispose === 'function') {
      try {
        messageBusInstance.dispose();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error disposing message bus:', error);
      }
    }
  }
  messageBusInstance = null;
}
