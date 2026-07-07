// packages/lib_ai_configuration/src/mcp/manager.ts
import { EventEmitter } from 'events';
import { Logger } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import type { Configuration, ConfigurationServersOrigin, ServerConfig } from './config';
import { McpConfigResolver } from './config';
import { McpToolSessionApprovalStore, McpServerApprovalStore, McpApprovalPolicy } from './approval';
import { getMcpConfigPathCandidates, logMcpConfigResolution, hashServerConfig } from './utils';
import {
  type McpServerState,
  type McpTool,
  type ServerName,
  type WorkflowId,
  LogLevel,
  McpEvents,
  McpLogEntry,
  McpToolName,
  ToolExecutionResult,
} from './types';
import { ConnectionState } from './client/connection';
import { McpServerSessionManager, type ServerStateSnapshot } from './server_session_manager';
import { McpServerSessionManagerFactory } from './server_session_manager_factory';

type EventHandler = (...args: unknown[]) => void;

type LogMethod = 'error' | 'warn' | 'info' | 'debug';

const levelToMethod = {
  [LogLevel.Error]: 'error',
  [LogLevel.Warning]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
} as const satisfies Record<LogLevel, LogMethod>;

/**
 * Fleet-level MCP Manager
 * - Orchestrates per-server sessions (add/update/remove) from configuration
 * - Forwards state & log events
 * - Routes tool listing/execution & approvals
 */
@Service({
  dependencies: [
    Logger,
    McpConfigResolver,
    McpServerSessionManagerFactory,
    McpToolSessionApprovalStore,
    McpServerApprovalStore,
    McpApprovalPolicy,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class McpManager {
  #logger: Logger;

  #configResolver: McpConfigResolver;

  #mcpServerSessionManagerFactory: McpServerSessionManagerFactory;

  #approvalStore: McpToolSessionApprovalStore;

  #serverApprovalStore: McpServerApprovalStore;

  #approvalPolicy: McpApprovalPolicy;

  // Session managers per server
  #sessions = new Map<ServerName, McpServerSessionManager>();

  // Telemetry
  #executionHistory: ToolExecutionResult[] = [];

  #logs: McpLogEntry[] = [];

  #logIdCounter = 0;

  #eventEmitter = new EventEmitter();

  // Workspace + config snapshot
  #workspacePath?: string;

  #serversOrigin?: ConfigurationServersOrigin;

  // Resolves the next time reloadAllServers() finishes. Lets callers (e.g. the
  // CLI MCP approval gate) wait for a reload to actually complete instead of
  // relying on waitForAllServersSettled, which resolves immediately when no
  // sessions exist yet and treats PendingApproval as settled.
  #reloadSettledWaiters: (() => void)[] = [];

  #hasCompletedReload = false;

  constructor(
    logger: Logger,
    configResolver: McpConfigResolver,
    mcpServerSessionManagerFactory: McpServerSessionManagerFactory,
    approvalStore: McpToolSessionApprovalStore,
    serverApprovalStore: McpServerApprovalStore,
    approvalPolicy: McpApprovalPolicy,
  ) {
    this.#logger = logger;
    this.#configResolver = configResolver;
    this.#mcpServerSessionManagerFactory = mcpServerSessionManagerFactory;
    this.#approvalStore = approvalStore;
    this.#serverApprovalStore = serverApprovalStore;
    this.#approvalPolicy = approvalPolicy;
  }

  /* ============================== lifecycle ============================== */

  async dispose(): Promise<void> {
    this.#logger.info('[MCP Manager] Disposing service');

    await Promise.all([...this.#sessions.values()].map((s) => s.dispose()));
    this.#sessions.clear();

    this.#logs = [];
    this.#executionHistory = [];
    this.#eventEmitter.removeAllListeners();
  }

  /* ============================== servers =============================== */

  async getServers(): Promise<McpServerState[]> {
    return [...this.#sessions.keys()].map((name) => this.#getServerState(name));
  }

  async getServer(serverName: ServerName): Promise<McpServerState | null> {
    const s = this.#sessions.get(serverName);
    return s ? this.#getServerState(serverName) : null;
  }

  async restartServer(serverName: ServerName): Promise<void> {
    this.#logger.info(`[MCP Manager] Restarting server: ${serverName}`);
    const s = this.#sessions.get(serverName);
    if (!s) {
      this.#logger.warn(`[MCP Manager] Server not found: ${serverName}`);
      return;
    }

    try {
      await s.reconnect();
    } catch (error) {
      this.#logger.error(`Failed to restart ${serverName}`, error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  async restartAllServers(): Promise<void> {
    this.#logger.info('[MCP Manager] Restarting all servers');
    const results = await Promise.allSettled(
      [...this.#sessions.values()].map((session) => session.reconnect()),
    );

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const serverName = [...this.#sessions.keys()][idx];
        this.#logger.error(`Failed to restart ${serverName}`, result.reason);
      }
    });
  }

  #getServerScope(serverName: ServerName): 'workspace' | 'user' {
    return (this.#serversOrigin?.[serverName]?.index ?? 0) === 0 ? 'workspace' : 'user';
  }

  #isUserProvidedServer(serverName: ServerName): boolean {
    return this.#getServerScope(serverName) === 'user';
  }

  async reloadAllServers(workspacePath?: string): Promise<void> {
    try {
      await this.#doReloadAllServers(workspacePath);
    } finally {
      this.#notifyReloadSettled();
    }
  }

  async #doReloadAllServers(workspacePath?: string): Promise<void> {
    if (workspacePath && workspacePath !== this.#workspacePath) this.#workspacePath = workspacePath;
    if (!this.#workspacePath) {
      this.#logger.warn('[MCP Manager] Cannot reload: no workspace path set');
      return;
    }

    this.#logger.info('[MCP Manager] Reloading all servers from disk');
    const result = await this.#loadConfiguration(this.#workspacePath);
    if (!result) {
      this.#logger.warn('[MCP Manager] No configuration found during reload');
      return;
    }

    this.#serversOrigin = result.serversOrigin;

    // Remove deleted servers
    for (const [name] of this.#sessions) {
      if (!result.config.mcpServers[name]) {
        this.#logger.debug(`[MCP Manager] Server removed: ${name}`);

        this.#sessions.get(name)?.dispose();
        this.#sessions.delete(name);

        // TODO: we should rename this event to server:removed
        this.#emit('server:disconnected', name, 'Server removed from configuration');
      }
    }

    // Add/update servers
    const pendingServerNames: ServerName[] = [];

    await Promise.all(
      Object.entries(result.serversOrigin).map(async ([name, origin]) => {
        const serverName = name as ServerName;
        const session = this.#sessions.get(serverName);
        if (session) {
          if (!origin.parseResult.success) {
            // Config parse failed — leave the session as-is so the error remains visible.
            return;
          }

          const newConfigHash = hashServerConfig(origin.parseResult.config);
          const configChanged = session.currentConfigHash !== newConfigHash;

          // User-provided servers (index > 0) are auto-approved — skip the gate entirely.
          if (this.#isUserProvidedServer(serverName)) {
            await session.applyConfig(origin.parseResult.config);
          } else if (configChanged) {
            // The server config has changed. Run the approval gate on the new config
            // before allowing a connection — even if the server was previously approved
            // under a different config hash.
            const approvalEntry = await this.#serverApprovalStore.lookup(newConfigHash);
            const effectiveDecision = this.#approvalPolicy.decide(newConfigHash, approvalEntry);

            if (effectiveDecision === 'approved') {
              await session.applyConfig(origin.parseResult.config);
            } else if (effectiveDecision === 'rejected') {
              session.applyConfigPendingApproval(origin.parseResult.config);
              session.setRejected();
            } else {
              // pendingApproval — update config but do not connect
              session.applyConfigPendingApproval(origin.parseResult.config);
              pendingServerNames.push(serverName);
            }
          } else {
            // Config unchanged — re-evaluate approval only for sessions stuck in
            // PendingApproval or Rejected (the user may have approved/rejected since
            // the session was created). No need to re-parse or re-hash the config.
            const currentStatus = session.getState().status;
            if (
              currentStatus === ConnectionState.PendingApproval ||
              currentStatus === ConnectionState.Rejected
            ) {
              const approvalEntry = await this.#serverApprovalStore.lookup(newConfigHash);
              const effectiveDecision = this.#approvalPolicy.decide(newConfigHash, approvalEntry);

              if (effectiveDecision === 'approved') {
                await session.start();
              } else if (effectiveDecision === 'rejected') {
                session.setRejected();
              } else {
                pendingServerNames.push(serverName);
              }
            }
          }
        } else {
          if (!origin.parseResult.success) {
            // Config parse failed — create session so the error is visible in the dashboard
            const newSession = this.#mcpServerSessionManagerFactory.create(
              serverName,
              origin.displayName,
              origin.parseResult.config,
              this.#workspacePath as string,
            );
            this.#bindSession(serverName, newSession);
            this.#sessions.set(serverName, newSession);
            return;
          }

          const configHash = hashServerConfig(origin.parseResult.config);

          const newSession = this.#mcpServerSessionManagerFactory.create(
            serverName,
            origin.displayName,
            origin.parseResult.config,
            this.#workspacePath as string,
          );
          this.#bindSession(serverName, newSession);
          this.#sessions.set(serverName, newSession);

          // User-provided servers (index > 0) are auto-approved — skip the gate entirely.
          if (this.#isUserProvidedServer(serverName)) {
            await newSession.start();
          } else {
            const approvalEntry = await this.#serverApprovalStore.lookup(configHash);
            const effectiveDecision = this.#approvalPolicy.decide(configHash, approvalEntry);

            if (effectiveDecision === 'approved') {
              await newSession.start();
            } else if (effectiveDecision === 'rejected') {
              newSession.setRejected();
            } else {
              // pendingApproval — no entry or policy says pending
              newSession.setPendingApproval();
              pendingServerNames.push(serverName);
            }
          }
        }
      }),
    );

    if (pendingServerNames.length > 0) {
      this.#logger.info(
        `[MCP Manager] ${pendingServerNames.length} server(s) pending approval: ${pendingServerNames.join(', ')}`,
      );
      this.#emit('servers:pending-approval', pendingServerNames);
    }
  }

  /**
   * Approve a server by name: persist the decision and start the session.
   */
  async approveServer(serverName: ServerName): Promise<void> {
    const session = this.#sessions.get(serverName);
    if (!session) {
      this.#logger.warn(`[MCP Manager] approveServer: server not found: ${serverName}`);
      return;
    }

    const hash = session.currentConfigHash;
    if (!hash) {
      this.#logger.warn(`[MCP Manager] approveServer: no config for server: ${serverName}`);
      return;
    }

    await this.#serverApprovalStore.approve(hash);

    this.#logger.info(`[MCP Manager] Server approved: ${serverName}`);
    await session.start();
  }

  /**
   * Reject a server by name: persist the decision and mark the session as rejected.
   */
  async rejectServer(serverName: ServerName): Promise<void> {
    const session = this.#sessions.get(serverName);
    if (!session) {
      this.#logger.warn(`[MCP Manager] rejectServer: server not found: ${serverName}`);
      return;
    }

    const hash = session.currentConfigHash;
    if (!hash) {
      this.#logger.warn(`[MCP Manager] rejectServer: no config for server: ${serverName}`);
      return;
    }

    await this.#serverApprovalStore.reject(hash);

    this.#logger.info(`[MCP Manager] Server rejected: ${serverName}`);
    session.setRejected();
  }

  /**
   * Revoke a server's approval decision: remove the persisted entry and re-prompt.
   * If the server is currently running, it is stopped and put back into PendingApproval
   * so the user can immediately approve or reject it again without a reload.
   */
  async revokeServerDecision(serverName: ServerName): Promise<void> {
    const session = this.#sessions.get(serverName);
    if (!session) {
      this.#logger.warn(`[MCP Manager] revokeServerDecision: server not found: ${serverName}`);
      return;
    }

    const hash = session.currentConfigHash;
    if (hash) {
      await this.#serverApprovalStore.revoke(hash);
    }

    this.#logger.info(`[MCP Manager] Server decision revoked: ${serverName}`);

    // Keep the session alive but put it back into PendingApproval so the user
    // can approve/reject immediately without needing a full reload.
    session.setPendingApproval();
  }

  /* =============================== tools ================================ */

  async getTools(workflowId?: WorkflowId): Promise<McpTool[]> {
    const all = await Promise.all(
      [...this.#sessions.values()].map((s) =>
        s
          .getTools()
          .map((tools) => this.#transformTools(tools, workflowId))
          .unwrapOr([]),
      ),
    );
    return all.flat();
  }

  getToolsForServer(serverName: ServerName, workflowId?: WorkflowId): Promise<McpTool[]> {
    const s = this.#sessions.get(serverName);
    if (!s) return Promise.resolve([]);
    return s
      .getTools()
      .map((tools) => this.#transformTools(tools, workflowId))
      .unwrapOr([]);
  }

  executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const startTime = Date.now();
    if (!McpToolName.is(toolName)) throw new Error(`Invalid tool name format: ${toolName}`);

    const address = McpToolName.parse(toolName as McpToolName);
    const s = this.#sessions.get(address.serverName);
    if (!s) throw new Error(`Server not found: ${address.serverName}`);

    this.#logger.debug(
      `[MCP Manager] Executing tool="${address.toolName}" server="${address.serverName}"`,
    );

    return s
      .executeTool(address.toolName, args)
      .andTee((result) => {
        this.#executionHistory.push({
          toolName,
          success: true,
          result,
          executedAt: new Date(),
        });
        this.#addLog(address.serverName, LogLevel.Info, `Tool executed: ${address.toolName}`, {
          duration: Date.now() - startTime,
        });
      })
      .orTee((error) => {
        this.#executionHistory.push({
          toolName,
          success: false,
          error: error.message,
          executedAt: new Date(),
        });
        this.#logger.error(`[MCP Manager] Tool execution failed - tool="${toolName}"`, error);
      })
      .match(
        (x) => x,
        (e) => {
          throw new Error(e.message);
        },
      );
  }

  async getExecutionHistory(): Promise<ToolExecutionResult[]> {
    return [...this.#executionHistory];
  }

  /**
   * Wait for all MCP servers to reach a terminal connection state.
   *
   * A server is considered "settled" when it has reached one of these terminal states:
   * - Connected: Successfully connected and ready to use
   * - Failed: Connection failed or authentication failed
   * - Disconnected: Not connected (initial state or after disconnect)
   *
   * Servers in transient states (Connecting, Authenticating) are not considered settled.
   *
   * This method is typically called after `reloadAllServers()` to ensure servers have
   * completed their connection attempts before retrieving tools or executing workflows.
   *
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000ms / 30s)
   * @param options.requireAll - If false (default), resolves when timeout is reached if at least
   *                             one server is connected. If true, rejects on timeout unless ALL
   *                             servers are settled. Use false for graceful degradation.
   *
   * @returns Promise that resolves when settled, or rejects on timeout (if requireAll=true)
   *
   * @throws {Error} When timeout is reached and either no servers are connected (requireAll=false)
   *                 or not all servers are settled (requireAll=true)
   *
   * @remarks
   * - OAuth flows may take significant time (user interaction required), consider longer timeouts
   * - If no servers exist, resolves immediately
   * - Subscribes to 'server:state-changed' events internally, cleans up on completion
   * - With requireAll=false (default), this provides graceful degradation for slow/failing servers
   */
  async waitForAllServersSettled(
    timeoutMs: number = 30000,
    options: { requireAll?: boolean } = {},
  ): Promise<void> {
    const { requireAll = false } = options;

    const isSettledState = (state: ConnectionState): boolean => {
      return (
        state === ConnectionState.Connected ||
        state === ConnectionState.Disconnected ||
        state === ConnectionState.Failed ||
        state === ConnectionState.PendingApproval ||
        state === ConnectionState.Rejected
      );
    };

    const checkAllSettled = (): boolean => {
      if (this.#sessions.size === 0) return true;

      for (const session of this.#sessions.values()) {
        const state = session.getState();
        if (!isSettledState(state.status)) {
          return false;
        }
      }
      return true;
    };

    const hasAnyConnected = (): boolean => {
      for (const session of this.#sessions.values()) {
        if (session.getState().status === ConnectionState.Connected) {
          return true;
        }
      }
      return false;
    };

    if (checkAllSettled()) {
      this.#logger.debug('[MCP Manager] All servers already settled');
      return;
    }

    this.#logger.debug(`[MCP Manager] Waiting for servers to settle (timeout=${timeoutMs}ms)`);

    await new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;

      const handler = () => {
        if (checkAllSettled()) {
          if (timeout) clearTimeout(timeout);
          this.off('server:state-changed', handler);
          this.#logger.debug('[MCP Manager] All servers settled');
          resolve();
        }
      };

      this.on('server:state-changed', handler);

      timeout = setTimeout(() => {
        this.off('server:state-changed', handler);

        const unsettled = [...this.#sessions.entries()]
          .filter(([, session]) => !isSettledState(session.getState().status))
          .map(([name]) => name);

        // If we don't require all servers and we have at least one connected, resolve
        if (!requireAll && hasAnyConnected()) {
          this.#logger.warn(
            `[MCP Manager] Timeout reached but continuing with ${this.#sessions.size - unsettled.length} settled server(s). ` +
              `Still waiting for: ${unsettled.join(', ')}`,
          );
          resolve();
          return;
        }

        this.#logger.error(
          `[MCP Manager] Timeout waiting for servers to settle: ${unsettled.join(', ')}`,
        );

        reject(
          new Error(
            `Timeout after ${timeoutMs}ms waiting for servers to settle. ` +
              `Unsettled servers: ${unsettled.join(', ')}`,
          ),
        );
      }, timeoutMs);
    });
  }

  /**
   * Resolve once a reloadAllServers() call has completed.
   *
   * If a reload has already completed at least once, resolves on the next tick.
   * Otherwise waits for the first reload to finish (or the timeout, whichever is
   * first). Unlike waitForAllServersSettled, this never resolves before a reload
   * has actually run, so callers can reliably tell that any pending-approval
   * emission has already fired.
   */
  whenReloadSettled(timeoutMs: number = 30000): Promise<void> {
    if (this.#hasCompletedReload) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let timeout: NodeJS.Timeout | null = null;

      const waiter = () => {
        if (timeout) clearTimeout(timeout);
        resolve();
      };

      this.#reloadSettledWaiters.push(waiter);

      timeout = setTimeout(() => {
        const index = this.#reloadSettledWaiters.indexOf(waiter);
        if (index >= 0) this.#reloadSettledWaiters.splice(index, 1);
        this.#logger.warn(`[MCP Manager] whenReloadSettled timed out after ${timeoutMs}ms`);
        resolve();
      }, timeoutMs);
    });
  }

  #notifyReloadSettled(): void {
    this.#hasCompletedReload = true;
    const waiters = this.#reloadSettledWaiters;
    this.#reloadSettledWaiters = [];
    waiters.forEach((waiter) => waiter());
  }

  /* ================================ logs ================================= */

  async getLogs(): Promise<McpLogEntry[]> {
    return [...this.#logs];
  }

  async getLogsForServer(serverName: ServerName): Promise<McpLogEntry[]> {
    return this.#logs.filter((l) => l.serverName === serverName);
  }

  async clearLogsForServer(serverName: ServerName): Promise<void> {
    this.#logs = this.#logs.filter((l) => l.serverName !== serverName);
  }

  /* ============================ event bridge ============================= */

  on<K extends keyof McpEvents>(event: K, handler: McpEvents[K]): void {
    this.#eventEmitter.on(event, handler as EventHandler);
  }

  off<K extends keyof McpEvents>(event: K, handler: McpEvents[K]): void {
    this.#eventEmitter.off(event, handler as EventHandler);
  }

  /* ============================== internals ============================== */

  #bindSession(serverName: ServerName, session: McpServerSessionManager) {
    // one handler per session
    const unsub = session.onStateChanged((state) => this.#onSessionState(serverName, state));
    // store an unsubscriber if you want later; for now, recreate session on replace
    return unsub;
  }

  #onSessionState(serverName: ServerName, state: ServerStateSnapshot) {
    // Fan out a generic state-changed event
    this.#emit('server:state-changed', serverName, this.#getServerState(serverName));

    // Log + specialized events based on transitions
    switch (state.status) {
      case ConnectionState.Connected:
        this.#addLog(serverName, LogLevel.Info, 'Connected');
        this.#emit('server:connected', serverName, this.#getServerState(serverName));
        // Optionally surface tools on connect
        this.getToolsForServer(serverName)
          .then((tools) => {
            this.#emit('tools:updated', serverName, tools);

            return undefined;
          })
          .catch((error) => {
            this.#logger.error(`Failed to fetch tools for ${serverName}`, error);
          });
        break;
      case ConnectionState.Authenticating:
        if (state.authUrl) {
          this.#addLog(serverName, LogLevel.Warning, 'Authentication required', {
            authUrl: state.authUrl,
          });
        } else {
          this.#addLog(serverName, LogLevel.Warning, 'Authentication required');
        }
        break;
      case ConnectionState.Failed:
        this.#addLog(serverName, LogLevel.Error, state.error);
        this.#emit('server:error', serverName, state.error);
        break;
      case ConnectionState.Disconnected:
        this.#addLog(serverName, LogLevel.Info, 'Disconnected');
        this.#emit('server:disconnected', serverName, 'Disconnected');
        break;
      case ConnectionState.PendingApproval:
        this.#addLog(serverName, LogLevel.Warning, 'Pending user approval');
        break;
      case ConnectionState.Rejected:
        this.#addLog(serverName, LogLevel.Warning, 'Rejected by user');
        break;
      case ConnectionState.Connecting:
      default:
        break;
    }
  }

  #getServerState(serverName: ServerName): McpServerState {
    const s = this.#sessions.get(serverName);
    if (!s) throw new Error(`Server session not found: ${serverName}`);

    const state = s.getState();

    const connectedAt = state.status === ConnectionState.Connected ? state.connectedAt : undefined;
    const err = state.status === ConnectionState.Failed ? state.error : undefined;
    const authUrl = state.status === ConnectionState.Authenticating ? state.authUrl : undefined;

    const origin = this.#serversOrigin?.[serverName];
    return {
      name: serverName,
      displayName: origin?.displayName ?? serverName,
      config: (s.currentConfig || {}) as ServerConfig,
      connectionState: state.status,
      connectedAt,
      error: err,
      authUrl,
      serverInfo: state.status === ConnectionState.Connected ? state.serverInfo : undefined,
      configSource: origin?.resolvedPath,
      scope: this.#getServerScope(serverName),
    };
  }

  #transformTools(tools: McpTool[], workflowId?: WorkflowId): McpTool[] {
    return tools.map((t) => ({
      ...t,
      isApproved: workflowId
        ? this.#isToolApproved(t.serverName, t.originalToolName, workflowId)
        : this.#isToolApprovedByConfig(t.serverName, t.originalToolName),
    }));
  }

  #isToolApprovedByConfig(serverName: ServerName, originalToolName: string): boolean {
    const origin = this.#serversOrigin?.[serverName];
    if (!origin?.parseResult.success) return false;

    const { approvedTools } = origin.parseResult.config;
    if (approvedTools === true) return true;
    if (Array.isArray(approvedTools)) return approvedTools.includes(originalToolName);
    return false;
  }

  #isToolApproved(serverName: ServerName, originalToolName: string, workflowId?: WorkflowId) {
    const configApproved = this.#isToolApprovedByConfig(serverName, originalToolName);
    const sessionApproved = workflowId
      ? this.#approvalStore.isToolApproved(workflowId, { serverName, toolName: originalToolName })
      : false;
    return configApproved || sessionApproved;
  }

  #emit<K extends keyof McpEvents>(event: K, ...args: Parameters<McpEvents[K]>): void {
    this.#eventEmitter.emit(event, ...args);
  }

  #addLog(
    serverName: ServerName,
    level: LogLevel,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const log: McpLogEntry = {
      id: `log-${++this.#logIdCounter}-${Date.now()}`,
      serverName,
      timestamp: new Date(),
      level,
      message,
      details,
    };
    this.#logs.unshift(log);
    if (this.#logs.length > 1000) this.#logs = this.#logs.slice(0, 1000);
    this.#emit('log:added', log);

    const logFn = levelToMethod[level];
    this.#logger[logFn](`[MCP Manager] ${serverName}: ${message}`);
  }

  async #loadConfiguration(
    workspacePath: string,
  ): Promise<{ config: Configuration; serversOrigin: ConfigurationServersOrigin } | undefined> {
    const candidatePaths = getMcpConfigPathCandidates(workspacePath).map((c) => c.path);
    const result = await this.#configResolver.loadAndMerge(candidatePaths);
    logMcpConfigResolution(this.#logger, result, candidatePaths);

    if (!result.config) return undefined;
    return { config: result.config, serversOrigin: result.serversOrigin };
  }
}
