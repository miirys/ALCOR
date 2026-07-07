import type { Logger } from '@gitlab-org/logging';
import type { PersistentStorage } from '@gitlab-org/persistent-storage';
import { PersistentMcpServerApprovalStore } from './persistent_server_approval_store';

const HASH_A = 'aaaa1111';
const HASH_B = 'bbbb2222';

function makeStorage(initial: Record<string, unknown> = {}): jest.Mocked<PersistentStorage> {
  const data: Record<string, unknown> = { ...initial };
  return {
    get: jest.fn(async (key: string) => data[key]),
    set: jest.fn(async (key: string, value: unknown) => {
      data[key] = value;
    }),
    delete: jest.fn(async (key: string) => {
      delete data[key];
    }),
    close: jest.fn(),
    isInitialized: jest.fn(() => true),
    getStoragePath: jest.fn(() => '/tmp/storage.json'),
  } as jest.Mocked<PersistentStorage>;
}

function makeLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

describe('PersistentMcpServerApprovalStore', () => {
  let storage: jest.Mocked<PersistentStorage>;
  let logger: jest.Mocked<Logger>;
  let store: PersistentMcpServerApprovalStore;

  beforeEach(() => {
    storage = makeStorage();
    logger = makeLogger();
    store = new PersistentMcpServerApprovalStore(logger, storage);
  });

  describe('lookup', () => {
    it('returns undefined when no entry exists', async () => {
      const result = await store.lookup(HASH_A);
      expect(result).toBeUndefined();
    });

    it('returns the entry after approve', async () => {
      await store.approve(HASH_A);
      const result = await store.lookup(HASH_A);
      expect(result).toBeDefined();
      expect(result?.decision).toBe('approved');
    });

    it('returns the entry after reject', async () => {
      await store.reject(HASH_A);
      const result = await store.lookup(HASH_A);
      expect(result?.decision).toBe('rejected');
    });
  });

  describe('approve', () => {
    it('persists an approved entry', async () => {
      await store.approve(HASH_A);
      const entry = await store.lookup(HASH_A);

      expect(entry).toMatchObject({ decision: 'approved' });
    });

    it('overwrites a previous rejected entry', async () => {
      await store.reject(HASH_A);
      await store.approve(HASH_A);
      const entry = await store.lookup(HASH_A);
      expect(entry?.decision).toBe('approved');
    });
  });

  describe('reject', () => {
    it('persists a rejected entry', async () => {
      await store.reject(HASH_B);
      const entry = await store.lookup(HASH_B);
      expect(entry?.decision).toBe('rejected');
    });
  });

  describe('revoke', () => {
    it('removes an existing entry', async () => {
      await store.approve(HASH_A);
      await store.revoke(HASH_A);
      const entry = await store.lookup(HASH_A);
      expect(entry).toBeUndefined();
    });

    it('is a no-op when the entry does not exist', async () => {
      await expect(store.revoke('nonexistent')).resolves.toBeUndefined();
    });

    it('does not affect other entries', async () => {
      await store.approve(HASH_A);
      await store.approve(HASH_B);
      await store.revoke(HASH_A);

      expect(await store.lookup(HASH_A)).toBeUndefined();
      expect(await store.lookup(HASH_B)).toBeDefined();
    });
  });

  describe('list', () => {
    it('returns an empty array when no entries exist', async () => {
      const entries = await store.list();
      expect(entries).toEqual([]);
    });

    it('returns all entries with their hashes', async () => {
      await store.approve(HASH_A);
      await store.reject(HASH_B);

      const entries = await store.list();
      expect(entries).toHaveLength(2);

      const hashA = entries.find((e) => e.hash === HASH_A);
      const hashB = entries.find((e) => e.hash === HASH_B);
      expect(hashA?.decision).toBe('approved');
      expect(hashB?.decision).toBe('rejected');
    });
  });

  describe('concurrent writes', () => {
    // Storage whose get/set yield to the event loop, so overlapping
    // read-modify-write operations would race without internal serialization.
    function makeAsyncStorage(): jest.Mocked<PersistentStorage> {
      const data: Record<string, unknown> = {};
      const tick = () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      return {
        get: jest.fn(async (key: string) => {
          await tick();
          return data[key];
        }),
        set: jest.fn(async (key: string, value: unknown) => {
          await tick();
          data[key] = value;
        }),
        delete: jest.fn(async (key: string) => {
          await tick();
          delete data[key];
        }),
        close: jest.fn(),
        isInitialized: jest.fn(() => true),
        getStoragePath: jest.fn(() => '/tmp/storage.json'),
      } as jest.Mocked<PersistentStorage>;
    }

    it('persists every decision when approvals run concurrently', async () => {
      const asyncStore = new PersistentMcpServerApprovalStore(logger, makeAsyncStorage());

      await Promise.all([asyncStore.approve(HASH_A), asyncStore.reject(HASH_B)]);

      expect((await asyncStore.lookup(HASH_A))?.decision).toBe('approved');
      expect((await asyncStore.lookup(HASH_B))?.decision).toBe('rejected');
    });

    it('does not lose earlier writes under many concurrent upserts', async () => {
      const asyncStore = new PersistentMcpServerApprovalStore(logger, makeAsyncStorage());
      const hashes = Array.from({ length: 5 }, (_, i) => `hash-${i}`);

      await Promise.all(hashes.map((hash) => asyncStore.approve(hash)));

      const entries = await asyncStore.list();
      expect(entries).toHaveLength(hashes.length);
    });
  });

  describe('schema versioning', () => {
    it('handles missing mcpApprovals key gracefully (returns empty schema)', async () => {
      // storage.get returns undefined → treated as empty
      const entry = await store.lookup(HASH_A);
      expect(entry).toBeUndefined();
    });

    it('resets and logs a warning on invalid schema', async () => {
      storage.get.mockResolvedValueOnce({ version: 'bad', approvals: 'not-an-object' });
      const entry = await store.lookup(HASH_A);
      expect(entry).toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('preserves unknown fields on write (forward-compat)', async () => {
      // Seed storage with a schema that has an extra unknown field
      const existingSchema = {
        version: 1,
        approvals: {
          [HASH_A]: {
            decision: 'approved',
            futureField: 'preserved',
          },
        },
      };
      storage.get.mockResolvedValue(existingSchema);

      // Approve a different hash — should not disturb HASH_A's futureField
      await store.approve(HASH_B);

      // The written schema should still contain HASH_A with futureField
      const writtenSchema = storage.set.mock.calls[0]?.[1] as {
        approvals: Record<string, unknown>;
      };
      expect((writtenSchema.approvals[HASH_A] as Record<string, unknown>).futureField).toBe(
        'preserved',
      );
    });
  });
});
