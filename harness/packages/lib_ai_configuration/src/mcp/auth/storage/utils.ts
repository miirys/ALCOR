import { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { Token } from './types';

export function createStoredToken(tokens: OAuthTokens): Token {
  const now = Date.now();
  const expiresAt = tokens.expires_in ? now + tokens.expires_in * 1000 : undefined;

  return {
    access_token: tokens.access_token,
    token_type: tokens.token_type || 'Bearer',
    expires_at: expiresAt,
    refresh_token: tokens.refresh_token,
  };
}
