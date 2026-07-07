import { Result } from 'neverthrow';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { PersistentStorage } from '@gitlab-org/persistent-storage';
import type { Logger } from '@gitlab-org/logging';
import type { LsFetch } from '@gitlab-org/fetch';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  DefaultConfigurationController,
  type ConfigurationController,
} from './configuration_controller';

describe('DefaultConfigurationController', () => {
  let mockStorage: PersistentStorage;
  let mockLogger: Logger;
  let mockLsFetch: LsFetch;
  let controller: ConfigurationController;

  const configurationEntries = [
    {
      key: 'gitlabBaseUrl',
      value: 'new gitBaseUrlValue',
      displayName: '🔗 GitLab Instance URL',
      description: 'The URL of the GitLab instance to connect to.',
      defaultValue: 'https://gitlab.com',
      isSensitive: false,
    },
    {
      key: 'gitlabAuthToken',
      value: 'new gitAuthTokenValue',
      displayName: '🔖 GitLab Token',
      description:
        'GitLab access token with API permissions. Create one: https://gitlab.com/-/user_settings/personal_access_tokens',
      defaultValue: '',
      isSensitive: true,
    },
    {
      key: 'unknown-key',
      value: 'new unknown value',
      displayName: 'unknown',
      description: 'desc',
      defaultValue: '',
      isSensitive: false,
    },
  ];

  const storageSetMock = jest.fn<() => Promise<void>>();
  const logErrorMock = jest.fn();

  beforeEach(async () => {
    mockStorage = createFakePartial<PersistentStorage>({
      get: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ gitlabBaseUrl: 'https://example.com', gitlabAuthToken: 'token' }),
      set: storageSetMock,
    });

    mockLogger = createFakePartial<Logger>({
      error: logErrorMock,
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    });

    mockLsFetch = createFakePartial<LsFetch>({
      initialize: jest.fn<() => Promise<void>>(),
    });

    controller = new DefaultConfigurationController(
      { cwd: '/test/cwd' },
      mockStorage,
      mockLogger,
      mockLsFetch,
    );
    await controller.initialize();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('saveConfig', () => {
    let res: Result<void, Error>;
    describe('on successful save', () => {
      beforeEach(async () => {
        res = await controller.saveConfig({
          configurationEntries,
        });
      });

      it('should save valid configuration to persistent storage and return success result', () => {
        expect(res.isOk()).toBe(true);
      });

      it('should update internal duo configuration with new values', () => {
        const updatedConfig = controller.getDuoConfiguration();
        expect(updatedConfig.gitlabBaseUrl).toBe('new gitBaseUrlValue');
        expect(updatedConfig.gitlabAuthToken).toBe('new gitAuthTokenValue');
      });

      it('should ignore configuration entries with unknown keys', () => {
        const updatedConfig = controller.getDuoConfiguration();
        const keys = Object.keys(updatedConfig);
        expect(keys).not.toContain('unknown-key');
      });
    });

    describe('on error', () => {
      beforeEach(async () => {
        storageSetMock.mockRejectedValueOnce(new Error('test error'));
        res = await controller.saveConfig({ configurationEntries });
      });

      it('should return error result when storage.set throws an exception', () => {
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
          expect(res.error.message).toBe('test error');
        }
      });

      it('should log error when save operation fails', () => {
        expect(logErrorMock).toHaveBeenCalledWith(
          'Failed to save configuration:',
          // eslint-disable-next-line no-underscore-dangle
          res._unsafeUnwrapErr(),
        );
      });
    });

    describe('getDuoConfiguration', () => {
      it('should return configuration with both gitlabAuthToken and gitlabBaseUrl', () => {
        const config = controller.getDuoConfiguration();
        expect(config.gitlabAuthToken).toBe('token');
        expect(config.gitlabBaseUrl).toBe('https://example.com');
      });
    });

    describe('initialize with CLI overrides', () => {
      it('should not override stored config with undefined CLI values', async () => {
        const cliConfig = { gitlabAuthToken: 'cli-token' };

        const controllerWithCLI = new DefaultConfigurationController(
          { ...cliConfig, cwd: '/test/cwd' },
          mockStorage,
          mockLogger,
          mockLsFetch,
        );
        await controllerWithCLI.initialize();

        const config = controllerWithCLI.getDuoConfiguration();
        expect(config.gitlabBaseUrl).toBe('https://example.com');
        expect(config.gitlabAuthToken).toBe('cli-token');
      });

      it('should not override stored config with empty string CLI values', async () => {
        const cliConfig = { gitlabBaseUrl: '', gitlabAuthToken: 'cli-token' };

        const controllerWithEmpty = new DefaultConfigurationController(
          { ...cliConfig, cwd: '/test/cwd' },
          mockStorage,
          mockLogger,
          mockLsFetch,
        );
        await controllerWithEmpty.initialize();

        const config = controllerWithEmpty.getDuoConfiguration();
        expect(config.gitlabBaseUrl).toBe('https://example.com');
        expect(config.gitlabAuthToken).toBe('cli-token');
      });
    });

    describe('getDuoConfiguration defaults', () => {
      it('should apply default gitlabBaseUrl when not set', async () => {
        const noUrlStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<() => Promise<unknown>>().mockResolvedValue({ gitlabAuthToken: 'token' }),
          set: jest.fn<() => Promise<void>>(),
        });

        const controllerNoUrl = new DefaultConfigurationController(
          { cwd: '/test/cwd' },
          noUrlStorage,
          mockLogger,
          mockLsFetch,
        );
        await controllerNoUrl.initialize();

        const config = controllerNoUrl.getDuoConfiguration();
        expect(config.gitlabBaseUrl).toBe('https://gitlab.com');
        expect(config.gitlabAuthToken).toBe('token');
      });

      it('should apply default when stored value is empty string', async () => {
        const emptyStoredStorage = createFakePartial<PersistentStorage>({
          get: jest
            .fn<() => Promise<unknown>>()
            .mockResolvedValue({ gitlabBaseUrl: '', gitlabAuthToken: 'token' }),
          set: jest.fn<() => Promise<void>>(),
        });

        const controllerEmptyStored = new DefaultConfigurationController(
          { cwd: '/test/cwd' },
          emptyStoredStorage,
          mockLogger,
          mockLsFetch,
        );
        await controllerEmptyStored.initialize();

        const config = controllerEmptyStored.getDuoConfiguration();
        expect(config.gitlabBaseUrl).toBe('https://gitlab.com');
        expect(config.gitlabAuthToken).toBe('token');
      });
    });

    describe('isMissingConfiguration', () => {
      it('should return false when only token is provided (uses default URL)', async () => {
        const tokenOnlyStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<() => Promise<unknown>>().mockResolvedValue({ gitlabAuthToken: 'token' }),
          set: jest.fn<() => Promise<void>>(),
        });

        const controllerTokenOnly = new DefaultConfigurationController(
          { cwd: '/test/cwd' },
          tokenOnlyStorage,
          mockLogger,
          mockLsFetch,
        );
        await controllerTokenOnly.initialize();

        expect(controllerTokenOnly.isMissingConfiguration()).toBe(false);
      });
    });
  });

  describe('validateToken', () => {
    it('should return ok when token has valid scopes', async () => {
      const getMock = jest.fn<LsFetch['get']>().mockResolvedValue(
        createFakePartial<Response>({
          ok: true,
          status: 200,
          json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ scopes: ['api'] }),
        }),
      );
      mockLsFetch = createFakePartial<LsFetch>({ get: getMock });
      controller = new DefaultConfigurationController(
        { cwd: '/test/cwd' },
        mockStorage,
        mockLogger,
        mockLsFetch,
      );
      await controller.initialize();

      const result = await controller.validateToken('https://gitlab.com', 'glpat-valid');

      expect(result.isOk()).toBe(true);
    });

    it('should return error when token is invalid', async () => {
      const getMock = jest.fn<LsFetch['get']>().mockResolvedValue(
        createFakePartial<Response>({
          ok: false,
          status: 401,
          json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('parse error')),
          headers: createFakePartial<Headers>({
            get: jest.fn<() => string | null>().mockReturnValue(null),
          }),
        }),
      );
      mockLsFetch = createFakePartial<LsFetch>({ get: getMock });
      controller = new DefaultConfigurationController(
        { cwd: '/test/cwd' },
        mockStorage,
        mockLogger,
        mockLsFetch,
      );
      await controller.initialize();

      const result = await controller.validateToken('https://gitlab.com', 'bad-token');

      expect(result.isErr()).toBe(true);
    });

    it('should return error when fetch throws a network error', async () => {
      const getMock = jest.fn<LsFetch['get']>().mockRejectedValue(new Error('Network error'));
      mockLsFetch = createFakePartial<LsFetch>({ get: getMock });
      controller = new DefaultConfigurationController(
        { cwd: '/test/cwd' },
        mockStorage,
        mockLogger,
        mockLsFetch,
      );
      await controller.initialize();

      const result = await controller.validateToken('https://gitlab.com', 'token');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Network error');
      }
    });

    it('should return error for empty token', async () => {
      const result = await controller.validateToken('https://gitlab.com', '');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No token provided');
      }
    });
  });

  describe('when no configuration is stored', () => {
    let emptyStorage: PersistentStorage;

    beforeEach(() => {
      emptyStorage = createFakePartial<PersistentStorage>({
        get: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        set: jest.fn<() => Promise<void>>(),
      });
    });

    it('should have empty token and report missing configuration', async () => {
      const ctrl = new DefaultConfigurationController(
        { cwd: '/test/cwd' },
        emptyStorage,
        mockLogger,
        mockLsFetch,
      );
      await ctrl.initialize();

      expect(ctrl.getDuoConfiguration().gitlabAuthToken).toBe('');
      expect(ctrl.isMissingConfiguration()).toBe(true);
    });
  });
});
