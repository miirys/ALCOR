import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { NotificationType } from 'vscode-languageserver-protocol';
import { LsConnection } from '@gitlab-org/core';
import {
  McpManager,
  MCP_SERVERS_NEED_APPROVAL_NOTIFICATION,
  ConnectionState,
} from '@gitlab-org/ai-configuration';
import type { ServerName } from '@gitlab-org/ai-configuration';

export interface McpServersNeedApprovalParams {
  count: number;
  serverNames: string[];
}

const McpServersNeedApprovalNotificationType = new NotificationType<McpServersNeedApprovalParams>(
  MCP_SERVERS_NEED_APPROVAL_NOTIFICATION,
);

/**
 * Listens to McpManager's 'servers:pending-approval' event and forwards it
 * as an LSP notification to the client (e.g. the VSCode extension).
 *
 * The client can subscribe to this notification and show a warning message
 * prompting the user to open the MCP Dashboard.
 */
@Service({
  dependencies: [Logger, LsConnection, McpManager],
  lifetime: ServiceLifetime.Singleton,
  autoActivate: true,
})
export class McpPendingApprovalNotifier {
  readonly #logger: Logger;

  readonly #connection: LsConnection;

  readonly #mcpManager: McpManager;

  // Tracks the last set of pending server names we notified about so we can
  // suppress duplicate notifications within the same reload cycle.
  // Stored as a JSON-serialised sorted array to avoid false matches from
  // server names that contain commas.
  // Reset to '' whenever the pending set drains to zero (via server:state-changed)
  // so that a server which is approved and then re-queued for approval triggers
  // a fresh notification.
  #lastNotifiedKey = '';

  constructor(logger: Logger, connection: LsConnection, mcpManager: McpManager) {
    this.#logger = logger;
    this.#connection = connection;
    this.#mcpManager = mcpManager;

    mcpManager.on('servers:pending-approval', this.#handlePendingApproval);
    mcpManager.on('server:state-changed', this.#handleStateChanged);
  }

  dispose(): void {
    this.#mcpManager.off('servers:pending-approval', this.#handlePendingApproval);
    this.#mcpManager.off('server:state-changed', this.#handleStateChanged);
  }

  #pendingSetKey(serverNames: ServerName[]): string {
    return JSON.stringify([...serverNames].sort());
  }

  #handlePendingApproval = (serverNames: ServerName[]): void => {
    const key = this.#pendingSetKey(serverNames);
    if (key === this.#lastNotifiedKey) return;
    this.#lastNotifiedKey = key;

    this.#connection
      .sendNotification(McpServersNeedApprovalNotificationType, {
        count: serverNames.length,
        serverNames: serverNames as string[],
      })
      .catch((err) => {
        this.#logger.debug('Failed to send pending-approval notification', err);
        // Reset so a subsequent re-emit of the same pending set can retry.
        this.#lastNotifiedKey = '';
      });
  };

  // When any server transitions out of PendingApproval (approved, rejected,
  // connected, failed, …) the manager re-evaluates the pending set. If no
  // servers remain pending the manager won't emit 'servers:pending-approval'
  // at all, so we clear our debounce key here to ensure the next non-empty
  // pending event is always forwarded to the IDE.
  #handleStateChanged = (): void => {
    this.#mcpManager
      .getServers()
      .then((servers) => {
        const anyPending = servers.some(
          (s) => s.connectionState === ConnectionState.PendingApproval,
        );
        if (!anyPending) {
          this.#lastNotifiedKey = '';
        }
        return undefined;
      })
      .catch((err) => {
        this.#logger.debug('Failed to evaluate pending approvals on state change', err);
      });
  };
}
