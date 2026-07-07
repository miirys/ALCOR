import type { ServerConfig } from '@gitlab-org/ai-configuration-webview/contract';

// ===== Re-export all contract types =====

export { ConnectionState, LogLevel } from '@gitlab-org/ai-configuration-webview/contract';
export type {
  ServerName,
  ServerConfig,
  StdioServerConfig,
  SseServerConfig,
  StreamableHttpServerConfig,
  McpServerInfo,
  McpServerState,
  McpTool,
  McpLogEntry,
  ToolExecutionResult,
  ConfigErrorDetails,
} from '@gitlab-org/ai-configuration-webview/contract';

// ===== UI-Specific Utility Functions =====

export function isServerConfig(config: unknown): config is ServerConfig {
  return typeof config === 'object' && config !== null && 'type' in config;
}

/**
 * Type guard for stdio config
 */
export function isStdioConfig(
  config: ServerConfig,
): config is Extract<ServerConfig, { type: 'stdio' }> {
  return config.type === 'stdio';
}

/**
 * Type guard for SSE config
 */
export function isSseConfig(
  config: ServerConfig,
): config is Extract<ServerConfig, { type: 'sse' }> {
  return config.type === 'sse';
}

/**
 * Type guard for HTTP config
 */
export function isHttpConfig(
  config: ServerConfig,
): config is Extract<ServerConfig, { type: 'http' }> {
  return config.type === 'http';
}
