import { type ErrorBase, createError } from '../../core/error';

// Connection & Authentication Errors
type ConnectionFailedError = ErrorBase<
  'MCP_CONNECTION_FAILED',
  { serverName: string; cause?: unknown }
>;

type AuthenticationRequiredError = ErrorBase<
  'MCP_AUTH_REQUIRED',
  { serverName: string; authUrl?: string }
>;

type AuthenticationFailedError = ErrorBase<
  'MCP_AUTH_FAILED',
  { serverName: string; cause?: unknown }
>;

// State & Lifecycle Errors
type ClientNotConnectedError = ErrorBase<
  'MCP_CLIENT_NOT_CONNECTED',
  { serverName: string; currentState: string }
>;

type ClientDisposedError = ErrorBase<'MCP_CLIENT_DISPOSED', { serverName: string }>;

// Operation Errors
type ToolExecutionError = ErrorBase<
  'MCP_TOOL_EXECUTION_FAILED',
  { serverName: string; toolName: string; cause?: unknown }
>;

type ListToolsError = ErrorBase<'MCP_LIST_TOOLS_FAILED', { serverName: string; cause?: unknown }>;

type ServerVersionUnavailableError = ErrorBase<
  'MCP_SERVER_VERSION_UNAVAILABLE',
  { serverName: string }
>;

// Transport Errors
type TransportCreationError = ErrorBase<
  'MCP_TRANSPORT_CREATION_FAILED',
  { serverName: string; transportType: string; cause?: unknown }
>;

const formatCauseValue = (value?: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'text' in value) {
    const textValue = (value as { text?: unknown }).text;
    if (typeof textValue === 'string' && textValue.trim()) {
      return textValue;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatErrorCause = (cause?: unknown): string | null => {
  if (Array.isArray(cause)) {
    const fragments = cause
      .map((entry) => formatCauseValue(entry))
      .filter((entry): entry is string => Boolean(entry?.trim()));

    return fragments.length > 0 ? fragments.join(' ') : null;
  }

  return formatCauseValue(cause);
};

const withOptionalCause = (baseMessage: string, cause?: unknown): string => {
  const formattedCause = formatErrorCause(cause);

  if (!formattedCause) {
    return baseMessage;
  }

  return `${baseMessage}. Cause: ${formattedCause}`;
};

export type McpError =
  | ConnectionFailedError
  | AuthenticationRequiredError
  | AuthenticationFailedError
  | ClientNotConnectedError
  | ClientDisposedError
  | ToolExecutionError
  | ListToolsError
  | ServerVersionUnavailableError
  | TransportCreationError;

export const McpError = {
  connectionFailed: (serverName: string, cause?: unknown): ConnectionFailedError =>
    createError('MCP_CONNECTION_FAILED', `Failed to connect to MCP server: ${serverName}`, {
      serverName,
      cause,
    }),

  authRequired: (serverName: string, authUrl?: string): AuthenticationRequiredError =>
    createError('MCP_AUTH_REQUIRED', `Authentication required for MCP server: ${serverName}`, {
      serverName,
      authUrl,
    }),

  authFailed: (serverName: string, cause?: unknown): AuthenticationFailedError =>
    createError('MCP_AUTH_FAILED', `Authentication failed for MCP server: ${serverName}`, {
      serverName,
      cause,
    }),

  clientNotConnected: (serverName: string, currentState: string): ClientNotConnectedError =>
    createError(
      'MCP_CLIENT_NOT_CONNECTED',
      `Client ${serverName} is not connected (state: ${currentState})`,
      { serverName, currentState },
    ),

  clientDisposed: (serverName: string): ClientDisposedError =>
    createError('MCP_CLIENT_DISPOSED', `Client ${serverName} is disposed`, { serverName }),

  toolExecutionFailed: (
    serverName: string,
    toolName: string,
    cause?: unknown,
  ): ToolExecutionError =>
    createError(
      'MCP_TOOL_EXECUTION_FAILED',
      withOptionalCause(`Failed to execute tool ${toolName} on server ${serverName}`, cause),
      { serverName, toolName, cause },
    ),

  listToolsFailed: (serverName: string, cause?: unknown): ListToolsError =>
    createError('MCP_LIST_TOOLS_FAILED', `Failed to list tools for server ${serverName}`, {
      serverName,
      cause,
    }),

  serverVersionUnavailable: (serverName: string): ServerVersionUnavailableError =>
    createError(
      'MCP_SERVER_VERSION_UNAVAILABLE',
      `Server version information is not available for ${serverName}`,
      { serverName },
    ),

  transportCreationFailed: (
    serverName: string,
    transportType: string,
    cause?: unknown,
  ): TransportCreationError =>
    createError(
      'MCP_TRANSPORT_CREATION_FAILED',
      `Failed to create ${transportType} transport for server ${serverName}`,
      { serverName, transportType, cause },
    ),
};
