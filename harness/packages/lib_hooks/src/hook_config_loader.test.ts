import { readFile } from 'fs/promises';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getDuoConfigFilePath } from '@gitlab-org/ai-configuration';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultHookConfigLoader } from './hook_config_loader';

jest.mock('fs/promises');
jest.mock('@gitlab-org/ai-configuration', () => ({
  getDuoConfigFilePath: jest.fn(),
}));
const mockReadFile = jest.mocked(readFile);
const mockGetDuoConfigFilePath = jest.mocked(getDuoConfigFilePath);
const GLOBAL_CONFIG_PATH = '/home/testuser/.gitlab/duo/hooks.json';

describe('DefaultHookConfigLoader', () => {
  let loader: DefaultHookConfigLoader;

  beforeEach(() => {
    mockGetDuoConfigFilePath.mockReturnValue(GLOBAL_CONFIG_PATH);
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    loader = new DefaultHookConfigLoader(new TestLogger());
  });

  describe('when no config exists anywhere', () => {
    it('returns empty hooks config', async () => {
      const config = await loader.load('/test/project');
      expect(config).toEqual({ hooks: {} });
    });
  });

  describe('when global config has hooks', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === GLOBAL_CONFIG_PATH) {
          return JSON.stringify({
            hooks: {
              SessionStart: [{ hooks: [{ type: 'command', command: 'echo global' }] }],
            },
          }) as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('returns global hooks', async () => {
      const config = await loader.load('/test/project');
      expect(config.hooks?.SessionStart).toHaveLength(1);
    });
  });

  describe('when project config has hooks', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === '/test/project/.gitlab/duo/hooks.json') {
          return JSON.stringify({
            hooks: {
              SessionStart: [
                { matcher: 'startup', hooks: [{ type: 'command', command: 'echo project' }] },
              ],
            },
          }) as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('returns project hooks when enableProjectHooks is true', async () => {
      const config = await loader.load('/test/project', { enableProjectHooks: true });
      expect(config.hooks?.SessionStart).toHaveLength(1);
      expect(config.hooks?.SessionStart?.[0].matcher).toBe('startup');
    });

    it('ignores project hooks when enableProjectHooks is false (default)', async () => {
      const config = await loader.load('/test/project');
      expect(config.hooks?.SessionStart).toBeUndefined();
    });
  });

  describe('when both global and project config have hooks for the same event', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === GLOBAL_CONFIG_PATH) {
          return JSON.stringify({
            hooks: {
              SessionStart: [{ hooks: [{ type: 'command', command: 'echo global' }] }],
            },
          }) as never;
        }
        if (path === '/test/project/.gitlab/duo/hooks.json') {
          return JSON.stringify({
            hooks: {
              SessionStart: [
                { matcher: 'startup', hooks: [{ type: 'command', command: 'echo project' }] },
              ],
            },
          }) as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('merges both configs when enableProjectHooks is true', async () => {
      const config = await loader.load('/test/project', { enableProjectHooks: true });
      expect(config.hooks?.SessionStart).toHaveLength(2);
    });

    it('returns only global hooks when enableProjectHooks is false (default)', async () => {
      const config = await loader.load('/test/project');
      expect(config.hooks?.SessionStart).toHaveLength(1);
    });
  });

  describe('when config has invalid hook entries', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === GLOBAL_CONFIG_PATH) {
          return JSON.stringify({
            hooks: {
              SessionStart: [
                { hooks: [{ type: 'invalid', command: 'echo bad' }] },
                { hooks: [{ type: 'command', command: 'echo good' }] },
              ],
            },
          }) as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('filters out invalid hooks and keeps valid ones', async () => {
      const config = await loader.load('/test/project');
      expect(config.hooks?.SessionStart).toHaveLength(1);
    });
  });

  describe('when global config file has parse error', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === GLOBAL_CONFIG_PATH) {
          return 'not valid json' as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('returns empty config without throwing', async () => {
      const config = await loader.load('/test/project');
      expect(config).toEqual({ hooks: {} });
    });
  });

  describe('when cwd changes between calls', () => {
    beforeEach(() => {
      mockReadFile.mockImplementation(async (path: unknown) => {
        if (path === '/project-a/.gitlab/duo/hooks.json') {
          return JSON.stringify({
            hooks: {
              SessionStart: [{ hooks: [{ type: 'command', command: 'echo a' }] }],
            },
          }) as never;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    });

    it('loads config from the correct project directory when enableProjectHooks is true', async () => {
      const configA = await loader.load('/project-a', { enableProjectHooks: true });
      const configB = await loader.load('/project-b', { enableProjectHooks: true });

      expect(configA.hooks?.SessionStart).toHaveLength(1);
      expect(configB.hooks?.SessionStart).toBeUndefined();
    });
  });

  describe('when global config path uses getDuoConfigFilePath', () => {
    it('reads from the path returned by getDuoConfigFilePath', async () => {
      await loader.load('/test/project');
      expect(mockGetDuoConfigFilePath).toHaveBeenCalledWith('hooks.json');
      expect(mockReadFile).toHaveBeenCalledWith(GLOBAL_CONFIG_PATH, 'utf8');
    });

    it('returns empty config when getDuoConfigFilePath returns undefined', async () => {
      mockGetDuoConfigFilePath.mockReturnValue(undefined);
      const config = await loader.load('/test/project');
      expect(config).toEqual({ hooks: {} });
    });
  });
});
