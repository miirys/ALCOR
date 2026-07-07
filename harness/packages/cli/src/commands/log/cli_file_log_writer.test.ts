import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ExitHandler } from '../../utils/exit';

const testLogDir = path.join(os.tmpdir(), 'gitlab-duo-cli-test-file-log-writer');

jest.unstable_mockModule('./utils', () => ({
  getCliLogDir: () => testLogDir,
}));

jest.unstable_mockModule('./last_log', () => ({
  pruneOldLogFiles: jest.fn(),
}));

jest.unstable_mockModule('@gitlab-org/tui', () => ({
  getAppName: () => 'duo',
}));

const { CliFileLogWriter } = await import('./cli_file_log_writer');

const buildExitHandler = (exitCode: number | undefined): ExitHandler =>
  createFakePartial<ExitHandler>({ exitCode });

describe('CliFileLogWriter', () => {
  let stderrSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
    stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe('log file creation', () => {
    it('creates a log file when cwd contains characters illegal in file names', () => {
      // Simulates a Windows cwd such as `C:\code\gitlab-lsp`, where the drive
      // letter's colon would otherwise produce an invalid file name and make
      // creation fail (falling back to stderr).
      const cwdSpy = jest
        .spyOn(process, 'cwd')
        .mockReturnValue(['C:', 'code', 'gitlab-lsp'].join(path.sep));

      // eslint-disable-next-line no-new
      new CliFileLogWriter(buildExitHandler(undefined));

      const files = fs.readdirSync(testLogDir);
      expect(files).toHaveLength(1);
      // No illegal file-name characters should remain.
      expect(files[0]).not.toMatch(/[<>:"/\\|?*]/);
      expect(stderrSpy).not.toHaveBeenCalled();

      cwdSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('prints the log hint on a non-zero exit', () => {
      const writer = new CliFileLogWriter(buildExitHandler(1));

      writer.dispose();

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `^\\nLog: ${testLogDir}/duo-cli-log-.*\\.log \\(run 'duo log last' to open\\)$`,
          ),
        ),
      );
    });

    it('does not print on a clean exit (code 0)', () => {
      const writer = new CliFileLogWriter(buildExitHandler(0));

      writer.dispose();

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('does not print when exitCode is undefined', () => {
      // Guards against `undefined !== 0` evaluating truthy — dispose() may be
      // called outside the normal ExitHandler.exit() flow (tests, direct DI
      // disposal) and must stay quiet in that case.
      const writer = new CliFileLogWriter(buildExitHandler(undefined));

      writer.dispose();

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('does not print when exitHandler is absent', () => {
      const writer = new CliFileLogWriter(undefined);

      writer.dispose();

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
