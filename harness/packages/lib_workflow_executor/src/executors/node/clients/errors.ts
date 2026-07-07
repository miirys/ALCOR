import { WorkflowStatusCode } from '@gitlab-lsp/workflow-api';

export class WebsocketStreamError extends Error {
  code?: number;

  reason?: string;

  constructor(message?: string, code?: number, reason?: string) {
    super(message);
    this.name = 'WebsocketStreamError';
    this.code = code;
    this.reason = reason;
  }
}

export function mapClientErrorToUserFacingStatusCode(error: unknown): WorkflowStatusCode {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('USAGE_QUOTA_EXCEEDED')) {
    return WorkflowStatusCode.USAGE_QUOTA_EXCEEDED;
  }

  // This tends to happen when using corporate proxies, URL filtering, or other endpoint
  // software that inspects TLS traffic due to using a self-signed or custom certificate
  // authority.
  if (errorMessage.includes('unable to verify the first certificate')) {
    return WorkflowStatusCode.MISSING_CERTIFICATE_SETTINGS;
  }

  if (error instanceof WebsocketStreamError) {
    // Map certain known websocket failure codes to more specific user-facing errors
    // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code

    // eslint-disable-next-line default-case
    switch (error.code) {
      // HTTP statuses from a rejected upgrade handshake (`unexpected-response`).
      // These don't collide with the WebSocket close codes (1000-1015) below.
      case 401: // Unauthorized
      case 403: // Forbidden
      case 407: // Proxy Authentication Required
        return WorkflowStatusCode.AUTH_TOKEN_ERROR;
      case 1003: // Unsupported Data
      case 1007: // Invalid frame payload data
        return WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE; // should be impossible since we send only text content
      case 1006: // Abnormal Closure
        return WorkflowStatusCode.SERVICE_CONNECTION_DROPPED;
      case 1008: // Usage cutoff
        return WorkflowStatusCode.USAGE_QUOTA_EXCEEDED;
      case 1009: // Message Too Big
        return WorkflowStatusCode.SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG; // should be impossible since we validate payload size already
      case 1011: // Internal Error
        return WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR;
      case 1013: // Flow is active already and locked
        return WorkflowStatusCode.LOCKED_SOCKET;
      case 1014: // Bad Gateway
        return WorkflowStatusCode.SERVICE_CONNECTION_BAD_GATEWAY;
      case 1015: // TLS handshake
        return WorkflowStatusCode.SERVICE_CONNECTION_TLS_HANDSHAKE;
    }
  }

  return WorkflowStatusCode.GENERAL_FAILURE;
}
