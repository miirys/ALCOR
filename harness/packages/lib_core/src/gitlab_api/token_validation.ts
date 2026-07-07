import { RESTError } from './errors';
import type { GetRequest, SimpleApiClient, TokenInfo } from './types';

const REQUIRED_SCOPES = ['ai_features', 'read_api', 'api'];

export interface PersonalAccessToken {
  scopes: string[];
}

export interface OAuthTokenInfoResponse {
  scope: string[];
}

export type ValidTokenCheckResponse = {
  valid: true;
  tokenInfo: TokenInfo;
};

export type InvalidTokenCheckResponse = {
  valid: false;
  reason: 'unknown' | 'invalid_token' | 'invalid_scopes';
  message: string;
};

export type TokenCheckResponse = ValidTokenCheckResponse | InvalidTokenCheckResponse;

const handleTokenCheckError = (e: unknown): InvalidTokenCheckResponse => {
  if (!(e instanceof RESTError) || !e.isInvalidTokenOrInvalidRefresh()) {
    return { valid: false, reason: 'unknown', message: `Token validation failed: ${e}` };
  }
  return { valid: false, reason: 'invalid_token', message: 'Token is invalid or expired.' };
};

const validateScopes = (scopes: string[]): InvalidTokenCheckResponse | undefined => {
  if (REQUIRED_SCOPES.some((scope) => scopes.includes(scope))) return undefined;

  const joinedScopes = scopes.map((scope) => `'${scope}'`).join(', ');

  return {
    valid: false,
    reason: 'invalid_scopes',
    message: `Token has scope(s) ${joinedScopes} (needs one of: ${REQUIRED_SCOPES.join(', ')}).`,
  };
};

async function checkPatToken(
  simpleClient: SimpleApiClient,
  token: string,
): Promise<TokenCheckResponse> {
  const request: GetRequest<PersonalAccessToken> = {
    type: 'rest',
    method: 'GET',
    path: '/api/v4/personal_access_tokens/self',
  };
  const { scopes } = await simpleClient.fetchFromApi(request);

  const scopeValidationError = validateScopes(scopes);
  if (scopeValidationError) return scopeValidationError;

  return { valid: true, tokenInfo: { scopes, type: 'pat', token } };
}

async function checkOAuthToken(
  simpleClient: SimpleApiClient,
  token: string,
): Promise<TokenCheckResponse> {
  const request: GetRequest<OAuthTokenInfoResponse> = {
    type: 'rest',
    method: 'GET',
    path: '/oauth/token/info',
  };

  const { scope: scopes } = await simpleClient.fetchFromApi(request);
  const scopeValidationError = validateScopes(scopes);
  if (scopeValidationError) return scopeValidationError;

  return { valid: true, tokenInfo: { scopes, type: 'oauth', token } };
}

export async function checkToken(
  simpleClient: SimpleApiClient,
  token: string,
  tokenType?: 'pat' | 'oauth',
): Promise<TokenCheckResponse> {
  if (!token) return { valid: false, message: 'No token provided', reason: 'invalid_token' };

  if (tokenType === 'pat') {
    return checkPatToken(simpleClient, token).catch(handleTokenCheckError);
  }

  if (tokenType === 'oauth') {
    return checkOAuthToken(simpleClient, token).catch(handleTokenCheckError);
  }

  const responses = await Promise.all([
    checkPatToken(simpleClient, token).catch(handleTokenCheckError),
    checkOAuthToken(simpleClient, token).catch(handleTokenCheckError),
  ]);

  const validResponse = responses.find((r) => r.valid);
  if (validResponse) return validResponse;

  const invalidResponses = responses.filter((r): r is InvalidTokenCheckResponse => !r.valid);

  const invalidScopeError = invalidResponses.find((r) => r.reason === 'invalid_scopes');
  if (invalidScopeError) return invalidScopeError;

  const invalidTokenError = invalidResponses.find((r) => r.reason === 'invalid_token');
  if (invalidTokenError) return invalidTokenError;

  return responses[0];
}
