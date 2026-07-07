import { Logger } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { WebviewConnectionProvider } from '@gitlab-org/webview';
import { MessageBus } from '@gitlab-org/message-bus';
import { ConfigService } from '@gitlab-org/config';
import { URI } from 'vscode-uri';
import {
  McpManager,
  McpConfigWriter,
  getMcpConfigPathCandidates,
  ConnectionState,
  type ServerConfig,
  type McpServerState,
  type McpTool,
  type McpLogEntry,
  type ServerName,
} from '@gitlab-org/ai-configuration';
import { MCP_DASHBOARD_WEBVIEW_ID, type McpDashboardMessages } from '../contract';

type McpMessageBus = MessageBus<{
  inbound: McpDashboardMessages['fromWebview'];
  outbound: McpDashboardMessages['toWebview'];
}>;

/** Named handler bundle for a single webview connection, enabling cleanup on disconnect. */
type EventForwardingHandlers = {
  serverStateChanged: (serverName: ServerName, state: McpServerState) => void;
  serverConnected: (serverName: ServerName, info: McpServerState) => void;
  serverDisconnected: (serverName: ServerName, error?: string) => void;
  serverError: (serverName: ServerName, error: string) => void;
  toolsUpdated: (serverName: ServerName, tools: McpTool[]) => void;
  logAdded: (log: McpLogEntry) => void;
};

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [Logger, McpManager, WebviewConnectionProvider, ConfigService, McpConfigWriter],
  autoActivate: true,
})
export class McpDashboardService {
  #logger: Logger;

  #mcpManager: McpManager;

  #connectionProvider: WebviewConnectionProvider;

  #configService: ConfigService;

  #configWriter: McpConfigWriter;

  /** Handlers currently registered on #mcpManager, keyed by instanceId. */
  #forwardingHandlers: Map<string, EventForwardingHandlers> = new Map();

  constructor(
    logger: Logger,
    mcpManager: McpManager,
    connectionProvider: WebviewConnectionProvider,
    configService: ConfigService,
    configWriter: McpConfigWriter,
  ) {
    this.#logger = logger;
    this.#mcpManager = mcpManager;
    this.#connectionProvider = connectionProvider;
    this.#configService = configService;
    this.#configWriter = configWriter;

    this.#setupConnection();
  }

  #setupConnection(): void {
    const connection =
      this.#connectionProvider.getConnection<McpDashboardMessages>(MCP_DASHBOARD_WEBVIEW_ID);

    connection.onInstanceConnected((instanceId, messageBus) => {
      this.#logger.debug(`MCP Dashboard webview connected: ${instanceId}`);

      this.#teardownEventForwarding(instanceId);
      this.#setupEventForwarding(instanceId, messageBus);

      // ===== Handle Notifications from Webview =====

      messageBus.onRequest('appReady', async ({ workspaceUri }) => {
        // If workspace URI is provided, initialize MCP servers immediately.
        // This is a request (not a notification) so the webview awaits completion
        // before calling getServers, preventing a race where servers are still in
        // PendingApproval while reloadAllServers is consulting the approval store.
        if (workspaceUri) {
          try {
            // Convert URI to file system path
            const parsedUri = URI.parse(workspaceUri);
            const workspacePath = parsedUri.fsPath;

            if (!workspacePath) {
              this.#logger.error('Failed to convert workspace URI to file path', {
                workspaceUri,
                parsedUri,
              });
              return undefined;
            }

            this.#logger.info('Initializing MCP servers', { workspacePath });

            await this.#mcpManager.reloadAllServers(workspacePath);
          } catch (error) {
            this.#logger.error('Failed to initialize MCP servers on startup', error);
          }
        } else {
          this.#logger.debug('No workspace URI provided on startup');
        }

        return undefined;
      });

      messageBus.onNotification('reloadServers', async () => {
        this.#logger.info('Reloading MCP servers from configuration');
        try {
          await this.#mcpManager.reloadAllServers();
        } catch (error) {
          this.#logger.error('Failed to reload servers', error);
        }
      });

      messageBus.onNotification('restartAllServers', async () => {
        this.#logger.info('Restarting all MCP servers');
        try {
          await this.#mcpManager.restartAllServers();
        } catch (error) {
          this.#logger.error('Failed to restart all servers', error);
        }
      });

      messageBus.onNotification('restartServer', async (params) => {
        this.#logger.info(`Restarting MCP server: ${params.serverName}`);
        try {
          await this.#mcpManager.restartServer(params.serverName);
        } catch (error) {
          this.#logger.error(`Failed to restart server ${params.serverName}`, error);
        }
      });

      messageBus.onNotification('clearLogsForServer', async ({ serverName }) => {
        this.#logger.debug(`Clearing logs for server: ${serverName}`);
        try {
          await this.#mcpManager.clearLogsForServer(serverName);
        } catch (error) {
          this.#logger.error('Failed to clear logs', error);
        }
      });

      // ===== Handle Requests from Webview =====

      messageBus.onRequest('approveServer', async ({ serverName }) => {
        this.#logger.info(`Approving MCP server: ${serverName}`);
        try {
          await this.#mcpManager.approveServer(serverName);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to approve server "${serverName}"`, error);
          return { success: false, error: errorMsg };
        }
      });

      messageBus.onRequest('rejectServer', async ({ serverName }) => {
        this.#logger.info(`Rejecting MCP server: ${serverName}`);
        try {
          await this.#mcpManager.rejectServer(serverName);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to reject server "${serverName}"`, error);
          return { success: false, error: errorMsg };
        }
      });

      messageBus.onRequest('revokeServerDecision', async ({ serverName }) => {
        this.#logger.info(`Revoking decision for MCP server: ${serverName}`);
        try {
          await this.#mcpManager.revokeServerDecision(serverName);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to revoke decision for server "${serverName}"`, error);
          return { success: false, error: errorMsg };
        }
      });

      messageBus.onRequest('saveApprovedTools', async ({ serverName, approvedToolNames }) => {
        this.#logger.info(
          `Saving ${approvedToolNames.length} approved tools for server "${serverName}"`,
        );
        this.#logger.debug(`Approved tool names for "${serverName}":`, approvedToolNames);

        try {
          const server = await this.#mcpManager.getServer(serverName);

          if (!server) {
            const error = `Server "${serverName}" not found`;
            this.#logger.warn(`Cannot save approved tools: ${error}`);
            return { success: false, error };
          }

          if (!server.configSource) {
            const error = `Config source file is unknown for "${serverName}"`;
            this.#logger.error(`Cannot save approved tools: ${error}`);
            return { success: false, error };
          }

          if (!server.config) {
            const error = `Server "${serverName}" has no config`;
            this.#logger.error(`Cannot save approved tools: ${error}`);
            return { success: false, error };
          }

          // Build updated config with new approvedTools list, preserving all other fields.
          // CoreServerState.config is typed as `unknown`; guard before spreading to avoid
          // silently writing a broken config if it is ever malformed.
          if (
            typeof server.config !== 'object' ||
            server.config === null ||
            !('type' in server.config) ||
            typeof (server.config as Record<string, unknown>).type !== 'string'
          ) {
            const error = `Server "${serverName}" has an unrecognised config shape`;
            this.#logger.error(`Cannot save approved tools: ${error}`, {
              config: server.config,
            });
            return { success: false, error };
          }
          const updatedConfig: ServerConfig = {
            ...(server.config as ServerConfig),
            approvedTools: approvedToolNames,
          };

          const result = await this.#configWriter.upsertServer(
            server.configSource,
            serverName,
            updatedConfig,
          );

          if (result.isErr()) {
            this.#logger.error(`Failed to save approved tools for "${serverName}"`, result.error);
            return { success: false, error: result.error.message };
          }

          // Reload servers so McpManager re-reads the config and re-emits tools:updated
          // with fresh isApproved flags
          const workspaceUri = await this.#getWorkspaceUri();
          if (workspaceUri) {
            const workspacePath = URI.parse(workspaceUri).fsPath;
            await this.#mcpManager.reloadAllServers(workspacePath);
          }

          const configPaths = await this.#getConfigPaths();
          const targetFile: 'workspace' | 'user' =
            server.configSource === configPaths.user ? 'user' : 'workspace';
          messageBus.sendNotification('configurationSaved', {
            serverName,
            targetFile,
            timestamp: new Date(),
          });

          this.#logger.info(`Successfully saved approved tools for "${serverName}"`);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to save approved tools for "${serverName}"`, error);
          return { success: false, error: errorMsg };
        }
      });

      messageBus.onRequest('getWorkspaceUri', async () => {
        try {
          const workspaceFolders = this.#configService.get('workspaceFolders');

          // Return the first workspace folder URI if available
          // TODO: Support multiple workspaces - currently using first workspace only
          if (workspaceFolders && workspaceFolders.length > 0) {
            const firstWorkspace = workspaceFolders[0];

            if (workspaceFolders.length > 1) {
              this.#logger.info('Multiple workspaces detected, using first for MCP', {
                selected: firstWorkspace.name,
                total: workspaceFolders.length,
              });
            }

            return firstWorkspace.uri;
          }

          this.#logger.warn('No workspace folders available for MCP Dashboard');
          return null;
        } catch (error) {
          this.#logger.error('Failed to get workspace URI for MCP Dashboard', error);
          return null;
        }
      });

      messageBus.onRequest('getServers', async () => {
        try {
          return await this.#mcpManager.getServers();
        } catch (error) {
          this.#logger.error('Failed to get servers', error);
          return [];
        }
      });

      messageBus.onRequest('getServer', async ({ serverName }) => {
        try {
          return await this.#mcpManager.getServer(serverName);
        } catch (error) {
          this.#logger.error(`Failed to get server ${serverName}`, error);
          return null;
        }
      });

      messageBus.onRequest('getTools', async () => {
        try {
          return await this.#mcpManager.getTools();
        } catch (error) {
          this.#logger.error('Failed to get tools', error);
          return [];
        }
      });

      messageBus.onRequest('getToolsForServer', async ({ serverName }) => {
        try {
          return await this.#mcpManager.getToolsForServer(serverName);
        } catch (error) {
          this.#logger.error(`Failed to get tools for server ${serverName}`, error);
          return [];
        }
      });

      messageBus.onRequest('executeTool', async ({ toolName, args }) => {
        this.#logger.info(`Executing MCP tool: ${toolName}`);
        try {
          return await this.#mcpManager.executeTool(toolName, args);
        } catch (error) {
          this.#logger.error(`Failed to execute tool ${toolName}`, error);
          throw error;
        }
      });

      messageBus.onRequest('getExecutionHistory', async () => {
        try {
          return await this.#mcpManager.getExecutionHistory();
        } catch (error) {
          this.#logger.error('Failed to get execution history', error);
          return [];
        }
      });

      messageBus.onRequest('getLogs', async () => {
        try {
          return await this.#mcpManager.getLogs();
        } catch (error) {
          this.#logger.error('Failed to get logs', error);
          return [];
        }
      });

      messageBus.onRequest('getLogsForServer', async ({ serverName }) => {
        try {
          return await this.#mcpManager.getLogsForServer(serverName);
        } catch (error) {
          this.#logger.error(`Failed to get logs for server ${serverName}`, error);
          return [];
        }
      });

      messageBus.onRequest('getConfigPaths', async () => {
        try {
          const configPaths = await this.#getConfigPaths();
          return configPaths;
        } catch (error) {
          this.#logger.error('Failed to get config paths', error);
          return {
            workspace: null,
            user: null,
          };
        }
      });

      messageBus.onRequest('isManagedConfig', async ({ filePath }) => {
        try {
          const result = await this.#configWriter.isManagedConfig(filePath);
          if (result.isOk()) {
            return result.value;
          }
          this.#logger.warn(`Failed to check if ${filePath} is managed`, result.error);
          return false; // Default to false on error
        } catch (error) {
          this.#logger.error(`Error checking if ${filePath} is managed`, error);
          return false;
        }
      });

      messageBus.onRequest('saveServer', async ({ serverName, config, targetFile }) => {
        this.#logger.info(`Saving server "${serverName}" to ${targetFile} file`);

        try {
          // Get the appropriate file path
          const configPaths = await this.#getConfigPaths();
          const filePath = targetFile === 'workspace' ? configPaths.workspace : configPaths.user;

          if (!filePath) {
            const error = `Cannot save to ${targetFile} file: path not available`;
            this.#logger.error(error);
            messageBus.sendNotification('configurationSaveFailed', {
              serverName,
              error,
            });
            return { success: false, error };
          }

          // Write using McpConfigWriter
          // TODO: Make this non destructive
          const result = await this.#configWriter.upsertServer(filePath, serverName, config);

          if (result.isErr()) {
            const { error } = result;
            const errorMsg = error.message;

            // Extract error details from the error object
            // All McpConfigurationError types have code, timestamp, and filePath
            const details = {
              code: error.code,
              filePath: 'filePath' in error ? error.filePath : undefined,
              timestamp: error.timestamp,
              // Include cause if available (for read/write/parse errors)
              cause: 'cause' in error ? String(error.cause) : undefined,
              // Include validation issues if available (for validation errors)
              issues: 'issues' in error ? error.issues.format() : undefined,
            };

            this.#logger.error(`Failed to save server "${serverName}"`, error);
            messageBus.sendNotification('configurationSaveFailed', {
              serverName,
              error: errorMsg,
              details,
            });
            return { success: false, error: errorMsg, details };
          }

          // Reload configuration to pick up changes
          const workspaceUri = await this.#getWorkspaceUri();
          if (workspaceUri) {
            const workspacePath = URI.parse(workspaceUri).fsPath;
            await this.#mcpManager.reloadAllServers(workspacePath);
          }

          // Auto-approve servers saved via the Web UI so they connect immediately
          // without going through the pending-approval flow. Only call approveServer
          // when the server actually needs it (PendingApproval or Rejected) to avoid
          // a redundant state transition on already-connected servers.
          try {
            const savedServer = await this.#mcpManager.getServer(serverName);
            if (
              savedServer?.connectionState === ConnectionState.PendingApproval ||
              savedServer?.connectionState === ConnectionState.Rejected
            ) {
              await this.#mcpManager.approveServer(serverName);
            }
          } catch (approveError) {
            this.#logger.warn(
              `Failed to auto-approve server "${serverName}" after save — it may require manual approval`,
              approveError,
            );
          }

          // Send success notification
          messageBus.sendNotification('configurationSaved', {
            serverName,
            targetFile,
            timestamp: new Date(),
          });

          this.#logger.info(`Successfully saved server "${serverName}" to ${targetFile} file`);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to save server "${serverName}"`, error);
          messageBus.sendNotification('configurationSaveFailed', {
            serverName,
            error: errorMsg,
          });
          return { success: false, error: errorMsg };
        }
      });

      messageBus.onRequest('deleteServer', async ({ serverName }) => {
        this.#logger.info(`Deleting server "${serverName}"`);

        try {
          // Find which file the server is in
          const server = await this.#mcpManager.getServer(serverName);
          if (!server?.configSource) {
            const error = `Server "${serverName}" not found or source file unknown`;
            this.#logger.error(error);
            return { success: false, error };
          }

          // Delete using McpConfigWriter (preserves comments and formatting)
          const result = await this.#configWriter.deleteServer(server.configSource, serverName);

          if (result.isErr()) {
            const errorMsg = result.error.message;
            this.#logger.error(`Failed to delete server "${serverName}"`, result.error);
            return { success: false, error: errorMsg };
          }

          // Reload configuration to pick up changes
          const workspaceUri = await this.#getWorkspaceUri();
          if (workspaceUri) {
            const workspacePath = URI.parse(workspaceUri).fsPath;
            await this.#mcpManager.reloadAllServers(workspacePath);
          }

          this.#logger.info(`Successfully deleted server "${serverName}"`);
          return { success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.#logger.error(`Failed to delete server "${serverName}"`, error);
          return { success: false, error: errorMsg };
        }
      });

      // Return a Disposable so the framework (#handleDisconnected in webview_controller)
      // calls teardown on permanent disconnect — not just when the same instanceId reconnects.
      return { dispose: () => this.#teardownEventForwarding(instanceId) };
    });
  }

  /**
   * Set up event forwarding from manager service to webview.
   * Named handlers are stored so they can be removed when the webview disconnects,
   * preventing listener accumulation across reconnect cycles.
   */
  #setupEventForwarding(instanceId: string, messageBus: McpMessageBus): void {
    const handlers: EventForwardingHandlers = {
      serverStateChanged: (serverName, state) => {
        messageBus.sendNotification('serverStateChanged', { serverName, state });
      },
      serverConnected: (serverName, info) => {
        messageBus.sendNotification('serverConnected', { serverName, info });
      },
      serverDisconnected: (serverName, error) => {
        messageBus.sendNotification('serverDisconnected', { serverName, error });
      },
      serverError: (serverName, error) => {
        messageBus.sendNotification('serverError', { serverName, error });
      },
      toolsUpdated: (serverName, tools) => {
        messageBus.sendNotification('toolsUpdated', { serverName, tools });
      },
      logAdded: (log) => {
        messageBus.sendNotification('logAdded', log);
      },
    };

    this.#mcpManager.on('server:state-changed', handlers.serverStateChanged);
    this.#mcpManager.on('server:connected', handlers.serverConnected);
    this.#mcpManager.on('server:disconnected', handlers.serverDisconnected);
    this.#mcpManager.on('server:error', handlers.serverError);
    this.#mcpManager.on('tools:updated', handlers.toolsUpdated);
    this.#mcpManager.on('log:added', handlers.logAdded);

    this.#forwardingHandlers.set(instanceId, handlers);
  }

  /**
   * Remove event forwarding handlers for a given instance from #mcpManager.
   */
  #teardownEventForwarding(instanceId: string): void {
    const handlers = this.#forwardingHandlers.get(instanceId);
    if (!handlers) return;

    this.#mcpManager.off('server:state-changed', handlers.serverStateChanged);
    this.#mcpManager.off('server:connected', handlers.serverConnected);
    this.#mcpManager.off('server:disconnected', handlers.serverDisconnected);
    this.#mcpManager.off('server:error', handlers.serverError);
    this.#mcpManager.off('tools:updated', handlers.toolsUpdated);
    this.#mcpManager.off('log:added', handlers.logAdded);

    this.#forwardingHandlers.delete(instanceId);
  }

  /**
   * Helper to get workspace URI from config service
   */
  async #getWorkspaceUri(): Promise<string | null> {
    try {
      const workspaceFolders = this.#configService.get('workspaceFolders');

      if (workspaceFolders && workspaceFolders.length > 0) {
        return workspaceFolders[0].uri;
      }

      return null;
    } catch (error) {
      this.#logger.error('Failed to get workspace URI', error);
      return null;
    }
  }

  /**
   * Helper to get config file paths
   */
  async #getConfigPaths(): Promise<{ workspace: string | null; user: string | null }> {
    const workspaceUri = await this.#getWorkspaceUri();
    const workspacePath = workspaceUri ? URI.parse(workspaceUri).fsPath : null;

    if (!workspacePath) {
      return {
        workspace: null,
        user: null,
      };
    }

    const candidates = getMcpConfigPathCandidates(workspacePath);
    const workspaceConfigPath = candidates.find((c) => c.scope === 'workspace')?.path;
    const userConfigPath = candidates.find((c) => c.scope === 'user')?.path;

    return {
      workspace: workspaceConfigPath ?? null,
      user: userConfigPath ?? null,
    };
  }
}
