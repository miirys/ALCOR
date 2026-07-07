/**
 * Message Bus MCP Service
 * Real implementation that communicates with the backend via message bus
 */

import { resolveMessageBus } from '@gitlab-org/webview-client';
import type { MessageBus } from '@gitlab-org/message-bus';
import {
  MCP_DASHBOARD_WEBVIEW_ID,
  type McpDashboardMessages,
  type McpServerState,
  type McpTool,
  type ServerName,
  type McpLogEntry,
  type ToolExecutionResult,
  type ServerConfig,
  type ConfigErrorDetails,
} from '@gitlab-org/ai-configuration-webview/contract';
import type { IMcpService, McpServiceEvents } from './IMcpService';

type EventHandler = (...args: unknown[]) => void;

/**
 * Client-side message bus type
 * For the webview client:
 * - inbound = messages from backend (toWebview)
 * - outbound = messages to backend (fromWebview)
 */
type McpMessageBus = MessageBus<{
  inbound: McpDashboardMessages['toWebview'];
  outbound: McpDashboardMessages['fromWebview'];
}>;

/**
 * Transform server state from wire format to client format
 * Converts date strings back to Date objects
 */
function transformServerState(server: McpServerState): McpServerState {
  return {
    ...server,
    connectedAt: server.connectedAt ? new Date(server.connectedAt) : undefined,
  };
}

/**
 * Transform log entry from wire format to client format
 * Converts date strings back to Date objects
 */
function transformLogEntry(log: McpLogEntry): McpLogEntry {
  return {
    ...log,
    timestamp: new Date(log.timestamp),
  };
}

/**
 * Transform tool execution result from wire format to client format
 * Converts date strings back to Date objects
 */
function transformToolExecutionResult(result: ToolExecutionResult): ToolExecutionResult {
  return {
    ...result,
    executedAt: new Date(result.executedAt),
  };
}

/**
 * Message Bus-driven MCP Service
 * Communicates with the backend through the message bus
 */
export class MessageBusMcpService implements IMcpService {
  #messageBus: McpMessageBus;

  #eventHandlers: Map<keyof McpServiceEvents, EventHandler[]> = new Map();

  #initialized = false;

  constructor() {
    // Resolve the message bus for this webview
    this.#messageBus = resolveMessageBus<{
      inbound: McpDashboardMessages['toWebview'];
      outbound: McpDashboardMessages['fromWebview'];
    }>({
      webviewId: MCP_DASHBOARD_WEBVIEW_ID,
    });

    // Set up listeners for backend notifications
    this.#setupBackendListeners();
  }

  /**
   * Initialize the service and set up message bus listeners
   * @param workspaceUri - Optional workspace URI to initialize MCP servers
   */
  async initialize(workspaceUri?: string): Promise<void> {
    if (this.#initialized) return;

    // If workspace URI not provided, request it from backend
    let effectiveWorkspaceUri: string | undefined = workspaceUri;
    if (!effectiveWorkspaceUri) {
      try {
        const workspaceFromBackend = await this.#messageBus.sendRequest(
          'getWorkspaceUri',
          undefined,
        );
        // Convert null to undefined for consistency
        effectiveWorkspaceUri = workspaceFromBackend ?? undefined;
      } catch {
        // Silently fail - backend will log the error
      }
    }

    // Notify backend that webview is ready and provide workspace context.
    // Awaiting the request ensures reloadAllServers completes on the backend
    // before we proceed to loadData(), so getServers() sees the correct
    // post-approval-check state rather than stale PendingApproval states.
    await this.#messageBus.sendRequest('appReady', { workspaceUri: effectiveWorkspaceUri });

    this.#initialized = true;
  }

  /**
   * Clean up resources and close connections
   */
  async dispose(): Promise<void> {
    this.#eventHandlers.clear();

    // Check if message bus has a dispose method and call it
    if ('dispose' in this.#messageBus && typeof this.#messageBus.dispose === 'function') {
      await this.#messageBus.dispose();
    }

    this.#initialized = false;
  }

  /**
   * Register an event listener
   */
  on<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void {
    if (!this.#eventHandlers.has(event)) {
      this.#eventHandlers.set(event, []);
    }
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      handlers.push(handler as EventHandler);
    }
  }

  /**
   * Unregister an event listener
   */
  off<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void {
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler as EventHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to registered listeners
   */
  #emit<K extends keyof McpServiceEvents>(
    event: K,
    ...args: Parameters<McpServiceEvents[K]>
  ): void {
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  }

  /**
   * Set up listeners for backend notifications
   */
  #setupBackendListeners(): void {
    // Server state changed
    this.#messageBus.onNotification('serverStateChanged', ({ serverName, state }) => {
      this.#emit('server:state-changed', serverName, transformServerState(state));
    });

    // Server connected
    this.#messageBus.onNotification('serverConnected', ({ serverName, info }) => {
      this.#emit('server:connected', serverName, transformServerState(info));
    });

    // Server disconnected
    this.#messageBus.onNotification('serverDisconnected', ({ serverName, error }) => {
      this.#emit('server:disconnected', serverName, error);
    });

    // Server error
    this.#messageBus.onNotification('serverError', ({ serverName, error }) => {
      this.#emit('server:error', serverName, error);
    });

    // Tools updated
    this.#messageBus.onNotification('toolsUpdated', ({ serverName, tools }) => {
      this.#emit('tools:updated', serverName, tools);
    });

    // Log added
    this.#messageBus.onNotification('logAdded', (log) => {
      this.#emit('log:added', transformLogEntry(log));
    });

    // Initial state (optional fallback - we prefer explicit requests)
    this.#messageBus.onNotification('initialState', ({ servers }) => {
      // Emit server state changes for each server
      servers.forEach((server) => {
        this.#emit('server:state-changed', server.name, transformServerState(server));
      });
    });
  }

  // ===== Server Operations =====

  /**
   * Get the current workspace URI from the backend
   */
  async getWorkspaceUri(): Promise<string | null> {
    return this.#messageBus.sendRequest('getWorkspaceUri', undefined);
  }

  /**
   * Get all servers
   */
  async getServers(): Promise<McpServerState[]> {
    const servers = await this.#messageBus.sendRequest('getServers', undefined);
    return servers.map(transformServerState);
  }

  /**
   * Get a specific server by name
   */
  async getServer(serverName: ServerName): Promise<McpServerState | null> {
    const server = await this.#messageBus.sendRequest('getServer', { serverName });
    return server ? transformServerState(server) : null;
  }

  /**
   * Reload all servers (smart reload - only reconnects if config changed)
   */
  async reloadServers(): Promise<void> {
    this.#messageBus.sendNotification('reloadServers', undefined);
  }

  /**
   * Restart all servers (force reconnect all)
   */
  async restartAllServers(): Promise<void> {
    this.#messageBus.sendNotification('restartAllServers', undefined);
  }

  /**
   * Restart a specific server (force reconnect)
   */
  async restartServer(serverName: ServerName): Promise<void> {
    this.#messageBus.sendNotification('restartServer', { serverName });
  }

  /**
   * Start authentication flow for a server
   */
  async startAuthentication(serverName: ServerName): Promise<void> {
    this.#messageBus.sendNotification('startAuthentication', { serverName });
  }

  // ===== Tool Operations =====

  /**
   * Get all tools from all servers
   */
  async getTools(): Promise<McpTool[]> {
    return this.#messageBus.sendRequest('getTools', undefined);
  }

  /**
   * Get tools for a specific server
   */
  async getToolsForServer(serverName: ServerName): Promise<McpTool[]> {
    return this.#messageBus.sendRequest('getToolsForServer', { serverName });
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    return this.#messageBus.sendRequest('executeTool', { toolName, args });
  }

  /**
   * Get tool execution history
   */
  async getExecutionHistory(): Promise<ToolExecutionResult[]> {
    const history = await this.#messageBus.sendRequest('getExecutionHistory', undefined);
    return history.map(transformToolExecutionResult);
  }

  // ===== Log Operations =====

  /**
   * Get all logs
   */
  async getLogs(): Promise<McpLogEntry[]> {
    const logs = await this.#messageBus.sendRequest('getLogs', undefined);
    return logs.map(transformLogEntry);
  }

  /**
   * Get logs for a specific server
   */
  async getLogsForServer(serverName: ServerName): Promise<McpLogEntry[]> {
    const logs = await this.#messageBus.sendRequest('getLogsForServer', { serverName });
    return logs.map(transformLogEntry);
  }

  /**
   * Clear logs for a specific server
   */
  async clearLogsForServer(serverName: ServerName): Promise<void> {
    this.#messageBus.sendNotification('clearLogsForServer', { serverName });
  }

  // ===== Configuration Operations =====

  /**
   * Get available config file paths
   */
  async getConfigPaths(): Promise<{ workspace: string | null; user: string | null }> {
    return this.#messageBus.sendRequest('getConfigPaths', undefined);
  }

  /**
   * Check if a config file is managed by our tooling
   */
  async isManagedConfig(filePath: string): Promise<boolean> {
    return this.#messageBus.sendRequest('isManagedConfig', { filePath });
  }

  /**
   * Save server configuration to specified file
   */
  async saveServer(
    serverName: ServerName,
    config: ServerConfig,
    targetFile: 'workspace' | 'user',
  ): Promise<{ success: true } | { success: false; error: string; details?: ConfigErrorDetails }> {
    return this.#messageBus.sendRequest('saveServer', { serverName, config, targetFile });
  }

  /**
   * Delete server from its source file
   */
  async deleteServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.#messageBus.sendRequest('deleteServer', { serverName });
  }

  /**
   * Save pre-approved tools configuration for a server
   */
  async saveApprovedTools(
    serverName: ServerName,
    approvedToolNames: string[],
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.#messageBus.sendRequest('saveApprovedTools', { serverName, approvedToolNames });
  }

  // ===== Server Approval Operations =====

  async approveServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.#messageBus.sendRequest('approveServer', { serverName });
  }

  async rejectServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.#messageBus.sendRequest('rejectServer', { serverName });
  }

  async revokeServerDecision(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.#messageBus.sendRequest('revokeServerDecision', { serverName });
  }
}
