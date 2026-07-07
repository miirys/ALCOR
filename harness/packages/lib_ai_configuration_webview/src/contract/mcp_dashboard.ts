/**
 * MCP Dashboard Contract
 * Shared types and message definitions between frontend and backend
 *
 * Re-exports types from @gitlab-org/ai-configuration to maintain
 * a single source of truth for MCP types.
 */

import type {
  McpLogEntry,
  McpServerState,
  McpTool,
  ServerName,
  ServerConfig,
  ToolExecutionResult,
  McpToolAddress,
} from '@gitlab-org/ai-configuration';
import type { WebviewId, CreateWebviewMessages } from '@gitlab-org/webview-plugin';

// ===== Re-export Core Types from lib_ai_configuration =====

export type {
  ServerName,
  ServerConfig,
  StdioServerConfig,
  SseServerConfig,
  StreamableHttpServerConfig,
  McpServerState,
  McpTool,
  McpLogEntry,
  ToolExecutionResult,
  McpServerInfo,
} from '@gitlab-org/ai-configuration';

export enum ConnectionState {
  Connecting = 'connecting',
  Authenticating = 'authenticating',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Failed = 'failed',
  PendingApproval = 'pendingApproval',
  Rejected = 'rejected',
}

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

/**
 * Structured error details for configuration operations
 */
export type ConfigErrorDetails = {
  /** Error code identifying the type of error */
  code: string;
  /** Path to the configuration file that failed */
  filePath?: string;
  /** Timestamp when the error occurred */
  timestamp?: string;
  /** Underlying cause of the error (for read/write/parse errors) */
  cause?: string;
  /** Validation issues (for validation errors) */
  issues?: unknown;
};

// ===== Webview Identifier =====

export const MCP_DASHBOARD_WEBVIEW_ID = 'root/mcp' as WebviewId<McpDashboardMessages>;

// ===== Message Definitions =====

/**
 * Message contract for MCP Dashboard webview
 * Uses WebviewConnectionProvider pattern (not plugin-based)
 */
export type McpDashboardMessages = CreateWebviewMessages<{
  // Frontend → Backend (Webview sends to extension)
  fromWebview: {
    notifications: {
      /**
       * Request to reload all MCP servers (smart reload - only reconnects if config changed)
       */
      reloadServers: undefined;

      /**
       * Request to reload a specific server (smart reload - only reconnects if needed)
       */
      reloadServer: {
        serverName: ServerName;
      };

      /**
       * Force restart all MCP servers (always reconnects)
       */
      restartAllServers: undefined;

      /**
       * Force restart a specific server (always reconnects)
       */
      restartServer: {
        serverName: ServerName;
      };

      /**
       * Start authentication flow for a server
       */
      startAuthentication: {
        serverName: ServerName;
      };

      /**
       * Approve a tool for the current session
       */
      approveTool: {
        serverName: ServerName;
        toolName: string;
      };

      /**
       * Clear logs for a specific server
       */
      clearLogsForServer: {
        serverName: ServerName;
      };
    };

    requests: {
      /**
       * Notify backend that webview is ready and trigger initial server load.
       * Using a request (not notification) so the webview can await completion
       * of reloadAllServers before fetching server state, avoiding a race where
       * getServers returns stale PendingApproval states for already-approved servers.
       * @param workspaceUri - Optional workspace URI to initialize MCP servers
       */
      appReady: {
        params: { workspaceUri?: string };
        result: undefined;
      };

      /**
       * Get the current workspace URI
       */
      getWorkspaceUri: {
        params: undefined;
        result: string | null;
      };

      /**
       * Get available config file paths
       */
      getConfigPaths: {
        params: undefined;
        result: {
          workspace: string | null;
          user: string | null;
        };
      };

      /**
       * Check if a config file is managed by our tooling
       */
      isManagedConfig: {
        params: {
          filePath: string;
        };
        result: boolean;
      };

      /**
       * Save server configuration to specified file
       */
      saveServer: {
        params: {
          serverName: ServerName;
          config: ServerConfig;
          targetFile: 'workspace' | 'user';
        };
        result: { success: true } | { success: false; error: string; details?: ConfigErrorDetails };
      };

      /**
       * Delete server from its source file
       */
      deleteServer: {
        params: {
          serverName: ServerName;
        };
        result: { success: true } | { success: false; error: string };
      };

      /**
       * Save pre-approved tools configuration for a server
       */
      saveApprovedTools: {
        params: {
          serverName: ServerName;
          approvedToolNames: string[];
        };
        result: { success: true } | { success: false; error: string };
      };

      /**
       * Approve a server (persist decision and start the session)
       */
      approveServer: {
        params: { serverName: ServerName };
        result: { success: true } | { success: false; error: string };
      };

      /**
       * Reject a server (persist decision; session stays not-started)
       */
      rejectServer: {
        params: { serverName: ServerName };
        result: { success: true } | { success: false; error: string };
      };

      /**
       * Revoke a server's approval decision so the user is re-prompted on next reload
       */
      revokeServerDecision: {
        params: { serverName: ServerName };
        result: { success: true } | { success: false; error: string };
      };

      /**
       * Get all configured servers
       */
      getServers: {
        params: undefined;
        result: McpServerState[];
      };

      /**
       * Get a specific server by name
       */
      getServer: {
        params: { serverName: ServerName };
        result: McpServerState | null;
      };

      /**
       * Get all tools from all servers
       */
      getTools: {
        params: undefined;
        result: McpTool[];
      };

      /**
       * Get tools for a specific server
       */
      getToolsForServer: {
        params: { serverName: ServerName };
        result: McpTool[];
      };

      /**
       * Execute a tool
       */
      executeTool: {
        params: {
          toolName: string;
          args: Record<string, unknown>;
        };
        result: string;
      };

      /**
       * Get tool execution history
       */
      getExecutionHistory: {
        params: undefined;
        result: ToolExecutionResult[];
      };

      /**
       * Get all logs
       */
      getLogs: {
        params: undefined;
        result: McpLogEntry[];
      };

      /**
       * Get logs for a specific server
       */
      getLogsForServer: {
        params: { serverName: ServerName };
        result: McpLogEntry[];
      };
    };
  };

  // Backend → Frontend (Extension sends to webview)
  toWebview: {
    notifications: {
      /**
       * Server state changed (connecting, connected, failed, etc.)
       */
      serverStateChanged: {
        serverName: ServerName;
        state: McpServerState;
      };

      /**
       * Server successfully connected
       */
      serverConnected: {
        serverName: ServerName;
        info: McpServerState;
      };

      /**
       * Server disconnected
       */
      serverDisconnected: {
        serverName: ServerName;
        error?: string;
      };

      /**
       * Server error occurred
       */
      serverError: {
        serverName: ServerName;
        error: string;
      };

      /**
       * Tools updated for a server
       */
      toolsUpdated: {
        serverName: ServerName;
        tools: McpTool[];
      };

      /**
       * New log entry added
       */
      logAdded: McpLogEntry;

      /**
       * Initial state sent when webview connects
       */
      initialState: {
        servers: McpServerState[];
        tools: McpTool[];
        logs: McpLogEntry[];
      };

      /**
       * Configuration saved successfully
       */
      configurationSaved: {
        serverName: ServerName;
        targetFile: 'workspace' | 'user';
        timestamp: Date;
      };

      /**
       * Configuration save failed
       */
      configurationSaveFailed: {
        serverName: ServerName;
        error: string;
        details?: ConfigErrorDetails;
      };
    };

    requests: {};
  };
}>;

// ===== Type Helpers =====

/**
 * Helper to get notification types from webview to backend
 */
export type FromWebviewNotification = keyof McpDashboardMessages['fromWebview']['notifications'];

/**
 * Helper to get notification types from backend to webview
 */
export type ToWebviewNotification = keyof McpDashboardMessages['toWebview']['notifications'];

/**
 * Helper to get request types from webview to backend
 */
export type FromWebviewRequest = keyof McpDashboardMessages['fromWebview']['requests'];

export type McpToolName = string & { __brand: 'McpToolName' };
export const McpToolName = {
  /** Create canonical tool name from its address */
  create: (address: McpToolAddress): McpToolName =>
    `${address.serverName}_${address.toolName}` as McpToolName,
  /** Parse canonical tool name back into its address */
  parse: (toolName: McpToolName): McpToolAddress => {
    const s = String(toolName);
    const pivot = s.lastIndexOf('_');
    if (pivot < 0 || pivot === 0 || pivot === s.length - 1) {
      throw new Error(`Invalid McpToolName: "${s}"`);
    }

    const serverName = s.slice(0, pivot) as ServerName;
    const tool = s.slice(pivot + 1);

    return { serverName, toolName: tool };
  },
  /** Type guard for string that look like a cononical tool name */
  is(value: string): value is McpToolName {
    const idx = value.lastIndexOf('_');
    return idx > 0 && idx < value.length - 1;
  },
};
