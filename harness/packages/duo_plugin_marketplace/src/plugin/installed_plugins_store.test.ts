import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { NullLogger } from '@gitlab-org/logging';
import type { InstalledPlugin } from '../schema/installed_plugins';
import { DefaultInstalledPluginsStore } from './installed_plugins_store';
import * as paths from './plugin_paths';

jest.mock('./plugin_paths', () => ({
  ...jest.requireActual('./plugin_paths'),
  getInstalledPluginsFilePath: jest.fn(),
}));

const mockGetPath = paths.getInstalledPluginsFilePath as jest.MockedFunction<
  typeof paths.getInstalledPluginsFilePath
>;

const record: InstalledPlugin = {
  installedAt: '2026-06-25T00:00:00.000Z',
  installPath: '/some/plugins/mkt/foo/1.0.0',
  lastUpdated: '2026-06-25T00:00:00.000Z',
  scope: 'user',
  version: '1.0.0',
};

describe('DefaultInstalledPluginsStore', () => {
  let dir: string;
  let filePath: string;
  let store: DefaultInstalledPluginsStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ips-test-'));
    filePath = join(dir, 'nested', 'installed_plugins.json');
    mockGetPath.mockReturnValue(filePath);
    store = new DefaultInstalledPluginsStore(new NullLogger(), new FsFileAccessService());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('when the file does not exist', () => {
    it('returns an empty ledger', async () => {
      expect(await store.load()).toEqual({});
    });
  });

  describe('when a record is upserted', () => {
    beforeEach(async () => {
      await store.upsert('foo@mkt', record);
    });

    it('round-trips the record', async () => {
      expect(await store.load()).toEqual({ 'foo@mkt': [record] });
    });

    it('looks up a single record by id and scope', async () => {
      expect(await store.get('foo@mkt', 'user')).toEqual(record);
      expect(await store.get('foo@mkt', 'project')).toBeUndefined();
      expect(await store.get('missing@mkt', 'user')).toBeUndefined();
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

  describe('when a second scope is upserted for the same id', () => {
    it('appends it as a separate array entry', async () => {
      const projectRecord: InstalledPlugin = { ...record, scope: 'project' };
      await store.upsert('foo@mkt', record);
      await store.upsert('foo@mkt', projectRecord);
      expect(await store.load()).toEqual({ 'foo@mkt': [record, projectRecord] });
    });
  });

  describe('when an existing record for the same scope is upserted', () => {
    it('replaces it', async () => {
      const updated: InstalledPlugin = { ...record, version: '2.0.0' };
      await store.upsert('foo@mkt', record);
      await store.upsert('foo@mkt', updated);
      expect(await store.load()).toEqual({ 'foo@mkt': [updated] });
    });
  });

  describe('when the file shape is invalid', () => {
    it('throws a schema error', async () => {
      const badPath = join(dir, 'bad.json');
      await writeFile(badPath, JSON.stringify({ version: 2 }), 'utf-8');
      mockGetPath.mockReturnValue(badPath);
      await expect(store.load()).rejects.toThrow(/installed_plugins\.json is invalid/);
    });
  });
});
