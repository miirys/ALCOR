import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, accessSync, constants, promises as fs } from 'fs';
import { homedir } from 'node:os';
import * as lockfile from 'proper-lockfile';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultPersistentStorage } from './persistent_storage';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  accessSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

jest.mock('node:os');
jest.mock('proper-lockfile');

const mockFs = {
  existsSync: jest.mocked(existsSync),
  mkdirSync: jest.mocked(mkdirSync),
  writeFileSync: jest.mocked(writeFileSync),
  accessSync: jest.mocked(accessSync),
};

const mockFsPromises = {
  readFile: jest.mocked(fs.readFile),
  writeFile: jest.mocked(fs.writeFile),
  unlink: jest.mocked(fs.unlink),
};

const mockHomedir = jest.mocked(homedir);
const mockLockfile = jest.mocked(lockfile);

describe('DefaultPersistentStorage', () => {
  let storage: DefaultPersistentStorage;
  let testLogger: TestLogger;
  let mockRelease: jest.Mock;

  const testStoragePath = '/home/user/.gitlab/storage.json';

  beforeEach(() => {
    mockHomedir.mockReturnValue('/home/user');
    mockRelease = jest.fn().mockResolvedValue(undefined);
    mockLockfile.lock.mockResolvedValue(mockRelease);

    testLogger = new TestLogger();

    // Mock sync fs operations (used in initialization)
    mockFs.existsSync.mockImplementation((path) => {
      const pathStr = path.toString();
      if (pathStr.includes('.gitlab')) return true;
      if (pathStr === testStoragePath) return true;
      return false;
    });
    mockFs.accessSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);

    // Mock async fs.promises operations
    mockFsPromises.readFile.mockResolvedValue('{}');
    mockFsPromises.writeFile.mockResolvedValue(undefined);
    mockFsPromises.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (storage) {
      storage.close();
    }
    testLogger.clear();
  });

  describe('initialization failures', () => {
    it('should handle directory write permission error', () => {
      mockFs.accessSync.mockImplementation((path, mode) => {
        const pathStr = path.toString();
        if (pathStr.includes('.gitlab') && mode === constants.W_OK) {
          throw new Error('Permission denied');
        }
      });

      storage = new DefaultPersistentStorage(testLogger);

      // Storage should not be initialized due to the error
      expect(storage.isInitialized()).toBe(false);
      expect(testLogger.errorLogs).toHaveLength(2);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Directory write permission error:',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
      expect(testLogger.errorLogs[1].message).toContain(
        '[PersistentStorage] Failed to initialize persistent storage',
      );
    });

    it('should handle storage file access error', () => {
      mockFs.accessSync.mockImplementation((path, mode) => {
        const pathStr = path.toString();
        if (pathStr === testStoragePath && mode === 6) {
          throw new Error('File access denied');
        }
      });

      storage = new DefaultPersistentStorage(testLogger);

      expect(storage.isInitialized()).toBe(false);
      expect(testLogger.errorLogs).toHaveLength(2);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Storage access error:',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
      expect(testLogger.errorLogs[1].message).toContain(
        '[PersistentStorage] Failed to initialize persistent storage',
      );
    });

    it('should create directory if it does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('.gitlab') && !pathStr.includes('storage.json')) return false;
        if (pathStr === testStoragePath) return true;
        return false;
      });

      storage = new DefaultPersistentStorage(testLogger);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(join('/home/user', '.gitlab'), {
        recursive: true,
      });
      expect(storage.isInitialized()).toBe(true);
    });

    it('should create storage file if it does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('.gitlab') && !pathStr.includes('storage.json')) return true;
        if (pathStr === testStoragePath) return false;
        return false;
      });

      storage = new DefaultPersistentStorage(testLogger);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(testStoragePath, '{}', {
        encoding: 'utf8',
        // NOTE: Windows will use 0o666 mode.
        mode: 0o600,
      });
      expect(storage.isInitialized()).toBe(true);
    });

    it('should handle operations when storage failed to initialize', async () => {
      mockFs.accessSync.mockImplementation((path, mode) => {
        const pathStr = path.toString();
        if (pathStr.includes('.gitlab') && mode === constants.W_OK) {
          throw new Error('Permission denied');
        }
      });

      storage = new DefaultPersistentStorage(testLogger);

      expect(storage.isInitialized()).toBe(false);

      // Get operations should throw when storage is not initialized
      await expect(storage.get('key')).rejects.toThrow('Storage is not initialized');

      // Set operations should throw when storage is not initialized
      await expect(storage.set('key', 'value')).rejects.toThrow('Storage is not initialized');
      await expect(storage.delete('key')).rejects.toThrow('Storage is not initialized');
    });
  });

  describe('file I/O error handling', () => {
    beforeEach(() => {
      storage = new DefaultPersistentStorage(testLogger);
      testLogger.clear();
    });

    it('should handle storage read errors gracefully', async () => {
      mockFsPromises.readFile.mockRejectedValue(new Error('Read error'));

      const result = await storage.get('key');

      expect(result).toBeUndefined();
      expect(testLogger.errorLogs.length).toBeGreaterThanOrEqual(1);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Failed to read storage file',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
    });

    it('should handle JSON parse errors in readStorage', async () => {
      mockFsPromises.readFile.mockResolvedValue('invalid-json');

      const result = await storage.get('key');

      expect(result).toBeUndefined();
      expect(testLogger.errorLogs.length).toBeGreaterThanOrEqual(1);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Failed to read storage file',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
    });

    it('should handle write errors in writeStorage', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(storage.set('key', 'value')).rejects.toThrow('Write failed');

      expect(testLogger.errorLogs.length).toBeGreaterThanOrEqual(1);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Failed to write storage file',
      );
    });
  });

  describe('locking mechanism', () => {
    beforeEach(() => {
      storage = new DefaultPersistentStorage(testLogger);
      testLogger.clear();
    });

    it('should handle lock acquisition failure', async () => {
      mockLockfile.lock.mockRejectedValue(new Error('Lock failed'));

      await expect(storage.set('key', 'value')).rejects.toThrow('Lock failed');

      expect(testLogger.errorLogs).toHaveLength(1);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Lock operation failed',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
    });

    it('should release lock even if operation fails', async () => {
      // Ensure storage is initialized first
      expect(storage.isInitialized()).toBe(true);

      mockFsPromises.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(storage.set('key', 'value')).rejects.toThrow('Write failed');

      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle lock release errors gracefully', async () => {
      mockRelease.mockRejectedValue(new Error('Release failed'));
      mockFsPromises.writeFile.mockResolvedValue(undefined);

      await storage.set('key', 'value');

      expect(testLogger.errorLogs).toHaveLength(1);
      expect(testLogger.errorLogs[0].message).toContain(
        '[PersistentStorage] Failed to release lock',
      );
      expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
    });

    it('should handle concurrent access with proper locking', async () => {
      mockFsPromises.writeFile.mockResolvedValue(undefined);

      // Simulate concurrent calls
      const promise1 = storage.set('key1', 'value1');
      const promise2 = storage.set('key2', 'value2');

      await Promise.all([promise1, promise2]);

      // Verify lock was acquired for both operations
      expect(mockLockfile.lock).toHaveBeenCalledTimes(2);
      expect(mockRelease).toHaveBeenCalledTimes(2);
    });
  });

  describe('Closing the storage', () => {
    beforeEach(() => {
      storage = new DefaultPersistentStorage(testLogger);
      testLogger.clear();
    });

    it('should mark storage as closed and not initialized', () => {
      expect(storage.isInitialized()).toBe(true);

      storage.close();

      expect(storage.isInitialized()).toBe(false);
      expect(testLogger.infoLogs).toHaveLength(1);
      expect(testLogger.infoLogs[0].message).toContain('[PersistentStorage] Storage closed');
    });
  });
});
