import { ResultAsync, errAsync } from 'neverthrow';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { TransportProvider } from '../transport/provider';
import { McpError } from '../errors';
import type { ServerName } from '../../types';

interface OAuthCapableTransport extends Transport {
  finishAuth(code: string): Promise<void>;
}

function isOAuthCapable(transport: Transport): transport is OAuthCapableTransport {
  return 'finishAuth' in transport && typeof transport.finishAuth === 'function';
}

/**
 * Complete OAuth authentication flow and create new transport.
 *
 * This utility handles the OAuth authentication sequence:
 * 1. Validates the authorization code (null indicates timeout)
 * 2. Verifies transport supports OAuth (has finishAuth method)
 * 3. Completes OAuth handshake with current transport
 * 4. Creates new authenticated transport via provider
 *
 * @param serverName - Server being authenticated
 * @param currentTransport - Transport that initiated OAuth flow
 * @param code - OAuth authorization code from callback (null = timeout)
 * @param transportProvider - Provider to create new transport instance
 * @returns New transport ready to connect, or error
 *
 * @remarks
 * The returned transport is NOT yet connected to the SDK client.
 * Caller is responsible for:
 * - Connecting the new transport via Client.connect()
 * - Disposing the old transport
 * - Updating connection state
 * - Setting up connection monitoring
 */
export function finishOAuthFlow(
  serverName: ServerName,
  currentTransport: Transport,
  code: string | null,
  transportProvider: TransportProvider,
): ResultAsync<Transport, McpError> {
  // 1. Handle timeout case
  if (code === null) {
    return errAsync(McpError.authFailed(serverName, 'Authentication timeout'));
  }

  // 2. Validate transport capability
  if (!isOAuthCapable(currentTransport)) {
    return errAsync(
      McpError.transportCreationFailed(
        serverName,
        'oauth',
        'Transport does not support OAuth authentication',
      ),
    );
  }

  // 3. Complete OAuth with current transport
  return (
    ResultAsync.fromPromise(currentTransport.finishAuth(code), (error) =>
      McpError.authFailed(serverName, error),
    )
      // 4. Create new authenticated transport
      .andThen(() =>
        transportProvider
          .create()
          .mapErr((e) => McpError.transportCreationFailed(serverName, 'oauth-refresh', e)),
      )
  );
}
