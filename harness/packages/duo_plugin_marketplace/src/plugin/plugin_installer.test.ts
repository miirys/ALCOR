import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { NullLogger } from '@gitlab-org/logging';
import type { KnownMarketplace } from '../schema/known_marketplaces';
import { DefaultMarketplaceFetcher } from '../marketplace/marketplace_fetcher';
import { DefaultInstalledPluginsStore } from './installed_plugins_store';
import { DefaultPluginsConfigStore } from './plugins_config_store';
import { DefaultPluginInstaller, UNVERSIONED } from './plugin_installer';
import { DefaultPluginSourceResolver } from './plugin_source_resolver';
import { DefaultSafePluginFs } from './safe_plugin_fs';
import * as paths from './plugin_paths';

jest.mock('./plugin_paths', () => ({
  ...jest.requireActual('./plugin_paths'),
  getPluginStoreRoot: jest.fn(),
  getPluginInstallDir: jest.fn(),
  getInstalledPluginsFilePath: jest.fn(),
  getPluginsConfigFilePath: jest.fn(),
}));

const mockStoreRoot = paths.getPluginStoreRoot as jest.MockedFunction<
  typeof paths.getPluginStoreRoot
>;
const mockInstallDir = paths.getPluginInstallDir as jest.MockedFunction<
  typeof paths.getPluginInstallDir
>;
const mockLedgerPath = paths.getInstalledPluginsFilePath as jest.MockedFunction<
  typeof paths.getInstalledPluginsFilePath
>;
const mockPluginsConfigPath = paths.getPluginsConfigFilePath as jest.MockedFunction<
  typeof paths.getPluginsConfigFilePath
>;

class FakeMarketplacesStore {
  #entries: Record<string, KnownMarketplace> = {};

  add(name: string, entry: KnownMarketplace): void {
    this.#entries[name] = entry;
  }

  async load(): Promise<Record<string, KnownMarketplace>> {
    return this.#entries;
  }

  async get(name: string): Promise<KnownMarketplace | undefined> {
    return this.#entries[name];
  }

  async upsert(): Promise<void> {}
}

async function writeCatalog(
  catalogDir: string,
  plugins: { name: string; source: string; version?: string; defaultEnabled?: boolean }[],
): Promise<void> {
  await mkdir(catalogDir, { recursive: true });
  await writeFile(
    join(catalogDir, 'marketplace.json'),
    JSON.stringify({
      name: 'mkt',
      owner: { name: 'owner' },
      plugins,
    }),
  );
}

describe('DefaultPluginInstaller', () => {
  let root: string;
  let configDir: string;
  let storeRoot: string;
  let catalogDir: string;
  let fakeMarketplaces: FakeMarketplacesStore;
  let installer: DefaultPluginInstaller;

  const marketplaceEntry = (catalogPath: string): KnownMarketplace => ({
    installLocation: catalogPath,
    lastUpdated: '2026-06-25T00:00:00.000Z',
    source: { source: 'directory', path: '/src' },
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'inst-test-'));
    configDir = join(root, 'config');
    storeRoot = join(configDir, 'plugins');
    catalogDir = join(root, 'catalog');
    await mkdir(storeRoot, { recursive: true });

    mockStoreRoot.mockReturnValue(storeRoot);
    mockInstallDir.mockImplementation((mkt, plugin, version) =>
      join(storeRoot, mkt, plugin, version),
    );
    mockLedgerPath.mockReturnValue(join(configDir, 'installed_plugins.json'));
    mockPluginsConfigPath.mockImplementation((scope, workspacePath) => {
      if (scope === 'user') {
        return join(configDir, 'plugins.json');
      }
      const fileName = scope === 'local' ? 'plugins.local.json' : 'plugins.json';
      return join(workspacePath as string, '.gitlab', 'duo', fileName);
    });

    fakeMarketplaces = new FakeMarketplacesStore();
    const logger = new NullLogger();
    installer = new DefaultPluginInstaller(
      logger,
      fakeMarketplaces,
      new DefaultMarketplaceFetcher(logger),
      new DefaultSafePluginFs(logger),
      new DefaultPluginSourceResolver(logger),
      new DefaultInstalledPluginsStore(logger, new FsFileAccessService()),
      new DefaultPluginsConfigStore(logger, new FsFileAccessService()),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('when the plugin has a relative source and a manifest', () => {
    beforeEach(async () => {
      await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
      const pluginDir = join(catalogDir, 'plugins', 'foo');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'plugin.json'),
        JSON.stringify({ name: 'foo', version: '2.0.0' }),
      );
      await writeFile(join(pluginDir, 'README.md'), 'hello');
      fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
    });

    it('copies files, writes the ledger and resolves the manifest version', async () => {
      const result = await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);

      expect(result.id).toBe('foo@mkt');
      expect(result.record.version).toBe('2.0.0');
      expect(result.record.scope).toBe('user');
      expect(result.record.installPath).toBe(join(storeRoot, 'mkt', 'foo', '2.0.0'));

      const copied = await readFile(join(storeRoot, 'mkt', 'foo', '2.0.0', 'README.md'), 'utf8');
      expect(copied).toBe('hello');

      const ledger = JSON.parse(await readFile(join(configDir, 'installed_plugins.json'), 'utf8'));
      expect(ledger.plugins['foo@mkt'][0].version).toBe('2.0.0');

      const pluginsConfig = JSON.parse(await readFile(join(configDir, 'plugins.json'), 'utf8'));
      expect(pluginsConfig.enabledPlugins['foo@mkt']).toBe(true);
    });

    it('writes a .accessed marker into the install dir', async () => {
      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
      await expect(
        stat(join(storeRoot, 'mkt', 'foo', '2.0.0', '.accessed')),
      ).resolves.toBeDefined();
    });

    it('reuses an existing install dir without re-copying', async () => {
      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
      // Remove the ledger so a second install is permitted, but keep the store.
      await rm(join(configDir, 'installed_plugins.json'));
      const sentinel = join(storeRoot, 'mkt', 'foo', '2.0.0', 'sentinel');
      await writeFile(sentinel, 'kept');

      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
      expect(await readFile(sentinel, 'utf8')).toBe('kept');
    });

    it('rejects a second install in the same scope', async () => {
      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
      await expect(
        installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root),
      ).rejects.toThrow(/already installed in user scope/);
    });
  });

  describe('version fallbacks', () => {
    describe('when the plugin has no manifest version', () => {
      it('falls back to the catalog entry version', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './foo', version: '3.1.4' }]);
        await mkdir(join(catalogDir, 'foo'), { recursive: true });
        await writeFile(join(catalogDir, 'foo', 'a.txt'), 'x');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        const result = await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect(result.record.version).toBe('3.1.4');
      });
    });

    describe('when the plugin declares no version anywhere', () => {
      it('uses the "unknown" version segment', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './foo' }]);
        await mkdir(join(catalogDir, 'foo'), { recursive: true });
        await writeFile(join(catalogDir, 'foo', 'a.txt'), 'x');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        const result = await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect(result.record.version).toBe(UNVERSIONED);
        expect(result.record.installPath).toBe(join(storeRoot, 'mkt', 'foo', 'unknown'));
      });
    });
  });

  describe('when the plugin is unversioned', () => {
    beforeEach(async () => {
      await writeCatalog(catalogDir, [{ name: 'foo', source: './foo' }]);
      await mkdir(join(catalogDir, 'foo'), { recursive: true });
      await writeFile(join(catalogDir, 'foo', 'a.txt'), 'x');
      fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
    });

    it('re-copies the install dir from source on every install', async () => {
      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
      // Remove the ledger so a second install is permitted, but keep the store.
      await rm(join(configDir, 'installed_plugins.json'));
      const sentinel = join(storeRoot, 'mkt', 'foo', UNVERSIONED, 'sentinel');
      await writeFile(sentinel, 'kept');

      await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);

      // The stale cache dir was replaced with a fresh copy from source, so the
      // sentinel is gone and the real plugin content is present.
      await expect(stat(sentinel)).rejects.toThrow();
      const copied = await readFile(join(storeRoot, 'mkt', 'foo', UNVERSIONED, 'a.txt'), 'utf8');
      expect(copied).toBe('x');
    });
  });

  describe('error cases', () => {
    describe('when the marketplace is unknown', () => {
      it('errors', async () => {
        await expect(
          installer.install({ plugin: 'foo', marketplace: 'nope' }, 'user', root),
        ).rejects.toThrow('Unknown marketplace "nope". Run: duo plugin marketplace add <source>');
      });
    });

    describe('when the plugin is not in the catalog', () => {
      it('errors and lists available names', async () => {
        await writeCatalog(catalogDir, [{ name: 'bar', source: './bar' }]);
        await mkdir(join(catalogDir, 'bar'), { recursive: true });
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        await expect(
          installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root),
        ).rejects.toThrow('Plugin "foo" not found in marketplace "mkt". Available: bar');
      });
    });

    describe('when the plugin source kind is not yet supported', () => {
      it.each([
        ['github', { source: 'github', repo: 'o/r' }, 'o/r'],
        ['url', { source: 'url', url: 'https://e/p.zip' }, 'https://e/p.zip'],
        [
          'git-subdir',
          { source: 'git-subdir', url: 'https://e/r.git', path: 'p' },
          'https://e/r.git',
        ],
        ['npm', { source: 'npm', package: '@acme/duo-plugin' }, '@acme/duo-plugin'],
      ])('errors for a %s source and writes no partial state', async (kind, source, detail) => {
        await mkdir(catalogDir, { recursive: true });
        await writeFile(
          join(catalogDir, 'marketplace.json'),
          JSON.stringify({
            name: 'mkt',
            owner: { name: 'owner' },
            plugins: [{ name: 'foo', source }],
          }),
        );
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        await expect(
          installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root),
        ).rejects.toThrow(`Plugin source kind "${kind}" (${detail}) is not yet supported`);

        // Resolution fails before any write, so neither the ledger nor the
        // scope's plugins.json should exist.
        await expect(stat(join(configDir, 'installed_plugins.json'))).rejects.toThrow();
        await expect(stat(join(configDir, 'plugins.json'))).rejects.toThrow();
      });
    });
  });

  describe('no partial state on failure', () => {
    describe('when copying the plugin files fails', () => {
      it('does not write the ledger', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
        const pluginDir = join(catalogDir, 'plugins', 'foo');
        await mkdir(pluginDir, { recursive: true });
        await writeFile(
          join(pluginDir, 'plugin.json'),
          JSON.stringify({ name: 'foo', version: '2.0.0' }),
        );
        // Two files but a cap of one forces placePluginFiles to throw mid-copy.
        await writeFile(join(pluginDir, 'a.txt'), 'a');
        await writeFile(join(pluginDir, 'b.txt'), 'b');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        const logger = new NullLogger();
        const cappedFs = new DefaultSafePluginFs(logger);
        const cappedInstaller = new DefaultPluginInstaller(
          logger,
          fakeMarketplaces,
          new DefaultMarketplaceFetcher(logger),
          {
            placePluginFiles: (sourceRoot, destRoot) =>
              cappedFs.placePluginFiles(sourceRoot, destRoot, { maxFiles: 1 }),
            removeFiles: (p) => cappedFs.removeFiles(p),
            listCachedFiles: (d) => cappedFs.listCachedFiles(d),
            assertWithinStore: (d) => cappedFs.assertWithinStore(d),
          },
          new DefaultPluginSourceResolver(logger),
          new DefaultInstalledPluginsStore(logger, new FsFileAccessService()),
          new DefaultPluginsConfigStore(logger, new FsFileAccessService()),
        );

        await expect(
          cappedInstaller.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root),
        ).rejects.toThrow(/maximum file count/);
        await expect(stat(join(configDir, 'installed_plugins.json'))).rejects.toThrow();
      });
    });
  });

  describe('project scope', () => {
    describe('when installing in project scope', () => {
      it('records the global ledger with project scope and the project plugins.json', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
        const pluginDir = join(catalogDir, 'plugins', 'foo');
        await mkdir(pluginDir, { recursive: true });
        await writeFile(
          join(pluginDir, 'plugin.json'),
          JSON.stringify({ name: 'foo', version: '2.0.0' }),
        );
        await writeFile(join(pluginDir, 'README.md'), 'hello');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        const result = await installer.install(
          { plugin: 'foo', marketplace: 'mkt' },
          'project',
          root,
        );

        expect(result.scope).toBe('project');
        // The installed_plugins.json ledger is global regardless of scope.
        const ledger = JSON.parse(
          await readFile(join(configDir, 'installed_plugins.json'), 'utf8'),
        );
        expect(ledger.plugins['foo@mkt'][0].scope).toBe('project');
        expect(ledger.plugins['foo@mkt'][0].version).toBe('2.0.0');
        // Enablement lands in the project-scoped plugins.json under .gitlab/duo.
        const pluginsConfigPath = join(root, '.gitlab', 'duo', 'plugins.json');
        const pluginsConfig = JSON.parse(await readFile(pluginsConfigPath, 'utf8'));
        expect(pluginsConfig.enabledPlugins['foo@mkt']).toBe(true);
        // The shared cache is NOT scoped.
        expect(result.record.installPath).toBe(join(storeRoot, 'mkt', 'foo', '2.0.0'));
      });
    });

    describe('when installing the same plugin in user then project scope', () => {
      it('allows both installs', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
        const pluginDir = join(catalogDir, 'plugins', 'foo');
        await mkdir(pluginDir, { recursive: true });
        await writeFile(
          join(pluginDir, 'plugin.json'),
          JSON.stringify({ name: 'foo', version: '2.0.0' }),
        );
        await writeFile(join(pluginDir, 'README.md'), 'hello');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'project', root);

        const ledger = JSON.parse(
          await readFile(join(configDir, 'installed_plugins.json'), 'utf8'),
        );
        expect(ledger.plugins['foo@mkt']).toHaveLength(2);
        expect(ledger.plugins['foo@mkt'].map((r: { scope: string }) => r.scope)).toEqual([
          'user',
          'project',
        ]);
      });
    });
  });

  describe('defaultEnabled', () => {
    const writePlugin = async (manifest: Record<string, unknown>): Promise<void> => {
      const pluginDir = join(catalogDir, 'plugins', 'foo');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify(manifest));
      await writeFile(join(pluginDir, 'README.md'), 'hello');
    };

    const userConfig = async (): Promise<{ enabledPlugins?: Record<string, boolean> }> =>
      JSON.parse(await readFile(join(configDir, 'plugins.json'), 'utf8'));

    describe('when the marketplace entry sets defaultEnabled false', () => {
      beforeEach(async () => {
        await writeCatalog(catalogDir, [
          { name: 'foo', source: './plugins/foo', defaultEnabled: false },
        ]);
        await writePlugin({ name: 'foo', version: '2.0.0' });
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
      });

      it('records the plugin as disabled', async () => {
        await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect((await userConfig()).enabledPlugins?.['foo@mkt']).toBe(false);
      });
    });

    describe('when only the manifest sets defaultEnabled false', () => {
      beforeEach(async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
        await writePlugin({ name: 'foo', version: '2.0.0', defaultEnabled: false });
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
      });

      it('records the plugin as disabled', async () => {
        await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect((await userConfig()).enabledPlugins?.['foo@mkt']).toBe(false);
      });
    });

    describe('when the entry sets true and the manifest sets false', () => {
      beforeEach(async () => {
        await writeCatalog(catalogDir, [
          { name: 'foo', source: './plugins/foo', defaultEnabled: true },
        ]);
        await writePlugin({ name: 'foo', version: '2.0.0', defaultEnabled: false });
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
      });

      it('lets the entry win and records the plugin as enabled', async () => {
        await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect((await userConfig()).enabledPlugins?.['foo@mkt']).toBe(true);
      });
    });

    describe('when the user already has an explicit setting in another scope', () => {
      describe('and the entry default would disable it', () => {
        beforeEach(async () => {
          await writeCatalog(catalogDir, [
            { name: 'foo', source: './plugins/foo', defaultEnabled: false },
          ]);
          await writePlugin({ name: 'foo', version: '2.0.0' });
          fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

          await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
          await writeFile(
            join(configDir, 'plugins.json'),
            JSON.stringify({ enabledPlugins: { 'foo@mkt': true } }),
          );
        });

        it('preserves the pre-existing enabled choice on a cross-scope install', async () => {
          const projectInstall = await installer.install(
            { plugin: 'foo', marketplace: 'mkt' },
            'project',
            root,
          );
          expect(projectInstall.scope).toBe('project');

          const projectConfigPath = join(root, '.gitlab', 'duo', 'plugins.json');
          const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));
          expect(projectConfig.enabledPlugins['foo@mkt']).toBe(true);
        });
      });

      describe('and the setting lives in a scope narrower than the install target', () => {
        beforeEach(async () => {
          await writeCatalog(catalogDir, [
            { name: 'foo', source: './plugins/foo', defaultEnabled: true },
          ]);
          await writePlugin({ name: 'foo', version: '2.0.0' });
          fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));
          // A repo-local disable: only the project plugins.json has a setting.
          const projectConfigPath = join(root, '.gitlab', 'duo', 'plugins.json');
          await mkdir(dirname(projectConfigPath), { recursive: true });
          await writeFile(
            projectConfigPath,
            JSON.stringify({ enabledPlugins: { 'foo@mkt': false } }),
          );
        });

        it('does not leak the project-scoped disable into a user-scope install', async () => {
          await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);

          expect((await userConfig()).enabledPlugins?.['foo@mkt']).toBe(true);
        });
      });

      describe('and the entry default would enable it', () => {
        beforeEach(async () => {
          await writeCatalog(catalogDir, [
            { name: 'foo', source: './plugins/foo', defaultEnabled: true },
          ]);
          await writePlugin({ name: 'foo', version: '2.0.0' });
          fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

          await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
          await writeFile(
            join(configDir, 'plugins.json'),
            JSON.stringify({ enabledPlugins: { 'foo@mkt': false } }),
          );
        });

        it('preserves the pre-existing disabled choice on a cross-scope install', async () => {
          await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'project', root);

          const projectConfigPath = join(root, '.gitlab', 'duo', 'plugins.json');
          const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));
          expect(projectConfig.enabledPlugins['foo@mkt']).toBe(false);
        });
      });
    });
  });

  describe('version normalisation', () => {
    describe('when the version has semver build metadata', () => {
      it('strips it before using the version as a path segment', async () => {
        await writeCatalog(catalogDir, [{ name: 'foo', source: './plugins/foo' }]);
        const pluginDir = join(catalogDir, 'plugins', 'foo');
        await mkdir(pluginDir, { recursive: true });
        await writeFile(
          join(pluginDir, 'plugin.json'),
          JSON.stringify({ name: 'foo', version: '1.0.0+build.5' }),
        );
        await writeFile(join(pluginDir, 'README.md'), 'hi');
        fakeMarketplaces.add('mkt', marketplaceEntry(catalogDir));

        const result = await installer.install({ plugin: 'foo', marketplace: 'mkt' }, 'user', root);
        expect(result.record.version).toBe('1.0.0');
        expect(result.record.installPath).toBe(join(storeRoot, 'mkt', 'foo', '1.0.0'));
      });
    });
  });
});
