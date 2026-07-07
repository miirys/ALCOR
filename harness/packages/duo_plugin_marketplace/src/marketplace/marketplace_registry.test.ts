import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NullLogger } from '@gitlab-org/logging';
import type { KnownMarketplace } from '../schema/known_marketplaces';
import type { MarketplaceCatalog } from '../schema/marketplace_catalog';
import type { KnownMarketplacesStore } from './known_marketplaces_store';
import type { FetchedCatalog, MarketplaceFetcher } from './marketplace_fetcher';
import { DefaultMarketplaceFetcher } from './marketplace_fetcher';
import { DefaultMarketplaceRegistry } from './marketplace_registry';

const catalog: MarketplaceCatalog = {
  name: 'duo-demo',
  owner: { name: 'GitLab' },
  plugins: [{ name: 'gitlab-helper', source: './plugins/gitlab-helper' }],
};

describe('DefaultMarketplaceRegistry', () => {
  let root: string;
  let sourceDir: string;
  let store: KnownMarketplacesStore;
  let fetcher: MarketplaceFetcher;
  let upsert: jest.Mock;
  let load: jest.Mock;
  let fetch: jest.Mock;
  let readInstalledCatalog: jest.Mock;
  let registry: DefaultMarketplaceRegistry;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'registry-test-'));
    // a real existing dir so resolveSource routes it to a directory source
    sourceDir = join(root, 'source');
    await mkdir(sourceDir, { recursive: true });

    upsert = jest.fn();
    load = jest.fn();
    store = { load, get: jest.fn(), upsert };

    const fetched: FetchedCatalog = {
      catalog,
      installLocation: join(root, 'marketplaces', 'duo-demo'),
      installedRevision: 'deadbeefcafe',
    };
    fetch = jest.fn(async () => fetched);
    // readInstalledCatalog is pure disk I/O; delegate to the real implementation so the
    // list tests exercise reading the catalog files they write to disk.
    const realFetcher = new DefaultMarketplaceFetcher(new NullLogger());
    readInstalledCatalog = jest.fn((dir: string) => realFetcher.readInstalledCatalog(dir));
    fetcher = { fetch, readInstalledCatalog };

    registry = new DefaultMarketplaceRegistry(new NullLogger(), store, fetcher);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('when the fetch succeeds', () => {
    it('resolves the source, fetches the catalog, and records the entry', async () => {
      const result = await registry.add(sourceDir);

      expect(fetch).toHaveBeenCalledWith({ source: 'directory', path: sourceDir });
      const marketplace = {
        source: { source: 'directory', path: sourceDir },
        lastUpdated: expect.any(String),
        installLocation: join(root, 'marketplaces', 'duo-demo'),
        installedRevision: 'deadbeefcafe',
      };
      expect(result).toEqual({ name: 'duo-demo', marketplace });
      expect(upsert).toHaveBeenCalledWith('duo-demo', marketplace);
    });
  });

  describe('when the fetch fails', () => {
    beforeEach(() => {
      fetch.mockRejectedValue(new Error('No marketplace.json found'));
    });

    it('does not record the entry', async () => {
      await expect(registry.add(sourceDir)).rejects.toThrow('No marketplace.json found');
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    async function writeCatalogDir(name: string, pluginCount: number): Promise<string> {
      const dir = join(root, 'marketplaces', name);
      await mkdir(dir, { recursive: true });
      const plugins = Array.from({ length: pluginCount }, (_, i) => ({
        name: `plugin-${i}`,
        source: `./plugins/plugin-${i}`,
      }));
      await writeFile(
        join(dir, 'marketplace.json'),
        JSON.stringify({ name, owner: { name: 'GitLab' }, plugins }),
      );
      return dir;
    }

    function knownMarketplace(name: string, installLocation: string): KnownMarketplace {
      return {
        source: { source: 'directory', path: join(root, 'source', name) },
        installLocation,
        lastUpdated: '2026-01-01T00:00:00.000Z',
      };
    }

    describe('when the store is empty', () => {
      it('returns an empty list', async () => {
        load.mockResolvedValue({});

        expect(await registry.list()).toEqual([]);
      });
    });

    describe('when the store has marketplaces', () => {
      it('returns each marketplace with its plugin count read from disk', async () => {
        const oneDir = await writeCatalogDir('one', 1);
        const threeDir = await writeCatalogDir('three', 3);
        const one = knownMarketplace('one', oneDir);
        const three = knownMarketplace('three', threeDir);
        load.mockResolvedValue({ one, three });

        const items = await registry.list();

        expect(items).toEqual([
          { name: 'one', marketplace: one, pluginCount: 1 },
          { name: 'three', marketplace: three, pluginCount: 3 },
        ]);
      });
    });

    describe('when a marketplace catalog cannot be read', () => {
      it('lists it with an undefined plugin count', async () => {
        const goodDir = await writeCatalogDir('good', 2);
        const good = knownMarketplace('good', goodDir);
        const broken = knownMarketplace('broken', join(root, 'marketplaces', 'missing'));
        load.mockResolvedValue({ good, broken });

        const items = await registry.list();

        expect(items).toEqual([
          { name: 'good', marketplace: good, pluginCount: 2 },
          { name: 'broken', marketplace: broken, pluginCount: undefined },
        ]);
      });
    });
  });
});
