import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { NullLogger } from '@gitlab-org/logging';
import { DefaultPluginsConfigStore } from './plugins_config_store';
import * as paths from './plugin_paths';
import type { PluginScope } from './plugin_paths';

jest.mock('./plugin_paths', () => ({
  ...jest.requireActual('./plugin_paths'),
  getPluginsConfigFilePath: jest.fn(),
}));

const mockGetPath = paths.getPluginsConfigFilePath as jest.MockedFunction<
  typeof paths.getPluginsConfigFilePath
>;

describe('DefaultPluginsConfigStore', () => {
  let dir: string;
  let filePath: string;
  let store: DefaultPluginsConfigStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pcs-test-'));
    filePath = join(dir, 'nested', 'plugins.json');
    mockGetPath.mockImplementation((scope, workspacePath) => {
      if (scope === 'user' || !workspacePath) {
        return filePath;
      }
      const fileName = scope === 'local' ? 'plugins.local.json' : 'plugins.json';
      return join(workspacePath, '.gitlab', 'duo', fileName);
    });
    store = new DefaultPluginsConfigStore(new NullLogger(), new FsFileAccessService());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('when the file does not exist', () => {
    it('returns an empty config', async () => {
      expect(await store.load('user')).toEqual({});
    });
  });

  describe('when enablement is recorded', () => {
    it('round-trips it', async () => {
      await store.setEnabled('foo@mkt', true, 'user');
      expect(await store.load('user')).toEqual({ enabledPlugins: { 'foo@mkt': true } });
    });

    it('preserves other enabled plugins when setting another', async () => {
      await store.setEnabled('foo@mkt', true, 'user');
      await store.setEnabled('bar@mkt', false, 'user');
      expect((await store.load('user')).enabledPlugins).toEqual({
        'foo@mkt': true,
        'bar@mkt': false,
      });
    });

    it('writes the file 0600 and its dir 0700', async () => {
      await store.setEnabled('foo@mkt', true, 'user');
      const fileStat = await stat(filePath);
      const dirStat = await stat(join(dir, 'nested'));
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(fileStat.mode & 0o777).toBe(0o600);
      // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
      expect(dirStat.mode & 0o777).toBe(0o700);
    });
  });

  describe('when the file shape is invalid', () => {
    it('throws a schema error', async () => {
      const badPath = join(dir, 'bad.json');
      await writeFile(badPath, JSON.stringify({ enabledPlugins: { 'foo@mkt': 'nope' } }), 'utf-8');
      mockGetPath.mockReturnValue(badPath);
      await expect(store.load('user')).rejects.toThrow(/plugins\.json is invalid/);
    });
  });

  describe('getExistingEnabledSetting', () => {
    let workspacePath: string;

    const writeScopeConfig = async (
      scope: PluginScope,
      enabledPlugins: Record<string, boolean>,
    ): Promise<void> => {
      const scopePath = paths.getPluginsConfigFilePath(scope, workspacePath);
      await mkdir(dirname(scopePath), { recursive: true });
      await writeFile(scopePath, JSON.stringify({ enabledPlugins }), 'utf-8');
    };

    beforeEach(() => {
      workspacePath = join(dir, 'workspace');
    });

    describe('when no scope has the setting', () => {
      it('returns undefined', async () => {
        expect(
          await store.getExistingEnabledSetting('foo@mkt', 'local', workspacePath),
        ).toBeUndefined();
      });
    });

    describe('when only the user scope has it', () => {
      beforeEach(async () => {
        await writeScopeConfig('user', { 'foo@mkt': false });
      });

      it('returns that value when called without a workspacePath', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'user')).toBe(false);
      });

      it('returns that value for a narrower target scope', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'project', workspacePath)).toBe(
          false,
        );
      });
    });

    describe('when set in multiple scopes', () => {
      beforeEach(async () => {
        await writeScopeConfig('user', { 'foo@mkt': true });
        await writeScopeConfig('project', { 'foo@mkt': false });
        await writeScopeConfig('local', { 'foo@mkt': true });
      });

      it('returns the local-scope winner for a local target', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'local', workspacePath)).toBe(true);
      });

      it('never consults scopes narrower than the target', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'project', workspacePath)).toBe(
          false,
        );
        expect(await store.getExistingEnabledSetting('foo@mkt', 'user', workspacePath)).toBe(true);
      });
    });

    describe('when set in project and user but not local', () => {
      beforeEach(async () => {
        await writeScopeConfig('user', { 'foo@mkt': true });
        await writeScopeConfig('project', { 'foo@mkt': false });
      });

      it('returns the project-scope winner over user for a local target', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'local', workspacePath)).toBe(
          false,
        );
      });
    });

    describe('when only workspace scopes have the setting', () => {
      beforeEach(async () => {
        await writeScopeConfig('project', { 'foo@mkt': false });
        await writeScopeConfig('local', { 'foo@mkt': false });
      });

      it('returns undefined for a user target so the workspace setting cannot leak globally', async () => {
        expect(
          await store.getExistingEnabledSetting('foo@mkt', 'user', workspacePath),
        ).toBeUndefined();
      });
    });

    describe('when called without a workspacePath', () => {
      beforeEach(async () => {
        await writeScopeConfig('project', { 'foo@mkt': false });
        await writeScopeConfig('local', { 'foo@mkt': false });
      });

      it('ignores project and local scopes and returns undefined', async () => {
        expect(await store.getExistingEnabledSetting('foo@mkt', 'local')).toBeUndefined();
      });
    });
  });
});
