import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import type { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ConfigurationController } from '../commands/config/configuration_controller';
import type { ParsedCliInput } from '../parse';
import type { GlabCredential } from './glab_credential_helper';

const mockGetGlabCredentials = jest.fn<(logger: Logger, cwd: string) => GlabCredential | null>();

jest.unstable_mockModule('./glab_credential_helper', () => ({
  getGlabCredentials: mockGetGlabCredentials,
}));

const { DefaultCredentialProvider } = await import('./credential_provider');

describe('DefaultCredentialProvider', () => {
  let mockConfigController: ConfigurationController;
  let mockLogger: Logger;
  let mockCliInput: ParsedCliInput;

  const originalEnv = process.env;

  beforeEach(() => {
    mockGetGlabCredentials.mockReset();
    process.env = { ...originalEnv };
    delete process.env.GITLAB_DUO_DISTRIBUTION;

    mockLogger = createFakePartial<Logger>({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: '/test/cwd',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('when config has a static token', () => {
    describe('when token came from env var or CLI flag', () => {
      beforeEach(() => {
        mockCliInput = createFakePartial<ParsedCliInput>({
          cwd: '/test/cwd',
          gitlabAuthToken: 'static-token',
        });
        mockConfigController = createFakePartial<ConfigurationController>({
          getDuoConfiguration: () => ({
            gitlabBaseUrl: 'https://gitlab.com',
            gitlabAuthToken: 'static-token',
          }),
        });
      });

      it('should return the static token, config baseUrl, and env-or-flag source', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: 'static-token',
          baseUrl: 'https://gitlab.com',
          source: { type: 'env-or-flag' },
        });
        expect(mockGetGlabCredentials).not.toHaveBeenCalled();
      });
    });

    describe('when token came from config file', () => {
      beforeEach(() => {
        mockConfigController = createFakePartial<ConfigurationController>({
          getDuoConfiguration: () => ({
            gitlabBaseUrl: 'https://gitlab.com',
            gitlabAuthToken: 'static-token',
          }),
          getConfigurationModel: () => ({
            configurationEntries: [],
            configFilePath: '/home/user/.gitlab/storage.json',
          }),
        });
      });

      it('should return the static token with config-file source including path', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: 'static-token',
          baseUrl: 'https://gitlab.com',
          source: { type: 'config-file', path: '/home/user/.gitlab/storage.json' },
        });
        expect(mockGetGlabCredentials).not.toHaveBeenCalled();
      });
    });
  });

  describe('when config has no token', () => {
    beforeEach(() => {
      mockConfigController = createFakePartial<ConfigurationController>({
        getDuoConfiguration: () => ({
          gitlabBaseUrl: 'https://gitlab.com',
          gitlabAuthToken: '',
        }),
      });
    });

    describe('when glab returns a pat credential', () => {
      beforeEach(() => {
        mockGetGlabCredentials.mockReturnValue({
          type: 'pat',
          token: 'glab-pat-token',
          instanceUrl: 'https://glab.example.com',
        });
      });

      it('should return the glab token, instance URL, and glab PAT source', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: 'glab-pat-token',
          baseUrl: 'https://glab.example.com',
          source: { type: 'glab', credentialType: 'pat' },
        });
      });

      it('should cache the credential on subsequent calls', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );

        await provider.getCredentials();
        await provider.getCredentials();

        expect(mockGetGlabCredentials).toHaveBeenCalledTimes(1);
      });
    });

    describe('when glab returns an oauth credential', () => {
      it('should return the oauth token, instance URL, and glab OAuth source', async () => {
        const futureDate = new Date(Date.now() + 3600000);
        mockGetGlabCredentials.mockReturnValue({
          type: 'oauth',
          token: 'oauth-token',
          expiresAt: futureDate,
          instanceUrl: 'https://gitlab.com',
        });

        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: 'oauth-token',
          baseUrl: 'https://gitlab.com',
          source: { type: 'glab', credentialType: 'oauth' },
        });
      });

      it('should refresh when oauth token is expired', async () => {
        const expiredDate = new Date(Date.now() - 60000);
        mockGetGlabCredentials
          .mockReturnValueOnce({
            type: 'oauth',
            token: 'expired-token',
            expiresAt: expiredDate,
            instanceUrl: 'https://gitlab.com',
          })
          .mockReturnValueOnce({
            type: 'oauth',
            token: 'new-token',
            expiresAt: new Date(Date.now() + 3600000),
            instanceUrl: 'https://gitlab.com',
          });

        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );

        // First call caches the expired token
        const first = await provider.getCredentials();
        expect(first.token).toBe('expired-token');

        // Second call detects expiry and fetches new token
        const second = await provider.getCredentials();
        expect(second.token).toBe('new-token');
        expect(mockGetGlabCredentials).toHaveBeenCalledTimes(2);
      });

      it('should refresh when oauth token is within buffer period', async () => {
        // Token expires in 20 seconds (within 30-second buffer)
        const nearExpiryDate = new Date(Date.now() + 20000);
        mockGetGlabCredentials
          .mockReturnValueOnce({
            type: 'oauth',
            token: 'near-expiry-token',
            expiresAt: nearExpiryDate,
            instanceUrl: 'https://gitlab.com',
          })
          .mockReturnValueOnce({
            type: 'oauth',
            token: 'refreshed-token',
            expiresAt: new Date(Date.now() + 3600000),
            instanceUrl: 'https://gitlab.com',
          });

        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );

        await provider.getCredentials();
        const credentials = await provider.getCredentials();

        expect(credentials.token).toBe('refreshed-token');
      });
    });

    describe('when glab returns null', () => {
      beforeEach(() => {
        mockGetGlabCredentials.mockReturnValue(null);
      });

      it('should return empty token and fallback baseUrl from config', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials.token).toBe('');
        expect(credentials.baseUrl).toBe('https://gitlab.com');
      });
    });
  });

  describe('when distribution is glab', () => {
    beforeEach(() => {
      process.env.GITLAB_DUO_DISTRIBUTION = 'glab';
    });

    describe('when config has a token from config file (not env/flag)', () => {
      beforeEach(() => {
        mockConfigController = createFakePartial<ConfigurationController>({
          getDuoConfiguration: () => ({
            gitlabBaseUrl: 'https://gitlab.com',
            gitlabAuthToken: 'config-file-token',
          }),
          getConfigurationModel: () => ({
            configurationEntries: [],
            configFilePath: '/home/user/.gitlab/storage.json',
          }),
        });
        mockGetGlabCredentials.mockReturnValue({
          type: 'pat',
          token: 'glab-token',
          instanceUrl: 'https://glab.example.com',
        });
      });

      it('should skip config file source and use glab credential helper', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: 'glab-token',
          baseUrl: 'https://glab.example.com',
          source: { type: 'glab', credentialType: 'pat' },
        });
      });
    });

    describe('when env var / flag provides a token', () => {
      describe('when CLI input also has a base URL', () => {
        beforeEach(() => {
          mockCliInput = createFakePartial<ParsedCliInput>({
            cwd: '/test/cwd',
            gitlabAuthToken: 'env-token',
            gitlabBaseUrl: 'https://self-managed.example.com',
          });
          mockConfigController = createFakePartial<ConfigurationController>({
            getDuoConfiguration: () => ({
              gitlabBaseUrl: 'https://gitlab.com',
              gitlabAuthToken: 'env-token',
            }),
          });
        });

        it('should use the CLI input base URL over the config default', async () => {
          const provider = new DefaultCredentialProvider(
            mockConfigController,
            mockLogger,
            mockCliInput,
          );
          const credentials = await provider.getCredentials();

          expect(credentials).toEqual({
            token: 'env-token',
            baseUrl: 'https://self-managed.example.com',
            source: { type: 'env-or-flag' },
          });
          expect(mockGetGlabCredentials).not.toHaveBeenCalled();
        });
      });

      describe('when CLI input has no base URL', () => {
        beforeEach(() => {
          mockCliInput = createFakePartial<ParsedCliInput>({
            cwd: '/test/cwd',
            gitlabAuthToken: 'env-token',
          });
          mockConfigController = createFakePartial<ConfigurationController>({
            getDuoConfiguration: () => ({
              gitlabBaseUrl: 'https://gitlab.com',
              gitlabAuthToken: 'env-token',
            }),
          });
        });

        it('should fall back to config base URL', async () => {
          const provider = new DefaultCredentialProvider(
            mockConfigController,
            mockLogger,
            mockCliInput,
          );
          const credentials = await provider.getCredentials();

          expect(credentials).toEqual({
            token: 'env-token',
            baseUrl: 'https://gitlab.com',
            source: { type: 'env-or-flag' },
          });
          expect(mockGetGlabCredentials).not.toHaveBeenCalled();
        });
      });
    });

    describe('when glab credential helper returns null', () => {
      beforeEach(() => {
        mockConfigController = createFakePartial<ConfigurationController>({
          getDuoConfiguration: () => ({
            gitlabBaseUrl: 'https://gitlab.com',
            gitlabAuthToken: '',
          }),
        });
        mockGetGlabCredentials.mockReturnValue(null);
      });

      it('should return empty credentials with source type none', async () => {
        const provider = new DefaultCredentialProvider(
          mockConfigController,
          mockLogger,
          mockCliInput,
        );
        const credentials = await provider.getCredentials();

        expect(credentials).toEqual({
          token: '',
          baseUrl: 'https://gitlab.com',
          source: { type: 'none' },
        });
      });
    });
  });
});
