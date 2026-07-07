import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import {
  getInstalledPluginsFilePath,
  getPluginInstallDir,
  getPluginsConfigFilePath,
  getPluginStoreRoot,
} from './plugin_paths';

jest.mock('@gitlab-org/ai-configuration', () => ({
  getDuoConfigDir: jest.fn(),
}));

const mockGetDuoConfigDir = getDuoConfigDir as jest.MockedFunction<typeof getDuoConfigDir>;

describe('plugin/plugin_paths', () => {
  describe('when the Duo config dir resolves', () => {
    beforeEach(() => {
      mockGetDuoConfigDir.mockReturnValue('/home/user/.config/gitlab/duo');
    });

    it('places the plugin store under plugins/', () => {
      expect(getPluginStoreRoot()).toBe('/home/user/.config/gitlab/duo/plugins');
    });

    it('nests an install dir by marketplace/plugin/version', () => {
      expect(getPluginInstallDir('mkt', 'foo', '1.0.0')).toBe(
        '/home/user/.config/gitlab/duo/plugins/mkt/foo/1.0.0',
      );
    });

    it('places the global ledger at the config root', () => {
      expect(getInstalledPluginsFilePath()).toBe(
        '/home/user/.config/gitlab/duo/installed_plugins.json',
      );
    });

    it('places the user plugins.json at the config root', () => {
      expect(getPluginsConfigFilePath('user')).toBe('/home/user/.config/gitlab/duo/plugins.json');
    });

    it('places the project plugins.json under the workspace .gitlab/duo dir', () => {
      expect(getPluginsConfigFilePath('project', '/repo')).toBe('/repo/.gitlab/duo/plugins.json');
    });

    it('places the local plugins.json under the workspace .gitlab/duo dir', () => {
      expect(getPluginsConfigFilePath('local', '/repo')).toBe(
        '/repo/.gitlab/duo/plugins.local.json',
      );
    });

    it('requires a workspace path for project scope', () => {
      expect(() => getPluginsConfigFilePath('project')).toThrow(/workspace path is required/);
    });
  });

  describe('when the Duo config dir cannot be resolved', () => {
    beforeEach(() => {
      mockGetDuoConfigDir.mockReturnValue(undefined);
    });

    it('throws a clear error', () => {
      expect(() => getPluginStoreRoot()).toThrow(/Unable to resolve the Duo config directory/);
    });
  });
});
