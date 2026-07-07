/**
 * MCP Dashboard Store
 * Manages state for MCP servers, tools, and connections
 * Uses dependency injection and event-driven architecture
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type {
  McpServerState,
  McpTool,
  ServerName,
  ToolExecutionResult,
  McpLogEntry,
  ServerConfig,
} from '../types/mcp';
import { ConnectionState } from '../types/mcp';
import type { IMcpService } from '../services/IMcpService';
import { getMcpService } from '../services/mcpServiceFactory';

export const useMcpStore = defineStore('mcp', () => {
  // Dependencies
  const mcpService: IMcpService = getMcpService();

  // State
  const servers = ref<McpServerState[]>([]);
  const tools = ref<McpTool[]>([]);
  const executionHistory = ref<ToolExecutionResult[]>([]);
  const logs = ref<McpLogEntry[]>([]);
  const isLoading = ref(false);
  const isSavingApprovedTools = ref(false);
  const error = ref<string | null>(null);
  const lastReloadTime = ref<Date | null>(null);
  const workspaceUri = ref<string | null>(null);
  const workspaceConfigPath = ref<string | null>(null);
  const userConfigPath = ref<string | null>(null);

  // Max logs to keep in memory (for performance)
  const MAX_LOGS = 500;

  const ERROR_DISMISS_MS = 8_000;
  let errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

  // Computed
  const connectedServers = computed(() =>
    servers.value.filter((s) => s.connectionState === ConnectionState.Connected),
  );

  const disconnectedServers = computed(() =>
    servers.value.filter((s) => s.connectionState === ConnectionState.Disconnected),
  );

  const failedServers = computed(() =>
    servers.value.filter((s) => s.connectionState === ConnectionState.Failed),
  );

  const pendingServers = computed(() =>
    servers.value.filter((s) => s.connectionState === ConnectionState.PendingApproval),
  );

  const rejectedServers = computed(() =>
    servers.value.filter((s) => s.connectionState === ConnectionState.Rejected),
  );

  const approvedTools = computed(() => tools.value.filter((t) => t.isApproved));

  const unapprovedTools = computed(() => tools.value.filter((t) => !t.isApproved));

  const serverStats = computed(() => ({
    total: servers.value.length,
    connected: connectedServers.value.length,
    disconnected: disconnectedServers.value.length,
    failed: failedServers.value.length,
  }));

  const toolStats = computed(() => ({
    total: tools.value.length,
    approved: approvedTools.value.length,
    unapproved: unapprovedTools.value.length,
  }));

  /**
   * Get tools for a specific server
   */
  const getToolsForServer = computed(() => {
    return (serverName: ServerName) => {
      return tools.value
        .filter((tool) => tool.serverName === serverName)
        .sort((a, b) => a.originalToolName.localeCompare(b.originalToolName));
    };
  });

  /**
   * Get server by name
   */
  const getServerByName = computed(() => {
    return (serverName: ServerName) => {
      return servers.value.find((s) => s.name === serverName);
    };
  });

  /**
   * Get logs for a specific server
   */
  const getLogsForServer = computed(() => {
    return (serverName: ServerName) => {
      return logs.value.filter((log) => log.serverName === serverName);
    };
  });

  // ===== Event Handlers =====

  /**
   * Handle server state changes from service events
   */
  function handleServerStateChanged(serverName: ServerName, serverInfo: McpServerState): void {
    const index = servers.value.findIndex((s) => s.name === serverName);
    if (index !== -1) {
      servers.value[index] = serverInfo;
    } else {
      servers.value.push(serverInfo);
    }
  }

  /**
   * Handle server disconnection/removal from service events
   */
  function handleServerDisconnected(serverName: ServerName, errorMsg?: string): void {
    // If error message indicates removal, delete the server from state
    if (errorMsg === 'Server removed from configuration') {
      const index = servers.value.findIndex((s) => s.name === serverName);
      if (index !== -1) {
        servers.value.splice(index, 1);
      }
      // Also remove tools for this server
      tools.value = tools.value.filter((t) => t.serverName !== serverName);
    }
  }

  /**
   * Handle tools updated from service events.
   */
  function handleToolsUpdated(serverName: ServerName, updatedTools: McpTool[]): void {
    // Remove old tools for this server and add updated ones
    tools.value = [...tools.value.filter((t) => t.serverName !== serverName), ...updatedTools];
  }

  /**
   * Handle log added from service events
   */
  function handleLogAdded(log: McpLogEntry): void {
    logs.value.push(log);
    if (logs.value.length > MAX_LOGS) {
      logs.value = logs.value.slice(-MAX_LOGS);
    }
  }

  /**
   * Fetch and update config paths from the service
   */
  async function updateConfigPaths(): Promise<void> {
    try {
      const paths = await mcpService.getConfigPaths();
      workspaceConfigPath.value = paths.workspace;
      userConfigPath.value = paths.user;
    } catch {
      workspaceConfigPath.value = null;
      userConfigPath.value = null;
    }
  }

  // Watch workspace URI and update config paths when it changes
  watch(workspaceUri, async (newUri) => {
    if (newUri) {
      await updateConfigPaths();
    } else {
      // Clear config paths if no workspace
      workspaceConfigPath.value = null;
      userConfigPath.value = null;
    }
  });

  // ===== Actions =====

  /**
   * Initialize the store and service
   * @param workspaceUri - Optional workspace URI to initialize MCP servers
   */
  async function initialize(workspaceUriParam?: string): Promise<void> {
    try {
      // Initialize the service with workspace context
      await mcpService.initialize(workspaceUriParam);

      // Store the workspace URI for display
      if (workspaceUriParam) {
        workspaceUri.value = workspaceUriParam;
      } else {
        // Try to get it from the service
        try {
          const uri = await mcpService.getWorkspaceUri();
          workspaceUri.value = uri;
        } catch {
          // workspace URI is optional; workspaceUri.value stays null
        }
      }

      // Load config paths based on workspace URI
      await updateConfigPaths();

      // Register event listeners for real-time updates
      mcpService.on('server:state-changed', handleServerStateChanged);
      mcpService.on('server:connected', handleServerStateChanged);
      mcpService.on('server:disconnected', handleServerDisconnected);
      mcpService.on('tools:updated', handleToolsUpdated);
      mcpService.on('log:added', handleLogAdded);

      // Load initial data
      await loadData();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize MCP service';
    }
  }

  /**
   * Load servers and tools from the MCP service
   */
  async function loadData(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      const [serversData, toolsData, logsData] = await Promise.all([
        mcpService.getServers(),
        mcpService.getTools(),
        mcpService.getLogs(),
      ]);

      servers.value = serversData;
      tools.value = toolsData;
      logs.value = logsData;
      lastReloadTime.value = new Date();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load MCP data';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Reload servers (smart reload - only reconnects if config changed)
   */
  async function reloadServers(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      await mcpService.reloadServers();
      // Events will update the state automatically
      lastReloadTime.value = new Date();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to reload servers';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Restart a single server (force reconnect)
   */
  async function restartServer(serverName: ServerName): Promise<void> {
    error.value = null;

    try {
      await mcpService.restartServer(serverName);
      // Events will update the state automatically
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to restart server';
    }
  }

  /**
   * Execute a tool
   */
  async function executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const result = await mcpService.executeTool(toolName, args);

      // Refresh execution history
      executionHistory.value = await mcpService.getExecutionHistory();

      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to execute tool';
      return null;
    }
  }

  function scheduleErrorDismiss(): void {
    if (errorDismissTimer) clearTimeout(errorDismissTimer);
    errorDismissTimer = setTimeout(() => {
      error.value = null;
      errorDismissTimer = null;
    }, ERROR_DISMISS_MS);
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    if (errorDismissTimer) {
      clearTimeout(errorDismissTimer);
      errorDismissTimer = null;
    }
    error.value = null;
  }

  /**
   * Clear logs for a specific server
   */
  async function clearLogsForServer(serverName: ServerName): Promise<void> {
    logs.value = logs.value.filter((log) => log.serverName !== serverName);
    await mcpService.clearLogsForServer(serverName);
  }

  /**
   * Clear all logs
   */
  function clearAllLogs(): void {
    logs.value = [];
  }

  /**
   * Check if a config file is managed by our tooling
   */
  async function isManagedConfig(filePath: string): Promise<boolean> {
    try {
      return await mcpService.isManagedConfig(filePath);
    } catch {
      return false; // Default to false on error (safer to show warning)
    }
  }

  /**
   * Save server configuration
   */
  async function saveServer(
    serverName: ServerName,
    config: ServerConfig,
    targetFile: 'workspace' | 'user',
  ): Promise<void> {
    error.value = null;

    try {
      const result = await mcpService.saveServer(serverName, config, targetFile);

      if (!result.success) {
        error.value = result.error;
        throw new Error(result.error);
      }

      // Reload servers to pick up config changes and reconnect
      await reloadServers();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save server';
      error.value = errorMsg;
      throw err;
    }
  }

  /**
   * Delete server configuration
   */
  async function deleteServer(serverName: ServerName): Promise<void> {
    error.value = null;

    try {
      const result = await mcpService.deleteServer(serverName);

      if (!result.success) {
        error.value = result.error;
        throw new Error(result.error);
      }

      // Reload servers to pick up config changes
      await reloadServers();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete server';
      error.value = errorMsg;
      throw err;
    }
  }

  /**
   * Save pre-approved tools for a server.
   * Applies an optimistic update immediately, then awaits the backend result.
   * On failure, rolls back to the server's actual tool state in the same scope.
   */
  async function saveApprovedTools(
    serverName: ServerName,
    approvedToolNames: string[],
  ): Promise<void> {
    if (isSavingApprovedTools.value) return;
    isSavingApprovedTools.value = true;
    error.value = null;

    // Snapshot current tools so we can roll back on failure
    const previousTools = tools.value;

    // Optimistic update: reflect the change in the store immediately so the
    // UI feels instant without waiting for the backend round-trip + reload.
    tools.value = tools.value.map((t) => {
      if (t.serverName !== serverName) return t;
      return { ...t, isApproved: approvedToolNames.includes(t.originalToolName) };
    });

    try {
      const result = await mcpService.saveApprovedTools(serverName, approvedToolNames);

      if (!result.success) {
        // Roll back the optimistic update
        tools.value = previousTools;
        error.value = result.error;
        scheduleErrorDismiss();
      }
      // On success the backend reloads and tools:updated will reconcile final state
    } catch (err) {
      // Transport-level failure — roll back
      tools.value = previousTools;
      error.value = err instanceof Error ? err.message : 'Failed to save approved tools';
      scheduleErrorDismiss();
    } finally {
      isSavingApprovedTools.value = false;
    }
  }

  /**
   * Approve a server: persist the decision and start the session.
   * Applies an optimistic state update immediately.
   */
  async function approveServer(serverName: ServerName): Promise<void> {
    // Optimistic update
    const previousServers = servers.value;
    servers.value = servers.value.map((s) =>
      s.name === serverName ? { ...s, connectionState: ConnectionState.Connecting } : s,
    );

    try {
      const result = await mcpService.approveServer(serverName);
      if (!result.success) {
        servers.value = previousServers;
        error.value = result.error;
        scheduleErrorDismiss();
      }
      // On success, server:state-changed events will reconcile final state
    } catch (err) {
      servers.value = previousServers;
      error.value = err instanceof Error ? err.message : 'Failed to approve server';
      scheduleErrorDismiss();
    }
  }

  /**
   * Reject a server: persist the decision; session stays not-started.
   * Applies an optimistic state update immediately.
   */
  async function rejectServer(serverName: ServerName): Promise<void> {
    const previousServers = servers.value;
    servers.value = servers.value.map((s) =>
      s.name === serverName ? { ...s, connectionState: ConnectionState.Rejected } : s,
    );

    try {
      const result = await mcpService.rejectServer(serverName);
      if (!result.success) {
        servers.value = previousServers;
        error.value = result.error;
        scheduleErrorDismiss();
      }
    } catch (err) {
      servers.value = previousServers;
      error.value = err instanceof Error ? err.message : 'Failed to reject server';
      scheduleErrorDismiss();
    }
  }

  /**
   * Revoke a server's approval decision so the user is re-prompted on next reload.
   * Applies an optimistic state update to PendingApproval immediately.
   */
  async function revokeServerDecision(serverName: ServerName): Promise<void> {
    const previousServers = servers.value;
    servers.value = servers.value.map((s) =>
      s.name === serverName ? { ...s, connectionState: ConnectionState.PendingApproval } : s,
    );

    try {
      const result = await mcpService.revokeServerDecision(serverName);
      if (!result.success) {
        servers.value = previousServers;
        error.value = result.error;
        scheduleErrorDismiss();
      }
      // On success, server:state-changed events will reconcile final state
    } catch (err) {
      servers.value = previousServers;
      error.value = err instanceof Error ? err.message : 'Failed to revoke server decision';
      scheduleErrorDismiss();
    }
  }

  async function approveAllTools(serverName: ServerName): Promise<void> {
    const allToolNames = tools.value
      .filter((t) => t.serverName === serverName)
      .map((t) => t.originalToolName);

    await saveApprovedTools(serverName, allToolNames);
  }

  /**
   * Dispose of the store and clean up event listeners
   */
  function dispose(): void {
    mcpService.off('server:state-changed', handleServerStateChanged);
    mcpService.off('server:connected', handleServerStateChanged);
    mcpService.off('server:disconnected', handleServerDisconnected);
    mcpService.off('tools:updated', handleToolsUpdated);
    mcpService.off('log:added', handleLogAdded);
  }

  return {
    // State
    servers,
    tools,
    executionHistory,
    logs,
    isLoading,
    isSavingApprovedTools,
    error,
    lastReloadTime,
    workspaceUri,
    workspaceConfigPath,
    userConfigPath,

    // Computed
    connectedServers,
    disconnectedServers,
    failedServers,
    pendingServers,
    rejectedServers,
    approvedTools,
    unapprovedTools,
    serverStats,
    toolStats,
    getToolsForServer,
    getServerByName,
    getLogsForServer,

    // Actions
    initialize,
    loadData,
    reloadServers,
    restartServer,
    executeTool,
    clearError,
    clearLogsForServer,
    clearAllLogs,
    isManagedConfig,
    saveServer,
    deleteServer,
    saveApprovedTools,
    approveAllTools,
    approveServer,
    rejectServer,
    revokeServerDecision,
    dispose,
  };
});
