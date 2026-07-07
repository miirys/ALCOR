import { NullLogger } from '@gitlab-org/logging';
import type { InstalledPlugin } from '../schema/installed_plugins';
import type { PluginsConfigFile } from '../schema/plugins';
import type { InstalledPluginsStore } from './installed_plugins_store';
import type { PluginsConfigStore } from './plugins_config_store';
import { DefaultPluginRegistry } from './plugin_registry';

function makeRecord(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    scope: 'user',
    version: '1.0.0',
    installPath: '/path/to/plugin',
    installedAt: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeConfig(enabledPlugins?: Record<string, boolean>): PluginsConfigFile {
  return enabledPlugins ? { enabledPlugins } : {};
}

describe('DefaultPluginRegistry', () => {
  let store: InstalledPluginsStore;
  let config: PluginsConfigStore;
  let storeLoad: jest.Mock;
  let configLoad: jest.Mock;
  let registry: DefaultPluginRegistry;

  beforeEach(() => {
    storeLoad = jest.fn();
    configLoad = jest.fn();
    store = { load: storeLoad, get: jest.fn(), upsert: jest.fn(), save: jest.fn() };
    config = { load: configLoad, setEnabled: jest.fn(), getExistingEnabledSetting: jest.fn() };
    registry = new DefaultPluginRegistry(new NullLogger(), store, config);
  });

  describe('list', () => {
    describe('when the ledger is empty', () => {
      it('returns an empty array', async () => {
        storeLoad.mockResolvedValue({});
        expect(await registry.list()).toEqual([]);
        expect(configLoad).not.toHaveBeenCalled();
      });
    });

    describe('when a single plugin is installed and enabled in config', () => {
      it('returns it with enabled: true', async () => {
        storeLoad.mockResolvedValue({ 'p@m': [makeRecord()] });
        configLoad.mockResolvedValue(makeConfig({ 'p@m': true }));

        const result = await registry.list();

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: 'p@m', scope: 'user', enabled: true });
      });
    });

    describe('when the id is absent from the config map', () => {
      it('defaults enabled to true', async () => {
        storeLoad.mockResolvedValue({ 'p@m': [makeRecord()] });
        configLoad.mockResolvedValue(makeConfig());

        const result = await registry.list();

        expect(result[0].enabled).toBe(true);
      });
    });

    describe('when a plugin is explicitly disabled', () => {
      it('returns enabled: false', async () => {
        storeLoad.mockResolvedValue({ 'p@m': [makeRecord()] });
        configLoad.mockResolvedValue(makeConfig({ 'p@m': false }));

        const result = await registry.list();

        expect(result[0].enabled).toBe(false);
      });
    });

    describe('when plugins span multiple scopes', () => {
      it('returns all plugins ordered by scope then id, loading config once per scope', async () => {
        storeLoad.mockResolvedValue({
          'a@m': [makeRecord({ scope: 'user' }), makeRecord({ scope: 'project' })],
        });
        configLoad
          .mockResolvedValueOnce(makeConfig({ 'a@m': true }))
          .mockResolvedValueOnce(makeConfig({ 'a@m': false }));

        const result = await registry.list();

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ id: 'a@m', scope: 'user', enabled: true });
        expect(result[1]).toMatchObject({ id: 'a@m', scope: 'project', enabled: false });
        expect(configLoad).toHaveBeenCalledTimes(2);
        expect(configLoad).toHaveBeenCalledWith('user', undefined);
        expect(configLoad).toHaveBeenCalledWith('project', undefined);
      });
    });

    describe('sort order', () => {
      it('returns user → project → local, id-ascending within each scope', async () => {
        storeLoad.mockResolvedValue({
          'z@m': [makeRecord({ scope: 'user' })],
          'a@m': [makeRecord({ scope: 'local' }), makeRecord({ scope: 'user' })],
          'm@m': [makeRecord({ scope: 'project' })],
        });
        configLoad.mockResolvedValue(makeConfig());

        const result = await registry.list();

        expect(result.map((p) => `${p.scope}:${p.id}`)).toEqual([
          'user:a@m',
          'user:z@m',
          'project:m@m',
          'local:a@m',
        ]);
      });
    });

    describe('when workspacePath is provided', () => {
      it('passes it through to config.load for project/local scopes', async () => {
        storeLoad.mockResolvedValue({ 'p@m': [makeRecord({ scope: 'project' })] });
        configLoad.mockResolvedValue(makeConfig());

        await registry.list({ workspacePath: '/ws' });

        expect(configLoad).toHaveBeenCalledWith('project', '/ws');
      });
    });

    describe('when config.load throws for project scope (no workspacePath)', () => {
      it('defaults to enabled: true and logs a warning, does not throw', async () => {
        storeLoad.mockResolvedValue({ 'p@m': [makeRecord({ scope: 'project' })] });
        configLoad.mockRejectedValue(
          new Error('A workspace path is required to resolve the project plugins.json'),
        );

        const result = await registry.list();

        expect(result).toHaveLength(1);
        expect(result[0].enabled).toBe(true);
      });
    });

    describe('when config.load throws for one scope but succeeds for another', () => {
      it('keeps the good scope result and defaults the throwing scope to enabled: true', async () => {
        storeLoad.mockResolvedValue({
          'p@m': [makeRecord({ scope: 'user' }), makeRecord({ scope: 'project' })],
        });
        configLoad
          .mockResolvedValueOnce(makeConfig({ 'p@m': false })) // user: disabled
          .mockRejectedValueOnce(new Error('path required')); // project: throws

        const result = await registry.list();

        const userPlugin = result.find((p) => p.scope === 'user');
        const projectPlugin = result.find((p) => p.scope === 'project');
        expect(userPlugin?.enabled).toBe(false);
        expect(projectPlugin?.enabled).toBe(true);
      });
    });

    describe('when config.load throws synchronously-style (rejects) for project/local', () => {
      it('treats enabled as true and warns, one per scope', async () => {
        storeLoad.mockResolvedValue({
          'a@m': [makeRecord({ scope: 'project' })],
          'b@m': [makeRecord({ scope: 'project' })],
        });
        // same scope — only called once (cached)
        configLoad.mockRejectedValue(new Error('path required'));

        const result = await registry.list();

        expect(result).toHaveLength(2);
        result.forEach((p) => expect(p.enabled).toBe(true));
        // config.load is only called once per distinct scope
        expect(configLoad).toHaveBeenCalledTimes(1);
      });
    });

    describe('when all fields from the ledger record are mapped', () => {
      it('returns all ListedPlugin fields', async () => {
        const record = makeRecord({
          scope: 'user',
          version: '2.3.4',
          installPath: '/store/path',
          installedAt: '2026-06-29T07:21:53.089Z',
          lastUpdated: '2026-06-29T08:00:00.000Z',
        });
        storeLoad.mockResolvedValue({ 'gitlab-helper@duo-demo': [record] });
        configLoad.mockResolvedValue(makeConfig());

        const result = await registry.list();

        expect(result[0]).toEqual({
          id: 'gitlab-helper@duo-demo',
          version: '2.3.4',
          scope: 'user',
          enabled: true,
          installPath: '/store/path',
          installedAt: '2026-06-29T07:21:53.089Z',
          lastUpdated: '2026-06-29T08:00:00.000Z',
        });
      });
    });
  });
});
