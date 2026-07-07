/**
 * MCP Service Interface
 * Abstract contract for MCP service implementations
 * This allows for different transport mechanisms (WebSocket, HTTP, Mock)
 */

import type {
  McpServerState,
  McpTool,
  ServerName,
  McpLogEntry,
  ToolExecutionResult,
  ServerConfig,
  ConfigErrorDetails,
} from '../types/mcp';

/**
 * Events that the MCP service can emit
 * These allow real-time updates without polling
 */
export interface McpServiceEvents {
  'server:state-changed': (serverName: ServerName, state: McpServerState) => void;
  'server:connected': (serverName: ServerName, info: McpServerState) => void;
  'server:disconnected': (serverName: ServerName, error?: string) => void;
  'server:error': (serverName: ServerName, error: string) => void;
  'tools:updated': (serverName: ServerName, tools: McpTool[]) => void;
  'log:added': (log: McpLogEntry) => void;
}

/**
 * MCP Service Interface
 * All MCP service implementations must conform to this interface
 */
export interface IMcpService {
  /**
   * Initialize the service and start listening for events
   * @param workspaceUri - Optional workspace URI to initialize MCP servers
   */
  initialize(workspaceUri?: string): Promise<void>;

  /**
   * Get the current workspace URI from the backend
   */
  getWorkspaceUri(): Promise<string | null>;

  /**
   * Clean up resources and close connections
   */
  dispose(): Promise<void>;

  /**
   * Register an event listener
   */
  on<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void;

  /**
   * Unregister an event listener
   */
  off<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void;

  // ===== Server Operations =====

  /**
   * Get all servers
   */
  getServers(): Promise<McpServerState[]>;

  /**
   * Get a specific server by name
   */
  getServer(serverName: ServerName): Promise<McpServerState | null>;

  /**
   * Reload all servers (smart reload - only reconnects if config changed)
   */
  reloadServers(): Promise<void>;

  /**
   * Restart all servers (force reconnect all)
   */
  restartAllServers(): Promise<void>;

  /**
   * Restart a specific server (force reconnect)
   */
  restartServer(serverName: ServerName): Promise<void>;

  /**
   * Start authentication flow for a server
   * Returns the auth URL if available
   */
  startAuthentication(serverName: ServerName): Promise<void>;

  // ===== Tool Operations =====

  /**
   * Get all tools from all servers
   */
  getTools(): Promise<McpTool[]>;

  /**
   * Get tools for a specific server
   */
  getToolsForServer(serverName: ServerName): Promise<McpTool[]>;

  /**
   * Execute a tool
   */
  executeTool(toolName: string, args: Record<string, unknown>): Promise<string>;

  /**
   * Get tool execution history
   */
  getExecutionHistory(): Promise<ToolExecutionResult[]>;

  // ===== Log Operations =====

  /**
   * Get all logs
   */
  getLogs(): Promise<McpLogEntry[]>;

  /**
   * Get logs for a specific server
   */
  getLogsForServer(serverName: ServerName): Promise<McpLogEntry[]>;

  /**
   * Clear logs for a specific server
   */
  clearLogsForServer(serverName: ServerName): Promise<void>;

  // ===== Configuration Operations =====

  /**
   * Get available config file paths
   */
  getConfigPaths(): Promise<{ workspace: string | null; user: string | null }>;

  /**
   * Check if a config file is managed by our tooling
   */
  isManagedConfig(filePath: string): Promise<boolean>;

  /**
   * Save server configuration to specified file
   */
  saveServer(
    serverName: ServerName,
    config: ServerConfig,
    targetFile: 'workspace' | 'user',
  ): Promise<{ success: true } | { success: false; error: string; details?: ConfigErrorDetails }>;

  /**
   * Delete server from its source file
   */
  deleteServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }>;

  /**
   * Save pre-approved tools configuration for a server.
   */
  saveApprovedTools(
    serverName: ServerName,
    approvedToolNames: string[],
  ): Promise<{ success: true } | { success: false; error: string }>;

  // ===== Server Approval Operations =====

  /**
   * Approve a server: persist the decision and start the session.
   */
  approveServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }>;

  /**
   * Reject a server: persist the decision; session stays not-started.
   */
  rejectServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }>;

  /**
   * Revoke a server's approval decision so the user is re-prompted on next reload.
   */
  revokeServerDecision(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }>;
}
