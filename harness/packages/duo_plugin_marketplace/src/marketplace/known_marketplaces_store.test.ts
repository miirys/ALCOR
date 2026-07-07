import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { NullLogger } from '@gitlab-org/logging';
import type { KnownMarketplace } from '../schema/known_marketplaces';
import { DefaultKnownMarketplacesStore } from './known_marketplaces_store';
import * as paths from './paths';

jest.mock('./paths', () => ({
  ...jest.requireActual('./paths'),
  getKnownMarketplacesFilePath: jest.fn(),
}));

const mockGetPath = paths.getKnownMarketplacesFilePath as jest.MockedFunction<
  typeof paths.getKnownMarketplacesFilePath
>;

const entry: KnownMarketplace = {
  lastUpdated: '2026-06-25T00:00:00.000Z',
  installLocation: '/some/marketplaces/duo-demo',
  source: { source: 'directory', path: '/some/path' },
};

describe('DefaultKnownMarketplacesStore', () => {
  let dir: string;
  let filePath: string;
  let store: DefaultKnownMarketplacesStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kms-test-'));
    filePath = join(dir, 'nested', 'known_marketplaces.json');
    mockGetPath.mockReturnValue(filePath);
    store = new DefaultKnownMarketplacesStore(new NullLogger(), new FsFileAccessService());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('when the file does not exist', () => {
    it('returns an empty registry', async () => {
      expect(await store.load()).toEqual({});
    });
  });

  describe('when an entry is upserted', () => {
    beforeEach(async () => {
      await store.upsert('duo-demo', entry);
    });

    it('round-trips the entry', async () => {
      expect(await store.load()).toEqual({ 'duo-demo': entry });
    });

    it('looks up a single entry by name', async () => {
      expect(await store.get('duo-demo')).toEqual(entry);
      expect(await store.get('missing')).toBeUndefined();
    });

    it('writes the file 0600 and its dir 0700', async () => {
      const fileStat = await stat(filePath);
      const dirStat = await stat(join(dir, 'nested'));
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(fileStat.mode & 0o777).toBe(0o600);
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(dirStat.mode & 0o777).toBe(0o700);
    });
  });

  describe('when the file and dir already exist with permissive modes', () => {
    it('tightens them to 0600 and 0700 on upsert', async () => {
      const nestedDir = join(dir, 'nested');
      await mkdir(nestedDir, { recursive: true, mode: 0o755 });
      await chmod(nestedDir, 0o755);
      await writeFile(filePath, '{}\n', { mode: 0o644 });
      await chmod(filePath, 0o644);

      await store.upsert('duo-demo', entry);

      const fileStat = await stat(filePath);
      const dirStat = await stat(nestedDir);
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(fileStat.mode & 0o777).toBe(0o600);
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(dirStat.mode & 0o777).toBe(0o700);
    });
  });

  describe('when an existing entry is re-upserted with the same name', () => {
    it('replaces the entry', async () => {
      await store.upsert('duo-demo', entry);
      const updated: KnownMarketplace = { ...entry, lastUpdated: '2026-07-01T00:00:00.000Z' };
      await store.upsert('duo-demo', updated);
      const loaded = await store.load();
      expect(Object.keys(loaded)).toHaveLength(1);
      expect(loaded['duo-demo'].lastUpdated).toBe('2026-07-01T00:00:00.000Z');
    });
  });

  describe('when the file is corrupt', () => {
    it('throws a clear error instead of dropping data', async () => {
      await writeFile(filePath.replace('nested/', ''), '{ not valid json', 'utf-8');
      mockGetPath.mockReturnValue(filePath.replace('nested/', ''));
      await expect(store.load()).rejects.toThrow();
    });
  });
});
