import { tmpdir } from 'node:os';
import { join } from 'path';
import { rmSync, existsSync, writeFileSync, statSync } from 'fs';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultPersistentStorage } from '@gitlab-org/persistent-storage';

describe('Persistent Storage', () => {
  let storage: DefaultPersistentStorage;
  let testLogger: TestLogger;
  let tempDir: string;
  let storageDir: string;
  let storageFile: string;

  beforeAll(() => {
    // Create a unique temporary directory for this test run
    tempDir = join(tmpdir(), `gitlab-lsp-integration-test-${Date.now()}`);
    storageDir = join(tempDir, '.gitlab');
    storageFile = join(storageDir, 'storage.json');
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any existing test directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    testLogger = new TestLogger();

    // Mock homedir to use our temp directory
    jest.spyOn(require('node:os'), 'homedir').mockReturnValue(tempDir);
  });

  afterEach(() => {
    if (storage) {
      storage.close();
    }
    testLogger.clear();
    jest.restoreAllMocks();
  });

  it('should create storage directory and file on first use', () => {
    storage = new DefaultPersistentStorage(testLogger);

    expect(storage.isInitialized()).toBe(true);
    expect(existsSync(storageDir)).toBe(true);
    expect(existsSync(storageFile)).toBe(true);
  });

  it('should persist and retrieve values across instances', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const testKey = 'test:key';
    const testValue = { enabled: true };

    // Set value in first instance
    await storage.set(testKey, testValue);
    storage.close();

    // Create new instance and verify value persists
    const newStorage = new DefaultPersistentStorage(testLogger);
    const retrievedValue = await newStorage.get(testKey);
    expect(retrievedValue).toEqual(testValue);
    newStorage.close();
  });

  it('should handle multiple keys independently', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const key1 = 'user1:client1:setting';
    const key2 = 'user1:client2:setting';
    const key3 = 'user2:client1:setting';

    const value1 = { enabled: true };
    const value2 = { enabled: false };
    const value3 = { enabled: true };

    // Set values for different keys
    await storage.set(key1, value1);
    await storage.set(key2, value2);
    await storage.set(key3, value3);

    // Verify all values are stored independently
    expect(await storage.get(key1)).toEqual(value1);
    expect(await storage.get(key2)).toEqual(value2);
    expect(await storage.get(key3)).toEqual(value3);
  });

  it('should delete values permanently', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const testKey = 'test:delete:key';
    const testValue = { enabled: true };

    // Set and verify value exists
    await storage.set(testKey, testValue);
    expect(await storage.get(testKey)).toEqual(testValue);

    // Delete value
    await storage.delete(testKey);
    expect(await storage.get(testKey)).toBeUndefined();

    // Verify deletion persists across instances
    storage.close();
    const newStorage = new DefaultPersistentStorage(testLogger);
    expect(await newStorage.get(testKey)).toBeUndefined();
    newStorage.close();
  });

  it('should handle various file corruption scenarios gracefully', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const testKey = 'test:corruption:key';
    const testValue = { enabled: true };

    // Set initial value
    await storage.set(testKey, testValue);
    storage.close();

    // Test 1: Invalid JSON
    writeFileSync(storageFile, 'invalid-json', 'utf8');
    let recoveredStorage = new DefaultPersistentStorage(testLogger);
    expect(await recoveredStorage.get(testKey)).toBeUndefined();
    await recoveredStorage.set(testKey, { enabled: false });
    expect(await recoveredStorage.get(testKey)).toEqual({ enabled: false });
    recoveredStorage.close();

    // Test 2: Partial/truncated JSON
    writeFileSync(storageFile, '{"incomplete":', 'utf8');
    recoveredStorage = new DefaultPersistentStorage(testLogger);
    expect(await recoveredStorage.get(testKey)).toBeUndefined();
    await recoveredStorage.set(testKey, { enabled: true });
    expect(await recoveredStorage.get(testKey)).toEqual({ enabled: true });
    recoveredStorage.close();

    // Test 3: Empty file
    writeFileSync(storageFile, '', 'utf8');
    recoveredStorage = new DefaultPersistentStorage(testLogger);
    expect(await recoveredStorage.get(testKey)).toBeUndefined();
    await recoveredStorage.set(testKey, { enabled: false });
    expect(await recoveredStorage.get(testKey)).toEqual({ enabled: false });

    // Verify the file now contains valid JSON after recovery
    const rawContent = require('fs').readFileSync(storageFile, 'utf8');
    expect(() => JSON.parse(rawContent)).not.toThrow();
    recoveredStorage.close();
  });

  it('should maintain data integrity with mixed and sequential operations', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const key1 = 'test:mixed:key1';
    const key2 = 'test:mixed:key2';

    // Test mixed operations on different keys
    await storage.set(key1, { enabled: true });
    await storage.set(key2, { enabled: false });

    expect(await storage.get(key1)).toEqual({ enabled: true });
    expect(await storage.get(key2)).toEqual({ enabled: false });

    // Test sequential operations (including potential lock conflicts)
    await storage.set(key1, { enabled: false });
    await storage.set(key1, { enabled: true });
    await storage.delete(key1);
    await storage.set(key1, { enabled: false });

    expect(await storage.get(key1)).toEqual({ enabled: false });
    expect(await storage.get(key2)).toEqual({ enabled: false });

    // Verify persistence across instances
    storage.close();
    const newStorage = new DefaultPersistentStorage(testLogger);
    expect(await newStorage.get(key1)).toEqual({ enabled: false });
    expect(await newStorage.get(key2)).toEqual({ enabled: false });
    newStorage.close();
  });

  it('should set restrictive file permissions on creation', () => {
    storage = new DefaultPersistentStorage(testLogger);

    expect(storage.isInitialized()).toBe(true);
    expect(existsSync(storageFile)).toBe(true);

    // On Windows, chmod only affects the read-only flag, not ACLs.
    // This mask ensures we test actual permissions on Unix,
    // and at least verify the file is writable on Windows.
    const mask = process.platform === 'win32' ? 0o700 : 0o777;
    const stats = statSync(storageFile);
    // eslint-disable-next-line no-bitwise
    expect(stats.mode & mask).toBe(0o600);
  });

  it('should set restrictive file permissions when recreating corrupted file', async () => {
    storage = new DefaultPersistentStorage(testLogger);
    const testKey = 'test:permissions:key';

    // Corrupt the file
    storage.close();
    writeFileSync(storageFile, 'invalid-json', 'utf8');

    // Create new instance which should recreate the file
    const newStorage = new DefaultPersistentStorage(testLogger);
    await newStorage.get(testKey); // This triggers file recreation

    // On Windows, chmod only affects the read-only flag, not ACLs.
    // This mask ensures we test actual permissions on Unix,
    // and at least verify the file is writable on Windows.
    const mask = process.platform === 'win32' ? 0o700 : 0o777;
    const stats = statSync(storageFile);
    // eslint-disable-next-line no-bitwise
    expect(stats.mode & mask).toBe(0o600);

    newStorage.close();
  });
});
