import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { ConfigService } from '@gitlab-org/config';
import type { LsFetch } from '@gitlab-org/fetch';
import type { CredentialProvider, Credentials } from './utils/credential_provider';
import { CliApiService } from './cli_api_service';
import type { ParsedCliInput } from './parse';

/**
 * Creates a mock Response that simulates a 401 Unauthorized with an invalid_token body.
 * This causes `checkToken` (via `DefaultSimpleApiClient`) to return `{ valid: false, reason: 'invalid_token' }`.
 */
function makeUnauthorizedResponse(): Response {
  return createFakeResponse({
    status: 401,
    url: 'https://gitlab.com/api/v4/personal_access_tokens/self',
    text: JSON.stringify({ error: 'invalid_token', error_description: 'Token is expired' }),
  });
}

/**
 * Creates a mock 200 OK Response whose JSON body is the GitLab instance version.
 * Used to let `initialize()` (with token checking skipped) and subsequent REST
 * calls succeed.
 */
function makeVersionResponse(): Response {
  return createFakeResponse({
    status: 200,
    url: 'https://gitlab.com/api/v4/version',
    json: { version: '18.5.0' },
  });
}

describe('CliApiService', () => {
  let mockCredentialProvider: CredentialProvider;
  let mockLogger: TestLogger;
  let mockLsFetch: LsFetch;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    mockLogger = new TestLogger();

    // Mock LsFetch to return 401 for all GET requests (simulates invalid token)
    mockLsFetch = createFakePartial<LsFetch>({
      updateAgentOptions: jest.fn(),
      get: jest.fn<LsFetch['get']>().mockResolvedValue(makeUnauthorizedResponse()),
    });

    mockConfigService = createFakePartial<ConfigService>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onConfigChange: jest.fn() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: jest.fn() as any,
    });
  });

  function buildService(credentials: Credentials): CliApiService {
    mockCredentialProvider = createFakePartial<CredentialProvider>({
      getCredentials: jest.fn<() => Promise<Credentials>>().mockResolvedValue(credentials),
    });
    const mockCliInput = createFakePartial<ParsedCliInput>({
      skipTokenCheck: false,
    });
    return new CliApiService(
      mockCredentialProvider,
      mockLogger,
      mockLsFetch,
      mockConfigService,
      mockCliInput,
    );
  }

  describe('initialize', () => {
    describe('when the token is invalid (401 Unauthorized)', () => {
      describe('when credentials came from env var or CLI flag', () => {
        it('includes the env-or-flag label and hint in the error message', async () => {
          const service = buildService({
            token: 'bad-token',
            baseUrl: 'https://gitlab.com',
            source: { type: 'env-or-flag' },
          });

          const result = await service.initialize();

          expect(result.isErr()).toBe(true);
          result.mapErr((e) => {
            expect(e.message).toContain('Credentials source: GITLAB_TOKEN / --gitlab-auth-token');
            expect(e.message).toContain(
              'The token was provided via GITLAB_TOKEN environment variable or --gitlab-auth-token flag.',
            );
          });
        });
      });

      describe('when credentials came from a config file', () => {
        it('includes the config file path and hint in the error message', async () => {
          const service = buildService({
            token: 'bad-token',
            baseUrl: 'https://gitlab.com',
            source: { type: 'config-file', path: '/home/user/.gitlab/storage.json' },
          });

          const result = await service.initialize();

          expect(result.isErr()).toBe(true);
          result.mapErr((e) => {
            expect(e.message).toContain(
              'Credentials source: config file at /home/user/.gitlab/storage.json',
            );
            expect(e.message).toContain("Run 'duo config edit' to update your token.");
          });
        });
      });

      describe('when credentials came from glab PAT', () => {
        it('includes the glab PAT label and glab hint in the error message', async () => {
          const service = buildService({
            token: 'bad-token',
            baseUrl: 'https://gitlab.com',
            source: { type: 'glab', credentialType: 'pat' },
          });

          const result = await service.initialize();

          expect(result.isErr()).toBe(true);
          result.mapErr((e) => {
            expect(e.message).toContain('Credentials source: glab credential helper (PAT)');
            expect(e.message).toContain(
              "Run 'glab auth status' to validate glab is authenticated correctly.",
            );
            expect(e.message).not.toContain("Run 'duo config edit'");
          });
        });
      });

      describe('when credentials came from glab OAuth', () => {
        it('includes the glab OAuth label and glab hint in the error message', async () => {
          const service = buildService({
            token: 'bad-token',
            baseUrl: 'https://gitlab.com',
            source: { type: 'glab', credentialType: 'oauth' },
          });

          const result = await service.initialize();

          expect(result.isErr()).toBe(true);
          result.mapErr((e) => {
            expect(e.message).toContain('Credentials source: glab credential helper (OAuth)');
            expect(e.message).toContain(
              "Run 'glab auth status' to validate glab is authenticated correctly.",
            );
            expect(e.message).not.toContain("Run 'duo config edit'");
          });
        });
      });

      // The 'none' credential source is unreachable in practice — the CLI
      // requires a token before initialization and throws before reaching
      // the token validation code path.
    });
  });

  describe('credential refresh propagation', () => {
    function buildServiceSkippingTokenCheck(
      getCredentials: CredentialProvider['getCredentials'],
    ): CliApiService {
      mockCredentialProvider = createFakePartial<CredentialProvider>({ getCredentials });
      const mockCliInput = createFakePartial<ParsedCliInput>({ skipTokenCheck: true });
      return new CliApiService(
        mockCredentialProvider,
        mockLogger,
        mockLsFetch,
        mockConfigService,
        mockCliInput,
      );
    }

    beforeEach(() => {
      // Let the version fetch (and any subsequent REST call) succeed.
      mockLsFetch.get = jest.fn<LsFetch['get']>().mockResolvedValue(makeVersionResponse());
    });

    it('updates tokenInfo and re-fires onApiReconfigured when the token rotates', async () => {
      const credsA: Credentials = {
        token: 'token-A',
        baseUrl: 'https://gitlab.com',
        source: { type: 'glab', credentialType: 'oauth' },
      };
      const credsB: Credentials = { ...credsA, token: 'token-B' };

      const getCredentials = jest
        .fn<CredentialProvider['getCredentials']>()
        .mockResolvedValueOnce(credsA) // used by initialize()'s #refreshClient
        .mockResolvedValue(credsB); // subsequent calls see the rotated token

      const service = buildServiceSkippingTokenCheck(getCredentials);

      const reconfiguredEvents: { token?: string }[] = [];
      service.onApiReconfigured((data) => {
        reconfiguredEvents.push({
          token: data.isInValidState ? data.tokenInfo.token : undefined,
        });
      });

      const initResult = await service.initialize();
      expect(initResult.isOk()).toBe(true);
      // initialize() fires exactly once, with the original token.
      expect(reconfiguredEvents).toEqual([{ token: 'token-A' }]);
      expect(service.tokenInfo?.token).toBe('token-A');

      // A REST call after the token has rotated should detect the change,
      // refresh, and re-fire with the new token.
      await service.fetchFromApi({ type: 'rest', method: 'GET', path: '/api/v4/version' });

      expect(reconfiguredEvents).toEqual([{ token: 'token-A' }, { token: 'token-B' }]);
      expect(service.tokenInfo?.token).toBe('token-B');
    });

    it('does not re-fire onApiReconfigured when credentials are unchanged', async () => {
      const creds: Credentials = {
        token: 'token-A',
        baseUrl: 'https://gitlab.com',
        source: { type: 'glab', credentialType: 'oauth' },
      };
      const getCredentials = jest
        .fn<CredentialProvider['getCredentials']>()
        .mockResolvedValue(creds);

      const service = buildServiceSkippingTokenCheck(getCredentials);

      const fireSpy = jest.fn();
      service.onApiReconfigured(fireSpy);

      await service.initialize();
      expect(fireSpy).toHaveBeenCalledTimes(1);

      await service.fetchFromApi({ type: 'rest', method: 'GET', path: '/api/v4/version' });

      // No credential change → no additional event.
      expect(fireSpy).toHaveBeenCalledTimes(1);
    });

    it('refreshes the REST client but does not re-fire when only the baseUrl changes', async () => {
      const credsA: Credentials = {
        token: 'token-A',
        baseUrl: 'https://gitlab.com',
        source: { type: 'glab', credentialType: 'oauth' },
      };

      const credsB: Credentials = { ...credsA, baseUrl: 'https://gitlab.example.com' };

      const getCredentials = jest
        .fn<CredentialProvider['getCredentials']>()
        .mockResolvedValueOnce(credsA)
        .mockResolvedValue(credsB);

      const service = buildServiceSkippingTokenCheck(getCredentials);

      const fireSpy = jest.fn();
      service.onApiReconfigured(fireSpy);

      await service.initialize();
      expect(fireSpy).toHaveBeenCalledTimes(1);

      await service.fetchFromApi({ type: 'rest', method: 'GET', path: '/api/v4/version' });

      const lastGetUrl = jest.mocked(mockLsFetch.get).mock.calls.at(-1)?.[0];
      expect(String(lastGetUrl)).toContain('gitlab.example.com');
      expect(fireSpy).toHaveBeenCalledTimes(1);
    });
  });
});
