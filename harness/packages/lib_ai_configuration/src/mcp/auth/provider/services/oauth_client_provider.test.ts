import { okAsync, errAsync } from 'neverthrow';

import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { NullLogger } from '@gitlab-org/logging';
import type { WorkflowUrlOpenerService } from '../../../url_opener_service';
import type {
  TokenStorage,
  ClientInfoStorage,
  Token,
  ClientInfo,
  StorageError,
} from '../../storage';
import type { McpAuthFlowController } from '../../flow';
import type { McpServerInfo, ServerName } from '../../../types';
import type { StreamableHttpServerConfig, SseServerConfig } from '../../../config';
import { DefaultOAuthClientProvider } from './oauth_client_provider';

describe('DefaultOAuthClientProvider', () => {
  const serverInfoHttp: McpServerInfo<StreamableHttpServerConfig> = {
    name: 'http-server' as ServerName,
    displayName: 'http-server',
    config: {
      type: 'http',
      url: new URL('https://issuer.example/token'),
      oauth2: { scopes: ['read', 'write'] },
    },
  };

  const serverInfoSse: McpServerInfo<SseServerConfig> = {
    name: 'sse-server' as ServerName,
    displayName: 'sse-server',
    config: {
      type: 'sse',
      url: new URL('https://issuer.example/sse'),
      oauth2: { scopes: ['one', 'two'] },
    },
  };

  let opener: jest.Mocked<WorkflowUrlOpenerService>;
  let tokenStorage: jest.Mocked<TokenStorage>;
  let clientInfoStorage: jest.Mocked<ClientInfoStorage>;
  let flow: jest.Mocked<McpAuthFlowController>;

  const defaultRedirectUrl = new URL('http://localhost:4567/callback');

  function createMockTokenStorage(): jest.Mocked<TokenStorage> {
    return {
      store: jest.fn(() => okAsync(undefined)),
      load: jest.fn(() => errAsync({ code: 'STORAGE_NOT_FOUND' })),
      clear: jest.fn(() => okAsync(undefined)),
    } as unknown as jest.Mocked<TokenStorage>;
  }

  function createMockClientInfoStorage(): jest.Mocked<ClientInfoStorage> {
    return {
      store: jest.fn(() => okAsync(undefined)),
      load: jest.fn(() => errAsync({ code: 'STORAGE_NOT_FOUND' })),
      clear: jest.fn(() => okAsync(undefined)),
    } as unknown as jest.Mocked<ClientInfoStorage>;
  }

  function expectOAuthError(fn: () => Promise<unknown>, expectedCode: string): Promise<void> {
    return expect(fn()).rejects.toMatchObject({ code: expectedCode });
  }

  beforeEach(() => {
    opener = {
      openUrl: jest.fn(async () => {}),
    } as unknown as jest.Mocked<WorkflowUrlOpenerService>;
    tokenStorage = createMockTokenStorage();
    clientInfoStorage = createMockClientInfoStorage();
    flow = {
      startFlow: jest.fn(() => 'state-123'),
      completeFlow: jest.fn(),
      clearFlows: jest.fn(),
    } as unknown as jest.Mocked<McpAuthFlowController>;
  });

  function createProvider(
    info: McpServerInfo<StreamableHttpServerConfig | SseServerConfig> = serverInfoHttp,
    redirectUrl: URL = defaultRedirectUrl,
  ) {
    return new DefaultOAuthClientProvider(
      info,
      opener,
      tokenStorage,
      clientInfoStorage,
      flow,
      new NullLogger(),
      redirectUrl,
    );
  }

  describe('constructor', () => {
    test('throws OAuthProviderError when redirectUrl is not provided', () => {
      expect(() => {
        const provider = new DefaultOAuthClientProvider(
          serverInfoHttp,
          opener,
          tokenStorage,
          clientInfoStorage,
          flow,
          new NullLogger(),
          undefined,
        );
        return provider;
      }).toThrow(
        expect.objectContaining({
          code: 'OAUTH_MISSING_REDIRECT_URL',
          message: 'redirectUrl is required for OAuth flow',
        }),
      );
    });
  });

  describe('metadata', () => {
    test.each([
      ['http server', serverInfoHttp, defaultRedirectUrl, 'read write'],
      ['sse server', serverInfoSse, defaultRedirectUrl, 'one two'],
    ])(
      'clientMetadata uses redirect URL, scopes, and defaults (%s)',
      (_n, info, cbUrl, expectedScope) => {
        const provider = createProvider(info, cbUrl);
        const meta = provider.clientMetadata;
        expect(meta.redirect_uris).toEqual([cbUrl.toString()]);
        expect(meta.scope).toBe(expectedScope);
        expect(meta.grant_types).toEqual(['authorization_code', 'refresh_token']);
        expect(meta.response_types).toEqual(['code']);
        expect(meta.token_endpoint_auth_method).toBe('none');
      },
    );

    test('redirectUrl uses provided URL over default', () => {
      const customUrl = new URL('http://example.com:8080/auth');
      const provider = createProvider(serverInfoHttp, customUrl);
      expect(provider.redirectUrl).toBe(customUrl);
    });
  });

  describe('client information', () => {
    test('prefers explicit config clientId/clientSecret over storage', async () => {
      const infoWithExplicit: McpServerInfo<StreamableHttpServerConfig> = {
        ...serverInfoHttp,
        config: {
          ...serverInfoHttp.config,
          oauth2: { clientId: 'abc', clientSecret: 'shh', scopes: ['s'] },
        },
      };
      const provider = createProvider(infoWithExplicit);

      // Even if storage has something else, explicit config wins
      clientInfoStorage.load.mockReturnValue(
        okAsync<ClientInfo, StorageError>({ client_id: 'other', client_secret: 'x' }),
      );

      await expect(provider.clientInformation()).resolves.toEqual({
        client_id: 'abc',
        client_secret: 'shh',
      });
    });

    test('falls back to storage on success', async () => {
      const provider = createProvider(serverInfoHttp);
      clientInfoStorage.load.mockReturnValue(
        okAsync<ClientInfo, StorageError>({
          client_id: 'stored-id',
          client_secret: 'stored-secret',
        }),
      );

      await expect(provider.clientInformation()).resolves.toEqual({
        client_id: 'stored-id',
        client_secret: 'stored-secret',
      });
    });

    test('returns undefined on storage not found or error', async () => {
      const provider = createProvider(serverInfoHttp);

      clientInfoStorage.load.mockReturnValue(
        errAsync<never, StorageError>({ code: 'STORAGE_NOT_FOUND' } as StorageError),
      );
      await expect(provider.clientInformation()).resolves.toBeUndefined();

      clientInfoStorage.load.mockReturnValue(
        errAsync<never, StorageError>({ code: 'STORAGE_IO_ERROR' } as StorageError),
      );
      await expect(provider.clientInformation()).resolves.toBeUndefined();
    });

    test('saveClientInformation stores and throws typed error on failure', async () => {
      const provider = createProvider(serverInfoHttp);

      clientInfoStorage.store.mockReturnValue(okAsync(undefined));
      await expect(
        provider.saveClientInformation({
          client_id: 'cid',
          client_secret: 'sec',
        } as OAuthClientInformationFull),
      ).resolves.toBeUndefined();

      expect(clientInfoStorage.store).toHaveBeenCalledWith('http-server', {
        client_id: 'cid',
        client_secret: 'sec',
      });

      clientInfoStorage.store.mockReturnValue(
        errAsync<never, StorageError>({ code: 'STORAGE_IO_ERROR' } as StorageError),
      );
      await expect(
        provider.saveClientInformation({
          client_id: 'cid',
          client_secret: 'sec',
        } as OAuthClientInformationFull),
      ).rejects.toMatchObject({ code: 'OAUTH_STORAGE_SAVE_FAILED' });
    });
  });

  describe('token management', () => {
    describe('loading tokens', () => {
      describe('expiry handling', () => {
        const now = Date.now();

        test.each([
          [
            'valid future expiry',
            now + 60_000,
            (expiresIn: number | undefined) => expect(expiresIn!).toBeGreaterThan(0),
          ],
          [
            'within skew window',
            now + 10_000,
            (expiresIn: number | undefined) => expect(expiresIn!).toBe(0),
          ],
          [
            'past expiry',
            now - 10_000,
            (expiresIn: number | undefined) => expect(expiresIn!).toBe(0),
          ],
        ])('%s', async (_scenario, expiresAt, assertion) => {
          const provider = createProvider();
          tokenStorage.load.mockReturnValue(
            okAsync<Token, StorageError>({
              access_token: 'A',
              token_type: 'Bearer',
              expires_at: expiresAt,
              refresh_token: 'R',
            }),
          );

          const tokens = await provider.tokens();
          expect(tokens).toBeDefined();
          assertion(tokens!.expires_in);
        });

        test('no expires_at yields undefined expires_in', async () => {
          const provider = createProvider();
          tokenStorage.load.mockReturnValue(
            okAsync<Token, StorageError>({
              access_token: 'C',
              token_type: 'Bearer',
              refresh_token: 'R3',
            }),
          );

          const tokens = await provider.tokens();
          expect(tokens!.expires_in).toBeUndefined();
        });
      });

      test('returns undefined when storage not found or fails', async () => {
        const provider = createProvider();

        tokenStorage.load.mockReturnValue(
          errAsync<never, StorageError>({ code: 'STORAGE_NOT_FOUND' } as StorageError),
        );
        await expect(provider.tokens()).resolves.toBeUndefined();

        tokenStorage.load.mockReturnValue(
          errAsync<never, StorageError>({ code: 'STORAGE_IO_ERROR' } as StorageError),
        );
        await expect(provider.tokens()).resolves.toBeUndefined();
      });

      test('returns undefined when access_token is missing', async () => {
        const provider = createProvider();
        tokenStorage.load.mockReturnValue(
          okAsync<Token, StorageError>({
            token_type: 'Bearer',
            refresh_token: 'R',
          } as Token), // missing access_token
        );

        await expect(provider.tokens()).resolves.toBeUndefined();
      });
    });

    describe('saving tokens', () => {
      test('persists computed stored token and throws on storage error', async () => {
        const provider = createProvider();

        tokenStorage.store.mockReturnValue(okAsync(undefined));
        await expect(
          provider.saveTokens({
            access_token: 'tok',
            token_type: 'Bearer',
            refresh_token: 'ref',
            expires_in: 120,
          }),
        ).resolves.toBeUndefined();

        expect(tokenStorage.store).toHaveBeenCalledTimes(1);
        const [serverName, stored] = tokenStorage.store.mock.calls[0];
        expect(serverName).toBe('http-server');
        expect(stored.access_token).toBe('tok');
        expect(typeof stored.expires_at).toBe('number');
        expect((stored.expires_at as number) - Date.now()).toBeGreaterThan(1000);

        tokenStorage.store.mockReturnValue(
          errAsync<never, StorageError>({ code: 'STORAGE_IO_ERROR' } as StorageError),
        );
        await expect(
          provider.saveTokens({
            access_token: 'tok',
            token_type: 'Bearer',
          }),
        ).rejects.toMatchObject({ code: 'OAUTH_STORAGE_SAVE_FAILED' });
      });
    });
  });

  describe('OAuth flow', () => {
    test('redirectToAuthorization opens URL via WorkflowUrlOpenerService', async () => {
      const provider = createProvider();
      const url = new URL('https://issuer.example/auth?x=1');

      await provider.redirectToAuthorization(url);
      expect(opener.openUrl).toHaveBeenCalledWith(url.toString());
    });

    test('codeVerifier roundtrip and error when missing', async () => {
      const provider = createProvider();

      await provider.saveCodeVerifier('verifier123');
      await expect(provider.codeVerifier()).resolves.toBe('verifier123');

      const providerMissing = createProvider();
      await expectOAuthError(() => providerMissing.codeVerifier(), 'OAUTH_MISSING_CODE_VERIFIER');
    });

    test('state generates via flow controller', async () => {
      const provider = createProvider();
      await expect(provider.state()).resolves.toBe('state-123');
      expect(flow.startFlow).toHaveBeenCalledWith('http-server');
    });
  });

  describe.each([
    { name: 'http', serverInfo: serverInfoHttp },
    { name: 'sse', serverInfo: serverInfoSse },
  ])('server type: $name', ({ serverInfo }) => {
    test('constructs and exposes metadata for server variant', () => {
      const provider = createProvider(serverInfo);
      expect(provider.clientMetadata.redirect_uris[0]).toBe(defaultRedirectUrl.toString());
    });
  });
});
