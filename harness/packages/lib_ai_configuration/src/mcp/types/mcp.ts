import { z } from 'zod';
import { ResultAsync } from 'neverthrow';
import { ErrorBase } from '../../core/error';
import { ServerConfig } from '../config';
import { ConnectionState, ServerVersionInfo } from '../client';
import { McpToolName } from './mcp_tool_name';

export type WorkflowId = string & {
  readonly __brand: 'WorkflowId';
};

export type ServerName = string & { readonly __brand: 'ServerName' };
export const ServerName = z
  .string()
  .min(1)
  .max(250)
  .regex(/^[a-zA-Z0-9_.-]+$/)
  .refine((val) => !/\s/.test(val))
  .transform((x) => x as ServerName);

export type McpServerInfo<TConfig extends ServerConfig = ServerConfig> = {
  name: ServerName;
  displayName: string;
  config: TConfig;
};

export interface OAuthFinalizer {
  finishAuth: (code: string | null) => ResultAsync<void, ErrorBase>;
}

/**
 * Tool information with approval state
 */
export interface McpTool {
  name: McpToolName; // Canonical name (serverName_toolName)
  originalToolName: string; // Original tool name from server
  serverName: ServerName;
  description: string;
  inputSchema: string; // JSON stringified schema
  isApproved: boolean;
}

export interface CoreServerState {
  name: ServerName;
  connectionState: ConnectionState;
  config?: unknown;
  connectedAt?: Date;
  error?: string;
  authUrl?: string;
  serverInfo?: ServerVersionInfo;
}

/**
 * Server state with connection and metadata information
 */
export interface McpServerState extends CoreServerState {
  displayName: string;
  configSource?: string; // Path to the config file where this server was defined
  /** Whether the server was defined in the workspace or user config file. */
  scope: 'workspace' | 'user';
}

/**
 * Log levels for MCP server logs
 */
export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

/**
 * Log entry from MCP servers
 */
export interface McpLogEntry {
  id: string;
  serverName: ServerName;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  executedAt: Date;
}

/**
 * Events that the MCP controller can emit
 */
export interface McpEvents {
  'server:state-changed': (serverName: ServerName, state: McpServerState) => void;
  'server:connected': (serverName: ServerName, info: McpServerState) => void;
  'server:disconnected': (serverName: ServerName, error?: string) => void;
  'server:error': (serverName: ServerName, error: string) => void;
  'tools:updated': (serverName: ServerName, tools: McpTool[]) => void;
  'log:added': (log: McpLogEntry) => void;
  /** Emitted after reloadAllServers when one or more servers are awaiting user approval. */
  'servers:pending-approval': (serverNames: ServerName[]) => void;
}
