import { ResultAsync } from 'neverthrow';
import { createInterfaceId } from '@gitlab/needle';
import { OAuthFactoryError } from '../provider/errors';

export interface McpAuthCallbackUrlProvider {
  getCallbackUrl(): ResultAsync<URL, OAuthFactoryError>;
}

export const McpAuthCallbackUrlProvider =
  createInterfaceId<McpAuthCallbackUrlProvider>('AuthCallbackUrlProvider');
