import { Logger, withPrefix } from '@gitlab-org/logging';
import { ResultAsync, errAsync } from 'neverthrow';
import { ServerConfig } from './config';
import {
  ConnectionState,
  McpError,
  type McpClient,
  type McpConnectionFactory,
  type ConnectionStateSnapshot,
} from './client';
import type { McpTool, ServerName } from './types';
import { ConnectionStateMap, McpConnection } from './client/connection';
import { hashServerConfig } from './utils/hash_server_config';

/* ------------------------------ helpers & types ------------------------------ */

type Merge<A, B> = Omit<A, keyof B> & B;

// ServerAugmentMap adds server-level context on top of raw connection state snapshots.
type ServerAugmentMap = {
  [ConnectionState.Disconnected]: {};
  [ConnectionState.Connecting]: {
    configHash: string;
  };
  [ConnectionState.Authenticating]: {
    configHash: string;
  };
  [ConnectionState.Connected]: {
    configHash: string;
    toolCount: number;
  };
  [ConnectionState.Failed]: {
    configHash?: string;
    error: string; // override McpError → string
  };
  [ConnectionState.PendingApproval]: {};
  [ConnectionState.Rejected]: {};
};

function enhanceConnectionState<K extends keyof ConnectionStateMap>(
  base: ConnectionStateMap[K],
  extras: ServerAugmentMap[K],
): ServerStateFromBase<K> {
  return { ...base, ...extras };
}

type ServerStateFromBase<K extends keyof ConnectionStateMap> = Merge<
  ConnectionStateMap[K],
  ServerAugmentMap[K]
>;

export type ServerStateSnapshot = {
  [K in keyof ConnectionStateMap]: ServerStateFromBase<K>;
}[keyof ConnectionStateMap];

export interface ConfigApplyResult {
  changed: boolean;
  parseError?: string;
}

/* ------------------------------ class ------------------------------ */

/**
 * McpServerSessionManager
 *
 * Manages the lifecycle of a single MCP server session bound to a (possibly changing)
 * configuration. It:
 *  - parses and hashes config for change detection
 *  - creates/tears down an McpConnection via factory
 *  - translates raw connection snapshots into richer server snapshots
 *  - exposes convenience ops (getTools/executeTool)
 *
 * Auth flow orchestration lives inside McpConnection.
 */
export class McpServerSessionManager {
  readonly #serverName: ServerName;

  readonly #displayName: string;

  readonly #workspacePath: string;

  readonly #connectionFactory: McpConnectionFactory;

  readonly #logger: Logger;

  // State
  #state: ServerStateSnapshot = { status: ConnectionState.Disconnected };

  #connection?: McpConnection;

  #currentConfig?: ServerConfig;

  #configHash?: string;

  #toolCount = 0;

  // Generation guard for racing connects/reconnects
  #gen = 0;

  // Event handlers
  #stateHandlers = new Set<(state: ServerStateSnapshot) => void>();

  #connectionUnsubscribe?: () => void;

  constructor(
    serverName: ServerName,
    displayName: string,
    initialConfig: unknown,
    workspacePath: string,
    connectionFactory: McpConnectionFactory,
    logger: Logger,
  ) {
    this.#serverName = serverName;
    this.#displayName = displayName;
    this.#workspacePath = workspacePath;
    this.#connectionFactory = connectionFactory;
    this.#logger = withPrefix(logger, `[MCP][ServerSessionManager][${displayName}]`);

    // Parse initial config
    const parseResult = this.#parseAndHashConfig(initialConfig);
    if (parseResult.success) {
      this.#currentConfig = parseResult.config;
      this.#configHash = parseResult.hash;
    } else {
      this.#logger.error(`Initial config parse failed: ${parseResult.error}`);
      this.#state = {
        status: ConnectionState.Failed,
        error: parseResult.error,
        failedAt: new Date(),
      };
    }
  }

  /* ------------------------------ public api ------------------------------ */

  get serverName(): ServerName {
    return this.#serverName;
  }

  get currentConfig(): ServerConfig | undefined {
    return this.#currentConfig;
  }

  get currentConfigHash(): string | undefined {
    return this.#configHash;
  }

  /**
   * Get current server state snapshot.
   */
  getState(): ServerStateSnapshot {
    return this.#state;
  }

  /**
   * Get the connected client for operations.
   */
  #getConnectedClient(): ResultAsync<McpClient, McpError> {
    if (!this.#connection) {
      return errAsync(McpError.connectionFailed(this.#serverName, 'No connection established'));
    }
    return this.#connection.getConnectedClient();
  }

  /**
   * Get cached tools (updated automatically when connected).
   */
  getTools(): ResultAsync<McpTool[], McpError> {
    return this.#getConnectedClient().andThen((client) => client.getTools());
  }

  /**
   * Execute a tool on the server.
   */
  executeTool(toolName: string, args: Record<string, unknown>): ResultAsync<string, McpError> {
    return this.#getConnectedClient().andThen((client) => client.executeTool(toolName, args));
  }

  /**
   * Mark this session as pending user approval.
   * Any active connection is torn down so the server cannot be used until
   * the user approves again — this is the correct behaviour for both initial
   * pending state and for revocation of a previously-approved server.
   */
  setPendingApproval(): void {
    if (!this.#currentConfig || !this.#configHash) {
      this.#logger.error('Cannot set pending approval - no valid config');
      return;
    }
    this.#disposeConnection();
    this.#toolCount = 0;
    this.#setState({
      status: ConnectionState.PendingApproval,
      config: this.#currentConfig,
      configHash: this.#configHash,
    });
  }

  /**
   * Apply new configuration and immediately mark the session as pending approval,
   * without starting a connection. Use this when the config has changed but the
   * new config has not yet been approved by the user.
   *
   * Unlike `setPendingApproval()`, which always tears down the active connection,
   * this only disposes the connection when the config hash actually changes. If the
   * config is unchanged the existing connection is left intact while the state moves
   * to PendingApproval. In practice the manager only calls this on a config change,
   * so the connection is always disposed.
   */
  applyConfigPendingApproval(rawConfig: unknown): void {
    const parseResult = this.#parseAndHashConfig(rawConfig);
    if (!parseResult.success) {
      this.#logger.error(`Config parse failed: ${parseResult.error}`);
      return;
    }

    // Tear down any existing connection before updating config
    if (this.#configHash !== parseResult.hash) {
      this.#disposeConnection();
      this.#currentConfig = parseResult.config;
      this.#configHash = parseResult.hash;
      this.#toolCount = 0;
    }

    if (!this.#currentConfig || !this.#configHash) {
      this.#logger.error('Cannot set pending approval - no valid config after update');
      return;
    }

    this.#setState({
      status: ConnectionState.PendingApproval,
      config: this.#currentConfig,
      configHash: this.#configHash,
    });
  }

  /**
   * Mark this session as rejected by the user.
   * Any active connection is torn down so the server cannot be used.
   */
  setRejected(): void {
    if (!this.#currentConfig || !this.#configHash) {
      this.#logger.error('Cannot set rejected - no valid config');
      return;
    }
    this.#disposeConnection();
    this.#toolCount = 0;
    this.#setState({
      status: ConnectionState.Rejected,
      config: this.#currentConfig,
      configHash: this.#configHash,
    });
  }

  /**
   * Start the connection (initial connect).
   * Also valid when transitioning from PendingApproval or Rejected states.
   */
  async start(): Promise<void> {
    if (
      this.#state.status === ConnectionState.Connecting ||
      this.#state.status === ConnectionState.Connected
    ) {
      return;
    }

    if (!this.#currentConfig) {
      this.#logger.error('Cannot start - no valid config');
      this.#setState({
        status: ConnectionState.Failed,
        error: 'Invalid configuration',
        failedAt: new Date(),
      });
      return;
    }

    await this.#connect();
  }

  async reconnect(): Promise<void> {
    if (!this.#currentConfig || !this.#configHash) {
      const error = 'Cannot reconnect - no valid config';
      this.#logger.error(error);
      this.#setState({
        status: ConnectionState.Failed,
        error,
        failedAt: new Date(),
      });
      throw new Error(error); // Make the error visible
    }

    // Force reconnect
    this.#disposeConnection();
    this.#setState({ status: ConnectionState.Disconnected });

    try {
      await this.#connect();
    } catch (error) {
      this.#logger.error('Reconnect failed', error);
      throw error;
    }
  }

  /**
   * Apply new configuration:
   * - deep-canonical hash for change detection
   * - if changed, tears down and reconnects
   * - if unchanged, no-op
   */
  async applyConfig(rawConfig: unknown): Promise<ConfigApplyResult> {
    // Parse and hash new config
    const parseResult = this.#parseAndHashConfig(rawConfig);
    if (!parseResult.success) {
      this.#logger.error(`Config parse failed: ${parseResult.error}`);
      return { changed: false, parseError: parseResult.error };
    }

    // Check if config actually changed
    if (this.#configHash === parseResult.hash) {
      return { changed: false };
    }

    this.#logger.info('Config changed - reconnecting');

    // Dispose old connection
    this.#disposeConnection();

    // Update config + hash
    this.#currentConfig = parseResult.config;
    this.#configHash = parseResult.hash;

    // reset session-derived counters
    this.#toolCount = 0;

    // Reconnect with new config
    await this.#connect();

    return { changed: true };
  }

  /**
   * Complete OAuth authentication (proxied to McpConnection).
   */
  finishAuth(code: string | null): ResultAsync<void, McpError> {
    if (!this.#connection) {
      return errAsync(McpError.connectionFailed(this.#serverName, 'No connection to authenticate'));
    }
    return this.#connection.finishAuth(code);
  }

  /**
   * Subscribe to state changes.
   * @returns Unsubscribe function
   */
  onStateChanged(handler: (state: ServerStateSnapshot) => void): () => void {
    this.#stateHandlers.add(handler);
    return () => this.#stateHandlers.delete(handler);
  }

  /**
   * Dispose and cleanup.
   */
  dispose(): void {
    this.#disposeConnection();
    this.#setState({ status: ConnectionState.Disconnected });
    this.#stateHandlers.clear();
    this.#currentConfig = undefined;
    this.#configHash = undefined;
    this.#toolCount = 0;
  }

  /* ------------------------------ private ------------------------------ */

  /**
   * Parse and deep-hash config for change detection.
   */
  #parseAndHashConfig(
    rawConfig: unknown,
  ): { success: true; config: ServerConfig; hash: string } | { success: false; error: string } {
    try {
      const parsed = ServerConfig.safeParse(rawConfig);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid config: ${parsed.error.message}`,
        };
      }

      const config = parsed.data;
      const hash = hashServerConfig(config);
      return { success: true, config, hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Config parse failed',
      };
    }
  }

  /**
   * Establish connection to the server with race hardening.
   */
  async #connect(): Promise<void> {
    if (!this.#currentConfig || !this.#configHash) {
      const error = 'Cannot connect - no valid config';
      this.#logger.error(error);
      this.#setState({
        status: ConnectionState.Failed,
        error,
        failedAt: new Date(),
      });
      throw new Error(error);
    }

    const myGen = ++this.#gen;

    // Set connecting state
    this.#setState({
      status: ConnectionState.Connecting,
      config: this.#currentConfig,
      configHash: this.#configHash,
      startedAt: new Date(),
    });

    this.#logger.debug('Connecting...');

    const serverInfo = {
      name: this.#serverName,
      displayName: this.#displayName,
      config: this.#currentConfig,
    };

    await this.#connectionFactory
      .connect(serverInfo, this.#workspacePath)
      .andTee((connection) => {
        if (this.#gen !== myGen) {
          connection.dispose();
          return;
        }
        this.#connection = connection;
        this.#setupConnectionHandlers(connection);

        const currentState = connection.getStateSnapshot();
        this.#enhanceAndEmitState(currentState);
      })
      .orTee((error) => {
        if (this.#gen !== myGen) return;
        this.#logger.error(`Connection failed: ${error.message}`);
        this.#setState({
          status: ConnectionState.Failed,
          config: this.#currentConfig,
          configHash: this.#configHash,
          error: error.message,
          failedAt: new Date(),
        });
      })
      .match(
        () => {}, // Success handled in andTee
        () => {}, // Error handled in orTee
      );
  }

  /**
   * Setup handlers to bridge connection events to server events.
   */
  #setupConnectionHandlers(connection: McpConnection): void {
    // Unsubscribe from previous connection
    this.#connectionUnsubscribe?.();

    // Subscribe to connection state changes
    this.#connectionUnsubscribe = connection.onStateChanged(
      (connState: ConnectionStateSnapshot) => {
        // If/when we reach Connected, fetch tools once to populate toolCount
        if (connState.status === ConnectionState.Connected) {
          this.#populateToolCountOnce(connState);
        }
        this.#enhanceAndEmitState(connState);
      },
    );
  }

  /**
   * On first Connected, fetch tools to populate toolCount and re-emit snapshot.
   */
  #populateToolCountOnce(
    connState: Extract<ConnectionStateSnapshot, { status: ConnectionState.Connected }>,
  ): void {
    // If already populated, skip
    if (this.#toolCount > 0) return;

    this.#getConnectedClient()
      .andThen((client) => client.getTools())
      .map((tools) => tools.length)
      .match(
        (count) => {
          if (typeof count === 'number' && count !== this.#toolCount) {
            this.#toolCount = count;
            // re-emit with updated count
            this.#enhanceAndEmitState(connState);
          }
        },
        // ignore errors; toolCount stays 0
        () => undefined,
      )
      .catch(() => {});
  }

  /**
   * Enhance connection state with server context and emit.
   */
  #enhanceAndEmitState(connectionState: ConnectionStateSnapshot): void {
    const serverState = this.#enhanceConnectionState(connectionState);
    this.#setState(serverState);
  }

  #enhanceConnectionState(conn: ConnectionStateSnapshot): ServerStateSnapshot {
    switch (conn.status) {
      case ConnectionState.Connecting:
        return enhanceConnectionState<ConnectionState.Connecting>(conn, {
          configHash: this.#configHash ?? '',
        });
      case ConnectionState.Authenticating:
        return enhanceConnectionState<ConnectionState.Authenticating>(conn, {
          configHash: this.#configHash ?? '',
        });
      case ConnectionState.Connected:
        return enhanceConnectionState<ConnectionState.Connected>(conn, {
          configHash: this.#configHash ?? '',
          toolCount: this.#toolCount,
        });
      case ConnectionState.Failed:
        return enhanceConnectionState<ConnectionState.Failed>(conn, {
          configHash: this.#configHash,
          error: conn.error.message,
        });
      case ConnectionState.Disconnected:
        return enhanceConnectionState<ConnectionState.Disconnected>(conn, {});
      case ConnectionState.PendingApproval:
        return enhanceConnectionState<ConnectionState.PendingApproval>(conn, {});
      case ConnectionState.Rejected:
        return enhanceConnectionState<ConnectionState.Rejected>(conn, {});
      default:
        return conn;
    }
  }

  /**
   * Dispose current connection.
   */
  #disposeConnection(): void {
    if (!this.#connection) return;

    this.#connectionUnsubscribe?.();
    this.#connectionUnsubscribe = undefined;

    this.#logger.debug('Disposing connection');
    this.#connection.dispose();
    this.#connection = undefined;
  }

  /**
   * Set state and emit to all handlers.
   */
  #setState(state: ServerStateSnapshot): void {
    // Avoid redundant updates when staying Disconnected, PendingApproval or Rejected
    const stableStates = new Set([
      ConnectionState.Disconnected,
      ConnectionState.PendingApproval,
      ConnectionState.Rejected,
    ]);
    if (this.#state.status === state.status && stableStates.has(state.status)) {
      return;
    }

    const oldStatus = this.#state.status;
    this.#state = state;

    this.#logger.debug(`State: ${oldStatus} → ${state.status}`);

    // Emit to all handlers
    for (const handler of this.#stateHandlers) {
      try {
        handler(state);
      } catch (error) {
        this.#logger.error('State handler error', error);
      }
    }
  }
}
