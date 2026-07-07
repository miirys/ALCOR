import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import type { Disposable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { CLI_INPUT_TYPES, ConnectionState as TuiConnectionState } from '@gitlab-org/tui';
import type { McpPanelServerItem } from '@gitlab-org/tui';
import { ConnectionState, McpManager } from '@gitlab-org/ai-configuration';
import type { McpServerState, McpTool } from '@gitlab-org/ai-configuration';
import type { ControllerApi } from './controller_api';

const CONNECTION_STATE_MAP: Record<ConnectionState, TuiConnectionState> = {
  [ConnectionState.Connecting]: TuiConnectionState.Connecting,
  [ConnectionState.Authenticating]: TuiConnectionState.Authenticating,
  [ConnectionState.Connected]: TuiConnectionState.Connected,
  [ConnectionState.Disconnected]: TuiConnectionState.Disconnected,
  [ConnectionState.Failed]: TuiConnectionState.Failed,
  [ConnectionState.PendingApproval]: TuiConnectionState.PendingApproval,
  [ConnectionState.Rejected]: TuiConnectionState.Rejected,
};

const toMcpPanelServerItem = (server: McpServerState): McpPanelServerItem => ({
  name: server.name,
  connectionState: CONNECTION_STATE_MAP[server.connectionState],
  error: server.error,
  authUrl: server.authUrl,
});

export interface McpStatusController extends Disposable {
  subscribe(api: ControllerApi): void;
}

export const McpStatusController = createInterfaceId<McpStatusController>('McpStatusController');

@Implements(McpStatusController)
@Service({
  dependencies: [Logger, McpManager],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMcpStatusController implements McpStatusController {
  #logger: Logger;

  #mcpManager: McpManager;

  #serverStateHandler?: (serverName: string, state: McpServerState) => void;

  #toolsStateHandler?: (serverName: string, tools: McpTool[]) => void;

  constructor(logger: Logger, mcpManager: McpManager) {
    this.#logger = withPrefix(logger, '[McpStatusController]');
    this.#mcpManager = mcpManager;
  }

  subscribe(api: ControllerApi): void {
    this.dispose();
    this.#seedServers(api);
    this.#serverStateHandler = (serverName, state) =>
      this.#handleServerStateChange(api, serverName, state);
    this.#toolsStateHandler = (serverName, tools) =>
      this.#handleToolCountChange(api, serverName, tools.length);
    this.#mcpManager.on('server:state-changed', this.#serverStateHandler);
    this.#mcpManager.on('tools:updated', this.#toolsStateHandler);
  }

  dispose(): void {
    if (this.#serverStateHandler) {
      this.#mcpManager.off('server:state-changed', this.#serverStateHandler);
      this.#serverStateHandler = undefined;
    }
    if (this.#toolsStateHandler) {
      this.#mcpManager.off('tools:updated', this.#toolsStateHandler);
      this.#toolsStateHandler = undefined;
    }
  }

  /**
   * Seeds the initial server list state at subscribe time. After this, all updates
   * arrive via 'server:state-changed' and 'tools:updated' events.
   */
  #seedServers(api: ControllerApi): void {
    this.#mcpManager
      .getServers()
      .then((servers) => {
        const mcpServers: McpPanelServerItem[] = servers.map(toMcpPanelServerItem);
        api.mutateState((state) => ({
          ...state,
          mcpServers,
          input:
            state.input.inputType === CLI_INPUT_TYPES.MCP_PANEL
              ? { ...state.input, servers: mcpServers }
              : state.input,
        }));
        return undefined;
      })
      .catch((error) => {
        this.#logger.warn('Failed to seed MCP servers', error);
      });
  }

  /**
   * Upserts a server and it's connected status to state
   */
  #handleServerStateChange(api: ControllerApi, serverName: string, state: McpServerState): void {
    api.mutateState((current) => {
      const incoming = toMcpPanelServerItem(state);
      const existing = current.mcpServers?.find((s) => s.name === serverName);

      const next: McpPanelServerItem =
        state.connectionState === ConnectionState.Connected && existing?.toolCount !== undefined
          ? { ...incoming, toolCount: existing.toolCount }
          : incoming;

      const currentServers = current.mcpServers ?? [];
      const idx = currentServers.findIndex((s) => s.name === serverName);
      const mcpServers =
        idx === -1
          ? [...currentServers, next]
          : currentServers.map((s, i) => (i === idx ? next : s));

      return {
        ...current,
        mcpServers,
        input:
          current.input.inputType === CLI_INPUT_TYPES.MCP_PANEL
            ? { ...current.input, servers: mcpServers }
            : current.input,
      };
    });
  }

  /**
   * Updates a server's tool count.
   * No-op if the server isn't in current state or is not Connected
   */
  #handleToolCountChange(api: ControllerApi, serverName: string, toolCount: number): void {
    api.mutateState((state) => {
      const idx = state.mcpServers?.findIndex((s) => s.name === serverName) ?? -1;
      if (idx === -1 || !state.mcpServers) return state;

      const current = state.mcpServers[idx];
      if (current.connectionState !== TuiConnectionState.Connected) return state;

      const updated = [...state.mcpServers];
      updated[idx] = { ...current, toolCount };

      return {
        ...state,
        mcpServers: updated,
        input:
          state.input.inputType === CLI_INPUT_TYPES.MCP_PANEL
            ? { ...state.input, servers: updated }
            : state.input,
      };
    });
  }
}
