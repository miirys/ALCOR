import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import type { Disposable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  McpApprovalInput,
  mcpApprovalFooterHint,
  type McpApprovalCallbacks,
  type McpApprovalInputState,
  type McpApprovalServerItem,
} from '@gitlab-org/tui';
import { McpManager, type ServerName } from '@gitlab-org/ai-configuration';
import { PersistentStorage } from '@gitlab-org/persistent-storage';
import type { CommandComponentEntry } from '../../slash_commands/slash_command_handler';
import type { ControllerApi } from './controller_api';

/**
 * Controls the startup MCP server approval prompt in TUI mode.
 *
 * Workspace-owned MCP servers with a new or changed config land in
 * `PendingApproval` and are reported via the McpManager `servers:pending-approval`
 * event. This controller surfaces a blocking prompt so the user can approve or
 * reject each server before the session proceeds.
 */
export interface McpApprovalController extends Disposable {
  /**
   * Subscribe to the McpManager `servers:pending-approval` event. MUST be called
   * before `session.preinitialize()` triggers `reloadAllServers`, otherwise the
   * event may be missed.
   */
  subscribe(api: ControllerApi): void;

  /**
   * Resolves once all pending servers have been decided, or once the manager
   * reports that all servers have settled with none pending. Awaited by
   * TUIController to block startup on the approval decision.
   */
  waitForPendingApprovals(): Promise<void>;

  /**
   * Builds the registry entry consumed by the static CommandComponentRegistry.
   * The registry-only SlashCommandHandler adapter delegates here.
   */
  getComponent(api: ControllerApi): CommandComponentEntry<McpApprovalCallbacks>;
}

export const McpApprovalController =
  createInterfaceId<McpApprovalController>('McpApprovalController');

const SETTLED_TIMEOUT_MS = 30_000;

@Implements(McpApprovalController)
@Service({
  dependencies: [Logger, McpManager, PersistentStorage],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMcpApprovalController implements McpApprovalController {
  #logger: Logger;

  #mcpManager: McpManager;

  #storage: PersistentStorage;

  #handler?: (serverNames: ServerName[]) => void;

  #gate?: Promise<void>;

  #resolveGate?: () => void;

  #receivedPendingEvent = false;

  constructor(logger: Logger, mcpManager: McpManager, storage: PersistentStorage) {
    this.#logger = withPrefix(logger, '[McpApprovalController]');
    this.#mcpManager = mcpManager;
    this.#storage = storage;
  }

  subscribe(api: ControllerApi): void {
    if (this.#handler) {
      this.#logger.warn('subscribe() called more than once; ignoring duplicate call');
      return;
    }

    // Create the gate eagerly so a caller awaiting it always blocks until we
    // explicitly resolve (either on user decision, or when nothing is pending).
    this.#gate = new Promise<void>((resolve) => {
      this.#resolveGate = resolve;
    });

    this.#handler = (serverNames) => this.#onPendingApproval(api, serverNames);
    this.#mcpManager.on('servers:pending-approval', this.#handler);

    // If the initial reload finishes with no pending servers, the
    // 'servers:pending-approval' event never fires, so we must release the gate
    // ourselves. We key off reloadAllServers *completion* rather than
    // waitForAllServersSettled: the latter resolves immediately when no sessions
    // exist yet (the reload triggered by preWarm runs after we subscribe) and also
    // treats PendingApproval as settled, so it can resolve before the pending event
    // is emitted at the end of the reload. whenReloadSettled() resolves only once a
    // reload has actually completed, by which point the synchronous pending-approval
    // emission has already run and set #receivedPendingEvent.
    doNotAwait(
      this.#mcpManager
        .whenReloadSettled(SETTLED_TIMEOUT_MS)
        .catch((error) => {
          this.#logger.warn('whenReloadSettled failed; releasing approval gate', error);
        })
        .finally(() => {
          if (!this.#receivedPendingEvent) {
            this.#release();
          }
        }),
    );
  }

  waitForPendingApprovals(): Promise<void> {
    return this.#gate ?? Promise.resolve();
  }

  dispose(): void {
    this.#unsubscribe();
    // Release any caller blocked on the gate to avoid a hang on unexpected exit.
    this.#release();
  }

  #unsubscribe(): void {
    if (this.#handler) {
      this.#mcpManager.off('servers:pending-approval', this.#handler);
      this.#handler = undefined;
    }
  }

  #onPendingApproval(api: ControllerApi, serverNames: ServerName[]): void {
    if (serverNames.length === 0) return;

    this.#receivedPendingEvent = true;
    this.#logger.info(
      `Prompting for approval of ${serverNames.length} server(s): ${serverNames.join(', ')}`,
    );

    const servers: McpApprovalServerItem[] = serverNames.map((name) => ({
      name: String(name),
      decision: 'approve',
    }));

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.MCP_APPROVAL,
        servers,
        storagePath: this.#storage.getStoragePath(),
      } satisfies McpApprovalInputState,
    }));
  }

  async #handleConfirm(api: ControllerApi, decided: McpApprovalServerItem[]): Promise<void> {
    try {
      await Promise.all(
        decided.map(({ name, decision }) =>
          decision === 'approve'
            ? this.#mcpManager.approveServer(name as ServerName)
            : this.#mcpManager.rejectServer(name as ServerName),
        ),
      );
    } catch (error) {
      this.#logger.warn('Failed to persist one or more MCP approval decisions', error);
    }

    this.#restoreTextInput(api);
    this.#release();
  }

  #handleEscape(api: ControllerApi): void {
    // Leave undecided servers in PendingApproval and write nothing to storage.
    // They remain visible in the /mcp panel and re-prompt on next startup.
    this.#logger.info('MCP server approval skipped; servers left pending');
    this.#restoreTextInput(api);
    this.#release();
  }

  #restoreTextInput(api: ControllerApi): void {
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  #release(): void {
    // This is a startup-only gate. Once the decision is made (or there was
    // nothing pending), stop listening so later /mcp-triggered reloads don't
    // re-open the approval prompt and clobber the active input (e.g. the /mcp
    // panel). New servers added mid-session surface in the /mcp panel instead.
    this.#unsubscribe();
    this.#resolveGate?.();
    this.#resolveGate = undefined;
  }

  getComponent(api: ControllerApi): CommandComponentEntry<McpApprovalCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.MCP_APPROVAL,
      component: McpApprovalInput,
      footerHint: mcpApprovalFooterHint,
      callbacks: {
        onConfirm: (decided) => doNotAwait(this.#handleConfirm(api, decided)),
        onEscape: () => this.#handleEscape(api),
      },
    };
  }
}
