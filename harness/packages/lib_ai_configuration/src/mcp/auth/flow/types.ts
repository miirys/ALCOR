import type { ResultAsync } from 'neverthrow';
import { createInterfaceId } from '@gitlab/needle';
import type { OAuthFinalizer, ServerName } from '../../types';
import type { AuthFlowError } from './errors';

export interface AuthFlowEvent {
  serverName: ServerName;
  authUrl: string;
  state: string;
}

export interface McpAuthFinalizerRegistry {
  registerAuthFinalizer(serverName: ServerName, finalizer: OAuthFinalizer): void;
  unregisterAuthFinalizer(serverName: ServerName): void;
  clearFinalizers(): void;
}

export interface McpAuthFlowController {
  startFlow(serverName: ServerName): string;
  completeFlow(state: string, code: string | null): ResultAsync<void, AuthFlowError>;
  clearFlows(): void;

  /**
   * Subscribe to auth flow started events
   */
  onAuthFlowStarted(handler: (event: AuthFlowEvent) => void): void;

  /**
   * Unsubscribe from auth flow started events
   */
  offAuthFlowStarted(handler: (event: AuthFlowEvent) => void): void;

  /**
   * Notify subscribers that an auth flow has started with an authorization URL
   * This should be called by the OAuth provider when redirecting to authorization
   */
  notifyAuthFlowStarted(serverName: ServerName, authUrl: string, state: string): void;
}

export const McpAuthFinalizerRegistry = createInterfaceId<McpAuthFinalizerRegistry>(
  'McpAuthFinalizerRegistry',
);
export const McpAuthFlowController =
  createInterfaceId<McpAuthFlowController>('McpAuthFlowController');
