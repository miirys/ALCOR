import { DefaultConfigService } from '@gitlab-org/config';
import { TestLogger } from '@gitlab-org/logging';
import { UserService } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { PersistentStorage } from './persistent_storage';
import { DefaultUserPersistentStorage } from './user_persistent_storage';
import { ClientSettings, GlobalSettings } from './types';

// Import the constant from the implementation
const GLOBAL_CLIENT = '__global__';

describe('DefaultUserPersistentStorage', () => {
  let userStorage: DefaultUserPersistentStorage;
  let mockGenericStorage: jest.Mocked<PersistentStorage>;
  let mockConfigService: DefaultConfigService;
  let mockUserService: UserService;
  let mockUserServiceNoUser: UserService;
  let testLogger: TestLogger;

  const testClient = 'vscode';
  const testUserId = 'gid://gitlab/User/123';

  beforeEach(() => {
    mockGenericStorage = createFakePartial<jest.Mocked<PersistentStorage>>({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      close: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
    });

    mockConfigService = new DefaultConfigService();
    mockConfigService.set('clientInfo.name', testClient);

    mockUserService = createFakePartial<UserService>({
      user: { id: testUserId },
      getUser: jest.fn().mockResolvedValue({ id: testUserId }),
    });

    mockUserServiceNoUser = createFakePartial<UserService>({
      getUser: jest.fn().mockRejectedValue(new Error('No user')),
    });

    testLogger = new TestLogger();

    userStorage = new DefaultUserPersistentStorage(
      mockGenericStorage,
      mockConfigService,
      mockUserService,
      testLogger,
    );
  });

  afterEach(() => {
    testLogger.clear();
  });

  describe('client-specific operations', () => {
    it('should get client setting with proper key format', async () => {
      const testValue = { enabled: true };
      mockGenericStorage.get.mockResolvedValue(testValue);

      const result = await userStorage.get('telemetry');

      expect(result).toEqual(testValue);
      expect(mockGenericStorage.get).toHaveBeenCalledWith(`${testUserId}:${testClient}:telemetry`);
    });

    it('should set client setting with validation', async () => {
      const testValue: ClientSettings['telemetry'] = { enabled: true };

      await userStorage.set('telemetry', testValue);

      expect(mockGenericStorage.set).toHaveBeenCalledWith(
        `${testUserId}:${testClient}:telemetry`,
        testValue,
      );
    });

    it('should delete client setting', async () => {
      await userStorage.delete('telemetry');

      expect(mockGenericStorage.delete).toHaveBeenCalledWith(
        `${testUserId}:${testClient}:telemetry`,
      );
    });

    it('should return undefined when no client name available', async () => {
      mockConfigService.set('clientInfo.name', undefined);

      const result = await userStorage.get('telemetry');

      expect(result).toBeUndefined();
      expect(mockGenericStorage.get).not.toHaveBeenCalled();
    });

    it('should warn and return early when no client name for set', async () => {
      mockConfigService.set('clientInfo.name', undefined);

      await userStorage.set('telemetry', { enabled: true });

      expect(mockGenericStorage.set).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No client name available, cannot set value',
        }),
      );
    });

    it('should warn and return early when no client name for delete', async () => {
      mockConfigService.set('clientInfo.name', undefined);

      await userStorage.delete('telemetry');

      expect(mockGenericStorage.delete).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No client name available, cannot delete value',
        }),
      );
    });

    it('should return undefined when no user ID available', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      const result = await userStorageNoUser.get('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available',
        }),
      );
    });

    it('should warn and return early when no user ID for set', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      await userStorageNoUser.set('telemetry', { enabled: true });

      expect(mockGenericStorage.set).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available, cannot set value',
        }),
      );
    });

    it('should warn and return early when no user ID for delete', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      await userStorageNoUser.delete('telemetry');

      expect(mockGenericStorage.delete).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available, cannot delete value',
        }),
      );
    });
  });

  describe('user resolution', () => {
    it('should wait for getUser() to resolve before accessing storage', async () => {
      let resolveGetUser!: (user: { id: string }) => void;
      const delayedUserService = createFakePartial<UserService>({
        getUser: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveGetUser = resolve;
            }),
        ),
      });

      const delayedStorage = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        delayedUserService,
        testLogger,
      );

      const testValue = { enabled: true };
      mockGenericStorage.get.mockResolvedValue(testValue);

      const resultPromise = delayedStorage.get('telemetry');

      // Storage should not have been accessed yet
      expect(mockGenericStorage.get).not.toHaveBeenCalled();

      // Now resolve the user
      resolveGetUser({ id: testUserId });

      const result = await resultPromise;
      expect(result).toEqual(testValue);
      expect(mockGenericStorage.get).toHaveBeenCalledWith(`${testUserId}:${testClient}:telemetry`);
    });

    it('should return undefined when getUser() times out', async () => {
      jest.useFakeTimers();

      const hangingUserService = createFakePartial<UserService>({
        getUser: jest.fn().mockImplementation(() => new Promise(() => {})),
      });

      const hangingStorage = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        hangingUserService,
        testLogger,
      );

      const resultPromise = hangingStorage.get('telemetry');

      jest.advanceTimersByTime(10_000);

      const result = await resultPromise;
      expect(result).toBeUndefined();
      expect(mockGenericStorage.get).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('[UserPersistentStorage] Failed to resolve user ID'),
        }),
      );

      jest.useRealTimers();
    });
  });

  describe('global operations', () => {
    it('should get global setting with proper key format', async () => {
      const testValue = { enabled: false };
      mockGenericStorage.get.mockResolvedValue(testValue);

      const result = await userStorage.getGlobal('telemetry');

      expect(result).toEqual(testValue);
      expect(mockGenericStorage.get).toHaveBeenCalledWith(
        `${testUserId}:${GLOBAL_CLIENT}:telemetry`,
      );
    });

    it('should set global setting with validation', async () => {
      const testValue: GlobalSettings['telemetry'] = { enabled: false };

      await userStorage.setGlobal('telemetry', testValue);

      expect(mockGenericStorage.set).toHaveBeenCalledWith(
        `${testUserId}:${GLOBAL_CLIENT}:telemetry`,
        testValue,
      );
    });

    it('should delete global setting', async () => {
      await userStorage.deleteGlobal('telemetry');

      expect(mockGenericStorage.delete).toHaveBeenCalledWith(
        `${testUserId}:${GLOBAL_CLIENT}:telemetry`,
      );
    });

    it('should return undefined for global get when no user ID', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      const result = await userStorageNoUser.getGlobal('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available',
        }),
      );
    });

    it('should warn and return early for global set when no user ID', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      await userStorageNoUser.setGlobal('telemetry', { enabled: false });

      expect(mockGenericStorage.set).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available, cannot set value',
        }),
      );
    });

    it('should warn and return early for global delete when no user ID', async () => {
      const userStorageNoUser = new DefaultUserPersistentStorage(
        mockGenericStorage,
        mockConfigService,
        mockUserServiceNoUser,
        testLogger,
      );

      await userStorageNoUser.deleteGlobal('telemetry');

      expect(mockGenericStorage.delete).not.toHaveBeenCalled();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No user ID available, cannot delete value',
        }),
      );
    });
  });

  describe('validation', () => {
    it('should validate and return valid client setting', async () => {
      const validValue = { enabled: true };
      mockGenericStorage.get.mockResolvedValue(validValue);

      const result = await userStorage.get('telemetry');

      expect(result).toEqual(validValue);
    });

    it('should return undefined for invalid stored client setting', async () => {
      const invalidValue = { enabled: 'not-a-boolean' };
      mockGenericStorage.get.mockResolvedValue(invalidValue);

      const result = await userStorage.get('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            '[UserPersistentStorage] Stored value failed validation for key: telemetry',
          ),
        }),
      );
    });

    it('should validate and return valid global setting', async () => {
      const validValue = { enabled: false };
      mockGenericStorage.get.mockResolvedValue(validValue);

      const result = await userStorage.getGlobal('telemetry');

      expect(result).toEqual(validValue);
    });

    it('should return undefined for invalid stored global setting', async () => {
      const invalidValue = { enabled: 'not-a-boolean' };
      mockGenericStorage.get.mockResolvedValue(invalidValue);

      const result = await userStorage.getGlobal('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            '[UserPersistentStorage] Stored value failed validation for key: telemetry',
          ),
        }),
      );
    });

    it('should throw error for invalid client setting on set', async () => {
      const invalidValue = { enabled: 'not-a-boolean' } as unknown as { enabled: boolean };

      await expect(userStorage.set('telemetry', invalidValue)).rejects.toThrow(
        'Invalid value for key telemetry:',
      );

      expect(mockGenericStorage.set).not.toHaveBeenCalled();
    });

    it('should throw error for invalid global setting on set', async () => {
      const invalidValue = { enabled: 'not-a-boolean' } as unknown as { enabled: boolean };

      await expect(userStorage.setGlobal('telemetry', invalidValue)).rejects.toThrow(
        'Invalid value for key telemetry:',
      );

      expect(mockGenericStorage.set).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle generic storage errors gracefully for get', async () => {
      mockGenericStorage.get.mockRejectedValue(new Error('Storage error'));

      const result = await userStorage.get('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.errorLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] Storage get error for key: telemetry',
        }),
      );
    });

    it('should propagate generic storage errors for set', async () => {
      mockGenericStorage.set.mockRejectedValue(new Error('Storage error'));

      await expect(userStorage.set('telemetry', { enabled: true })).rejects.toThrow(
        'Storage error',
      );
    });

    it('should propagate generic storage errors for delete', async () => {
      mockGenericStorage.delete.mockRejectedValue(new Error('Storage error'));

      await expect(userStorage.delete('telemetry')).rejects.toThrow('Storage error');
    });

    it('should return undefined when generic storage returns undefined', async () => {
      mockGenericStorage.get.mockResolvedValue(undefined);

      const result = await userStorage.get('telemetry');

      expect(result).toBeUndefined();
      expect(testLogger.debugLogs).toContainEqual(
        expect.objectContaining({
          message: '[UserPersistentStorage] No value found for key: telemetry',
        }),
      );
    });
  });
});
