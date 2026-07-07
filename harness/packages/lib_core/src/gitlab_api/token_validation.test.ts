import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import {
  checkToken,
  InvalidTokenCheckResponse,
  OAuthTokenInfoResponse,
  PersonalAccessToken,
  ValidTokenCheckResponse,
} from './token_validation';
import { RESTError } from './errors';
import type { GetRequest, SimpleApiClient } from './types';

describe('checkToken', () => {
  const token = 'glpat-1234';

  const patRequest: GetRequest<PersonalAccessToken> = {
    type: 'rest',
    method: 'GET',
    path: '/api/v4/personal_access_tokens/self',
  };

  const oauthRequest: GetRequest<OAuthTokenInfoResponse> = {
    type: 'rest',
    method: 'GET',
    path: '/oauth/token/info',
  };

  it('returns early for empty token without making API calls', async () => {
    const mockClient = createFakePartial<SimpleApiClient>({
      fetchFromApi: jest.fn(),
    });

    const result = await checkToken(mockClient, '');

    expect(result).toEqual({
      valid: false,
      message: 'No token provided',
      reason: 'invalid_token',
    });
    expect(mockClient.fetchFromApi).not.toHaveBeenCalled();
  });

  it.each`
    tokenType                  | responseData                   | tokenType  | scope
    ${'Personal Access Token'} | ${{ scopes: ['api'] }}         | ${'pat'}   | ${'api'}
    ${'OAuth Access Token'}    | ${{ scope: ['api'] }}          | ${'oauth'} | ${'api'}
    ${'Personal Access Token'} | ${{ scopes: ['ai_features'] }} | ${'pat'}   | ${'ai_features'}
    ${'Personal Access Token'} | ${{ scopes: ['read_api'] }}    | ${'pat'}   | ${'read_api'}
    ${'OAuth Access Token'}    | ${{ scope: ['ai_features'] }}  | ${'oauth'} | ${'ai_features'}
    ${'OAuth Access Token'}    | ${{ scope: ['read_api'] }}     | ${'oauth'} | ${'read_api'}
  `(
    'should return valid response for $tokenType with $scope scope',
    async ({ responseData, tokenType, scope }) => {
      const mockClient = createFakePartial<SimpleApiClient>({
        fetchFromApi: jest.fn().mockResolvedValue(responseData),
      });

      const testResult = await checkToken(mockClient, token);

      expect(testResult).toEqual({
        valid: true,
        tokenInfo: { type: tokenType, scopes: [scope], token },
      } satisfies ValidTokenCheckResponse);
    },
  );

  it.each`
    tokenType                  | responseData
    ${'Personal Access Token'} | ${{ scopes: ['read-user'] }}
    ${'OAuth Access Token'}    | ${{ scope: ['read-user'] }}
  `('handles insufficient token scope for $tokenType', async ({ responseData }) => {
    const mockClient = createFakePartial<SimpleApiClient>({
      fetchFromApi: jest.fn().mockResolvedValue(responseData),
    });

    const testResult = await checkToken(mockClient, token);

    expect(testResult).toEqual({
      valid: false,
      reason: 'invalid_scopes',
      message: "Token has scope(s) 'read-user' (needs one of: ai_features, read_api, api).",
    } satisfies InvalidTokenCheckResponse);
  });

  it.each`
    tokenType                  | request
    ${'Personal Access Token'} | ${patRequest}
    ${'OAuth Access Token'}    | ${oauthRequest}
  `('handles invalid token for $tokenType', async ({ request }) => {
    const restError = new RESTError(
      request,
      createFakeResponse({ status: 401 }),
      'token validation',
      '{"error": "invalid_token"}',
    );

    const mockClient = createFakePartial<SimpleApiClient>({
      fetchFromApi: jest.fn().mockRejectedValue(restError),
    });

    const testResult = await checkToken(mockClient, token);

    expect(testResult).toEqual({
      valid: false,
      reason: 'invalid_token',
      message: 'Token is invalid or expired.',
    } satisfies InvalidTokenCheckResponse);
  });

  describe('when tokenType is provided', () => {
    describe('when tokenType is pat', () => {
      it('only calls PAT endpoint and returns valid response', async () => {
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockResolvedValue({ scopes: ['api'] }),
        });

        const result = await checkToken(mockClient, token, 'pat');

        expect(result).toEqual({
          valid: true,
          tokenInfo: { type: 'pat', scopes: ['api'], token },
        } satisfies ValidTokenCheckResponse);
        expect(mockClient.fetchFromApi).toHaveBeenCalledTimes(1);
        expect(mockClient.fetchFromApi).toHaveBeenCalledWith(patRequest);
      });

      it('handles an invalid response', async () => {
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockResolvedValue({ scopes: ['manage_runner'] }),
        });

        const result = await checkToken(mockClient, token, 'pat');

        expect(result).toEqual({
          valid: false,
          reason: 'invalid_scopes',
          message: "Token has scope(s) 'manage_runner' (needs one of: ai_features, read_api, api).",
        } satisfies InvalidTokenCheckResponse);
      });

      it('handles error from PAT endpoint', async () => {
        const restError = new RESTError(
          patRequest,
          createFakeResponse({ status: 401 }),
          'token validation',
          '{"error": "invalid_token"}',
        );
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockRejectedValue(restError),
        });

        const result = await checkToken(mockClient, token, 'pat');

        expect(result).toEqual({
          valid: false,
          reason: 'invalid_token',
          message: 'Token is invalid or expired.',
        } satisfies InvalidTokenCheckResponse);
        expect(mockClient.fetchFromApi).toHaveBeenCalledTimes(1);
      });
    });

    describe('when tokenType is oauth', () => {
      it('only calls OAuth endpoint and returns valid response', async () => {
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockResolvedValue({ scope: ['api'] }),
        });

        const result = await checkToken(mockClient, token, 'oauth');

        expect(result).toEqual({
          valid: true,
          tokenInfo: { type: 'oauth', scopes: ['api'], token },
        } satisfies ValidTokenCheckResponse);
        expect(mockClient.fetchFromApi).toHaveBeenCalledTimes(1);
        expect(mockClient.fetchFromApi).toHaveBeenCalledWith(oauthRequest);
      });

      it('handles an invalid response', async () => {
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockResolvedValue({ scope: ['manage_runner'] }),
        });

        const result = await checkToken(mockClient, token, 'oauth');

        expect(result).toEqual({
          valid: false,
          reason: 'invalid_scopes',
          message: "Token has scope(s) 'manage_runner' (needs one of: ai_features, read_api, api).",
        } satisfies InvalidTokenCheckResponse);
      });

      it('handles error from OAuth endpoint', async () => {
        const restError = new RESTError(
          oauthRequest,
          createFakeResponse({ status: 401 }),
          'token validation',
          '{"error": "invalid_token"}',
        );
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockRejectedValue(restError),
        });

        const result = await checkToken(mockClient, token, 'oauth');

        expect(result).toEqual({
          valid: false,
          reason: 'invalid_token',
          message: 'Token is invalid or expired.',
        } satisfies InvalidTokenCheckResponse);
        expect(mockClient.fetchFromApi).toHaveBeenCalledTimes(1);
      });
    });

    describe('when tokenType is undefined', () => {
      it('calls both endpoints (existing behavior)', async () => {
        const mockClient = createFakePartial<SimpleApiClient>({
          fetchFromApi: jest.fn().mockResolvedValue({ scopes: ['api'] }),
        });

        const result = await checkToken(mockClient, token, undefined);

        expect(result.valid).toBe(true);
        expect(mockClient.fetchFromApi).toHaveBeenCalledTimes(2);
      });
    });
  });
});
