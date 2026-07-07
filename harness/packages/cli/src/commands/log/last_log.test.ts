import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const testLogDir = path.join(os.tmpdir(), 'gitlab-duo-cli-test-prune');

jest.unstable_mockModule('./utils', () => ({
  getCliLogDir: () => testLogDir,
}));

const spawnMock = jest.fn(() => new EventEmitter());

jest.unstable_mockModule('child_process', () => ({
  spawn: spawnMock,
}));

const { pruneOldLogFiles, listLogFiles, clearLogFiles, openLastLogFile } = await import(
  './last_log'
);

/**
 * Override `process.platform` for a test. Returns a restore function.
 * `process.platform` is a non-writable getter, so it must be redefined.
 */
const setPlatform = (platform: NodeJS.Platform) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  };
};

const createTestFile = (filename: string, ageInDays: number = 0) => {
  const filePath = path.join(testLogDir, filename);
  fs.writeFileSync(filePath, 'test content');
  const mtime = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
};

describe('last_log', () => {
  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe('pruneOldLogFiles', () => {
    describe('when log directory exists', () => {
      it('deletes files older than 28 days', () => {
        const oldFile = createTestFile('old-log.log', 30);
        const recentFile = createTestFile('recent-log.log', 7);

        pruneOldLogFiles();

        expect(fs.existsSync(oldFile)).toBe(false);
        expect(fs.existsSync(recentFile)).toBe(true);
      });

      it('keeps files at the 28 day boundary', () => {
        // Use 27.99 days to avoid race condition where milliseconds elapse
        // between file creation and cutoff calculation
        const boundaryFile = createTestFile('boundary-log.log', 27.99);

        pruneOldLogFiles();

        expect(fs.existsSync(boundaryFile)).toBe(true);
      });

      it('handles empty log directory', () => {
        expect(() => pruneOldLogFiles()).not.toThrow();
      });

      it('silently ignores file deletion errors', () => {
        const oldFile = createTestFile('old-log.log', 30);
        jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
          throw new Error('Permission denied');
        });

        expect(() => pruneOldLogFiles()).not.toThrow();
        jest.restoreAllMocks();
        expect(fs.existsSync(oldFile)).toBe(true);
      });
    });

    describe('when log directory does not exist', () => {
      beforeEach(() => {
        jest.unstable_mockModule('./utils', () => ({
          getCliLogDir: () => '/nonexistent/path/eggplant/ring/knife',
        }));
      });

      it('handles gracefully', async () => {
        const { pruneOldLogFiles: pruneWithBadDir } = await import('./last_log');
        expect(() => pruneWithBadDir()).not.toThrow();
      });
    });
  });

  describe('listLogFiles', () => {
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('lists log files to console', () => {
      createTestFile('log1.log', 1);
      createTestFile('log2.log', 2);

      listLogFiles();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('log1.log'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('log2.log'));
    });

    it('shows message when no log files exist', () => {
      listLogFiles();

      expect(consoleLogSpy).toHaveBeenCalledWith('No log files found in:', testLogDir);
    });
  });

  describe('openLastLogFile', () => {
    let restorePlatform: () => void;

    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      restorePlatform = () => {};
    });

    afterEach(() => {
      restorePlatform();
      delete process.env.EDITOR;
    });

    it('opens the most recent log file with the configured EDITOR', () => {
      createTestFile('older.log', 2);
      const newest = createTestFile('newest.log', 1);
      restorePlatform = setPlatform('linux');
      process.env.EDITOR = 'nano';

      openLastLogFile();

      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(spawnMock).toHaveBeenCalledWith('nano', [newest], {
        shell: false,
        windowsVerbatimArguments: false,
        stdio: 'inherit',
      });
    });

    it('uses the shell to run the configured EDITOR on Windows', () => {
      const logFile = createTestFile('log.log', 1);
      restorePlatform = setPlatform('win32');
      process.env.EDITOR = 'notepad';

      openLastLogFile();

      expect(spawnMock).toHaveBeenCalledWith('notepad', [`"${logFile}"`], {
        shell: true,
        windowsVerbatimArguments: false,
        stdio: 'inherit',
      });
    });

    it('falls back to vi on non-Windows platforms when no EDITOR is set', () => {
      const logFile = createTestFile('log.log', 1);
      restorePlatform = setPlatform('linux');

      openLastLogFile();

      expect(spawnMock).toHaveBeenCalledWith('vi', [logFile], {
        shell: false,
        windowsVerbatimArguments: false,
        stdio: 'inherit',
      });
    });

    it('opens with the default associated app via `cmd.exe start` on Windows when no EDITOR is set', () => {
      const logFile = createTestFile('log.log', 1);
      restorePlatform = setPlatform('win32');

      openLastLogFile();

      expect(spawnMock).toHaveBeenCalledWith('cmd.exe', ['/c', 'start', '""', `"${logFile}"`], {
        shell: false,
        windowsVerbatimArguments: true,
        stdio: 'inherit',
      });
    });
  });

  describe('clearLogFiles', () => {
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('deletes all log files', () => {
      const file1 = createTestFile('log1.log');
      const file2 = createTestFile('log2.log');

      clearLogFiles();

      expect(fs.existsSync(file1)).toBe(false);
      expect(fs.existsSync(file2)).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith('Successfully deleted 2 log file(s).');
    });

    it('shows message when no log files exist', () => {
      clearLogFiles();

      expect(consoleLogSpy).toHaveBeenCalledWith('No log files found to clear.');
    });
  });
});
