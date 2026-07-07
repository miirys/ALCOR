import * as path from 'path';
import * as os from 'node:os';
import {
  getDuoConfigDir,
  getDuoConfigFilePath,
  getTrustedReadableDirectories,
  isContainedIn,
} from './paths';

jest.mock('node:os');

// Mock fs/promises module
jest.mock('fs/promises');

describe('paths utility', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Reset the process.env to a clean state before each test
    jest.resetModules();
    process.env = { ...originalEnv };

    // Ensure tests don't accidentally pick up the developer machine's XDG_CONFIG_HOME.
    // Individual tests set this explicitly when needed.
    delete process.env.XDG_CONFIG_HOME;

    // Default homedir mock
    jest.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    // Restore the original process.env after each test
    process.env = originalEnv;
    // Restore original platform if it was modified
    if (process.platform !== originalPlatform) {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  describe('getDuoConfigDir', () => {
    it('returns undefined when homedir() throws on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      jest.mocked(os.homedir).mockImplementation(() => {
        throw new Error('no home directory');
      });

      expect(getDuoConfigDir()).toBeUndefined();
    });

    it('returns undefined when APPDATA is not set on Windows', () => {
      // Override platform to be Windows
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Clear APPDATA env var
      delete process.env.APPDATA;

      expect(getDuoConfigDir()).toBeUndefined();
    });

    it('returns the correct path on Windows using APPDATA', () => {
      // Override platform to be Windows
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Set APPDATA env var
      process.env.APPDATA = 'C:\\Users\\testuser\\AppData\\Roaming';

      expect(getDuoConfigDir()).toBe(
        path.join('C:\\Users\\testuser\\AppData\\Roaming', 'GitLab', 'duo'),
      );
    });

    it('uses XDG_CONFIG_HOME on Linux when available', () => {
      // Override platform to be Linux
      Object.defineProperty(process, 'platform', { value: 'linux' });

      // Set env vars
      jest.mocked(os.homedir).mockReturnValue('/home/testuser');
      process.env.XDG_CONFIG_HOME = '/home/testuser/.config';

      expect(getDuoConfigDir()).toBe(path.join('/home/testuser/.config', 'gitlab', 'duo'));
    });

    it('respects XDG_CONFIG_HOME even when outside HOME', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      jest.mocked(os.homedir).mockReturnValue('/home/testuser');
      process.env.XDG_CONFIG_HOME = '/my-config';

      expect(getDuoConfigDir()).toBe(path.join('/my-config', 'gitlab', 'duo'));
    });

    it('uses XDG_CONFIG_HOME even when homedir() throws', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      jest.mocked(os.homedir).mockImplementation(() => {
        throw new Error('no home directory');
      });
      process.env.XDG_CONFIG_HOME = '/my-config';

      expect(getDuoConfigDir()).toBe(path.join('/my-config', 'gitlab', 'duo'));
    });

    it('falls back to ~/.gitlab/duo on Linux when XDG_CONFIG_HOME is not set', () => {
      // Override platform to be Linux
      Object.defineProperty(process, 'platform', { value: 'linux' });

      // Set HOME but not XDG_CONFIG_HOME
      jest.mocked(os.homedir).mockReturnValue('/home/testuser');
      delete process.env.XDG_CONFIG_HOME;

      expect(getDuoConfigDir()).toBe(path.join('/home/testuser', '.gitlab', 'duo'));
    });

    it('uses XDG_CONFIG_HOME on macOS when available', () => {
      // Override platform to be macOS
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      // Set env vars
      jest.mocked(os.homedir).mockReturnValue('/Users/testuser');
      process.env.XDG_CONFIG_HOME = '/Users/testuser/.config';

      expect(getDuoConfigDir()).toBe(path.join('/Users/testuser/.config', 'gitlab', 'duo'));
    });

    it('falls back to ~/.gitlab/duo on macOS when XDG_CONFIG_HOME is not set', () => {
      // Override platform to be macOS
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      // Set HOME but not XDG_CONFIG_HOME
      jest.mocked(os.homedir).mockReturnValue('/Users/testuser');
      delete process.env.XDG_CONFIG_HOME;

      expect(getDuoConfigDir()).toBe(path.join('/Users/testuser', '.gitlab', 'duo'));
    });
  });

  describe('getTrustedReadableDirectories', () => {
    it('returns ~/.agents and duo config dir', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      jest.mocked(os.homedir).mockReturnValue('/Users/testuser');
      delete process.env.GLAB_CONFIG_DIR;

      const dirs = getTrustedReadableDirectories();

      expect(dirs).toEqual([
        path.join('/Users/testuser', '.agents'),
        path.join('/Users/testuser', '.gitlab', 'duo'),
      ]);
    });

    it('uses GLAB_CONFIG_DIR when set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      jest.mocked(os.homedir).mockReturnValue('/home/testuser');
      process.env.GLAB_CONFIG_DIR = '/custom/glab';

      const dirs = getTrustedReadableDirectories();

      expect(dirs).toEqual([path.join('/home/testuser', '.agents'), '/custom/glab']);
    });

    it('returns only duo config dir when homedir() throws', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      jest.mocked(os.homedir).mockImplementation(() => {
        throw new Error('no home directory');
      });
      process.env.XDG_CONFIG_HOME = '/xdg-config';

      const dirs = getTrustedReadableDirectories();

      expect(dirs).toEqual([path.join('/xdg-config', 'gitlab', 'duo')]);
    });

    it('returns empty array when no directories can be resolved', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      jest.mocked(os.homedir).mockImplementation(() => {
        throw new Error('no home directory');
      });
      delete process.env.GLAB_CONFIG_DIR;

      const dirs = getTrustedReadableDirectories();

      expect(dirs).toEqual([]);
    });
  });

  describe('getDuoConfigFilePath', () => {
    it('returns undefined when getDuoConfigDir returns undefined', () => {
      // Override platform to be Windows and don't set APPDATA
      Object.defineProperty(process, 'platform', { value: 'win32' });
      delete process.env.APPDATA;

      expect(getDuoConfigFilePath('test.json')).toBeUndefined();
    });

    it('returns the correct file path when getDuoConfigDir returns a path', () => {
      // Override platform to be Linux
      Object.defineProperty(process, 'platform', { value: 'linux' });

      // Set HOME
      jest.mocked(os.homedir).mockReturnValue('/home/testuser');

      expect(getDuoConfigFilePath('test.json')).toBe(
        path.join('/home/testuser', '.gitlab', 'duo', 'test.json'),
      );
    });
  });

  describe('isContainedIn', () => {
    it('returns true for a path inside one of the directories', () => {
      expect(isContainedIn(['/home/a', '/home/b'], '/home/b/skills/x')).toBe(true);
    });

    it('returns true for the directory itself', () => {
      expect(isContainedIn(['/home/a'], '/home/a')).toBe(true);
    });

    it('returns false for a path outside all directories', () => {
      expect(isContainedIn(['/home/a', '/home/b'], '/etc')).toBe(false);
    });

    it('returns false for a sibling that shares a name prefix', () => {
      expect(isContainedIn(['/home/a'], '/home/abc')).toBe(false);
    });

    it('returns false when no directories are given', () => {
      expect(isContainedIn([], '/home/a')).toBe(false);
    });
  });
});
