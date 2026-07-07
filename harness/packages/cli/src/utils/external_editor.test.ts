import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';

const mockSpawnSync = jest.fn();
const mockStatSync = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

jest.unstable_mockModule('node:fs', () => ({
  statSync: mockStatSync,
}));

const { resolveEditor, resolveExecutable, launchExternalEditor } = await import(
  './external_editor'
);

const setPlatform = (platform: NodeJS.Platform): (() => void) => {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  };
};

describe('resolveEditor', () => {
  describe('POSIX precedence', () => {
    it('prefers VISUAL over EDITOR', () => {
      expect(resolveEditor({ VISUAL: 'code', EDITOR: 'nano' })).toEqual({
        command: 'code',
        args: [],
      });
    });

    it('falls back to EDITOR when VISUAL is unset', () => {
      expect(resolveEditor({ EDITOR: 'nano' })).toEqual({
        command: 'nano',
        args: [],
      });
    });

    it('falls back to the platform default when neither is set', () => {
      // The default depends on process.platform - assert the property rather
      // than a specific value so this test is portable across runners.
      const expectedDefault = process.platform === 'win32' ? 'notepad' : 'vi';
      expect(resolveEditor({})).toEqual({ command: expectedDefault, args: [] });
    });

    it('uses notepad on Windows', () => {
      const restore = setPlatform('win32');
      try {
        expect(resolveEditor({})).toEqual({ command: 'notepad', args: [] });
      } finally {
        restore();
      }
    });

    it('uses vi on non-Windows', () => {
      const restore = setPlatform('linux');
      try {
        expect(resolveEditor({})).toEqual({ command: 'vi', args: [] });
      } finally {
        restore();
      }
    });
  });

  describe('argument parsing', () => {
    it('splits editor strings containing flags', () => {
      expect(resolveEditor({ EDITOR: 'code -w' })).toEqual({
        command: 'code',
        args: ['-w'],
      });
    });

    it('handles multiple flags', () => {
      expect(resolveEditor({ EDITOR: 'nvim --clean -u NONE' })).toEqual({
        command: 'nvim',
        args: ['--clean', '-u', 'NONE'],
      });
    });

    it('respects double-quoted paths with spaces', () => {
      expect(
        resolveEditor({ EDITOR: '"/Applications/My Editor.app/Contents/MacOS/editor" --wait' }),
      ).toEqual({
        command: '/Applications/My Editor.app/Contents/MacOS/editor',
        args: ['--wait'],
      });
    });

    it('respects single-quoted paths with spaces', () => {
      expect(resolveEditor({ EDITOR: "'/opt/my editor' -w" })).toEqual({
        command: '/opt/my editor',
        args: ['-w'],
      });
    });

    it('trims surrounding whitespace', () => {
      expect(resolveEditor({ EDITOR: '  vim  ' })).toEqual({
        command: 'vim',
        args: [],
      });
    });

    it('drops shell operators rather than expanding them', () => {
      // We never want `EDITOR='vim && rm -rf /'` to actually run rm.
      // shell-quote returns operators as object entries, which we filter out.
      const result = resolveEditor({ EDITOR: 'vim && rm' });
      expect(result.command).toBe('vim');
      expect(result.args).not.toContain('&&');
    });
  });
});

describe('resolveExecutable', () => {
  beforeEach(() => {
    mockStatSync.mockReset();
  });

  describe('on POSIX', () => {
    it('returns the command unchanged regardless of whether it exists', () => {
      const restore = setPlatform('linux');
      try {
        expect(resolveExecutable('vim', {})).toBe('vim');
        expect(resolveExecutable('/opt/bin/vim', {})).toBe('/opt/bin/vim');
        expect(mockStatSync).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('on Windows', () => {
    let restorePlatform: () => void;

    beforeEach(() => {
      restorePlatform = setPlatform('win32');
    });

    afterEach(() => {
      restorePlatform();
    });

    const fakeExisting = (paths: string[]) => {
      const set = new Set(paths.map((p) => p.toLowerCase()));
      mockStatSync.mockImplementation((p: unknown) => {
        if (typeof p === 'string' && set.has(p.toLowerCase())) {
          return { isFile: () => true } as ReturnType<typeof mockStatSync>;
        }
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      });
    };

    it('finds .cmd shims on PATH when given a bare command', () => {
      // PATHEXT casing is preserved on the produced path - Windows file
      // systems are case-insensitive so this is harmless.
      fakeExisting(['C:\\Tools\\code.CMD']);
      const result = resolveExecutable('code', {
        PATH: 'C:\\Windows;C:\\Tools',
        PATHEXT: '.EXE;.CMD;.BAT',
      });
      expect(result).toBe('C:\\Tools\\code.CMD');
    });

    it('prefers earlier PATH entries', () => {
      fakeExisting(['C:\\First\\code.EXE', 'C:\\Second\\code.CMD']);
      const result = resolveExecutable('code', {
        PATH: 'C:\\First;C:\\Second',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBe('C:\\First\\code.EXE');
    });

    it('prefers earlier PATHEXT extensions within a single directory', () => {
      fakeExisting(['C:\\Tools\\code.EXE', 'C:\\Tools\\code.CMD']);
      const result = resolveExecutable('code', {
        PATH: 'C:\\Tools',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBe('C:\\Tools\\code.EXE');
    });

    it('returns null when nothing matches', () => {
      fakeExisting([]);
      const result = resolveExecutable('nope', {
        PATH: 'C:\\Windows',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBeNull();
    });

    it('honours an absolute path that already exists', () => {
      fakeExisting(['C:\\Tools\\editor.exe']);
      const result = resolveExecutable('C:\\Tools\\editor.exe', {
        PATH: 'C:\\Windows',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBe('C:\\Tools\\editor.exe');
    });

    it('probes extensions against an absolute path missing the extension', () => {
      fakeExisting(['C:\\Tools\\editor.CMD']);
      const result = resolveExecutable('C:\\Tools\\editor', {
        PATH: 'C:\\Windows',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBe('C:\\Tools\\editor.CMD');
    });

    it('checks the current working directory first', () => {
      // win32.join normalises forward slashes from the (POSIX) cwd to
      // backslashes, so derive the expected candidate the same way.
      const path = jest.requireActual<typeof import('node:path')>('node:path');
      const cwdAsWin = path.win32.join(process.cwd(), 'local.CMD');
      fakeExisting([cwdAsWin]);
      const result = resolveExecutable('local', {
        PATH: 'C:\\Windows',
        PATHEXT: '.EXE;.CMD',
      });
      expect(result).toBe(cwdAsWin);
    });

    it('falls back to default PATHEXT when env var is unset', () => {
      fakeExisting(['C:\\Tools\\code.CMD']);
      const result = resolveExecutable('code', {
        PATH: 'C:\\Tools',
      });
      expect(result).toBe('C:\\Tools\\code.CMD');
    });
  });
});

describe('launchExternalEditor', () => {
  let logger: TestLogger;
  const originalEnv = process.env;

  beforeEach(() => {
    logger = new TestLogger();
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ status: 0, signal: null });
    mockStatSync.mockReset();
    process.env = { ...originalEnv };
    delete process.env.EDITOR;
    delete process.env.VISUAL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('command invocation', () => {
    it('invokes the resolved editor with the file path appended last', () => {
      launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(mockSpawnSync).toHaveBeenCalledWith('nano', ['/tmp/foo.json'], { stdio: 'inherit' });
    });

    it('preserves user-provided flags', () => {
      launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'code -w' } });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'code',
        ['-w', '/tmp/foo.json'],
        expect.anything(),
      );
    });

    it('uses process.env when no env override is provided', () => {
      process.env.EDITOR = 'nano';

      launchExternalEditor('/tmp/foo.json', logger);

      expect(mockSpawnSync).toHaveBeenCalledWith('nano', ['/tmp/foo.json'], { stdio: 'inherit' });
    });

    it('runs the spawn inside the provided suspendTty boundary', () => {
      const calls: string[] = [];
      mockSpawnSync.mockImplementation(() => {
        calls.push('spawn');
        return { status: 0, signal: null };
      });
      let suspendCount = 0;
      const suspendTty = <T>(fn: () => T): T => {
        suspendCount += 1;
        calls.push('suspend:before');
        const out = fn();
        calls.push('suspend:after');
        return out;
      };

      launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' }, suspendTty });

      expect(suspendCount).toBe(1);
      expect(calls).toEqual(['suspend:before', 'spawn', 'suspend:after']);
    });

    describe('on Windows', () => {
      let restorePlatform: () => void;

      beforeEach(() => {
        restorePlatform = setPlatform('win32');
      });

      afterEach(() => {
        restorePlatform();
      });

      it('spawns the resolved .cmd shim path rather than the bare command', () => {
        mockStatSync.mockImplementation((p: unknown) =>
          typeof p === 'string' && p.toLowerCase() === 'c:\\tools\\code.cmd'
            ? ({ isFile: () => true } as ReturnType<typeof mockStatSync>)
            : (() => {
                const err = new Error('ENOENT') as NodeJS.ErrnoException;
                err.code = 'ENOENT';
                throw err;
              })(),
        );

        launchExternalEditor('C:\\tmp\\foo.json', logger, {
          env: {
            EDITOR: 'code',
            PATH: 'C:\\Tools',
            PATHEXT: '.EXE;.CMD',
          },
        });

        expect(mockSpawnSync).toHaveBeenCalledWith('C:\\Tools\\code.CMD', ['C:\\tmp\\foo.json'], {
          stdio: 'inherit',
        });
      });

      it('returns not_found without spawning when the editor is not on PATH', () => {
        mockStatSync.mockImplementation(() => {
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        });

        const result = launchExternalEditor('C:\\tmp\\foo.json', logger, {
          env: {
            EDITOR: 'nopey',
            PATH: 'C:\\Tools',
            PATHEXT: '.EXE;.CMD',
          },
        });

        expect(mockSpawnSync).not.toHaveBeenCalled();
        expect(result.isErr()).toBe(true);
        // eslint-disable-next-line no-underscore-dangle
        expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_found', editor: 'nopey' });
      });
    });
  });

  describe('result handling', () => {
    it('returns ok on clean exit', () => {
      mockSpawnSync.mockReturnValue({ status: 0, signal: null });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(result.isOk()).toBe(true);
    });

    it('treats null status as success', () => {
      mockSpawnSync.mockReturnValue({ status: null, signal: null });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(result.isOk()).toBe(true);
    });

    it('returns not_found when spawnSync reports ENOENT', () => {
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      mockSpawnSync.mockReturnValue({ error: enoent });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nopey' } });

      expect(result.isErr()).toBe(true);
      // eslint-disable-next-line no-underscore-dangle
      expect(result._unsafeUnwrapErr()).toEqual({ kind: 'not_found', editor: 'nopey' });
    });

    it('returns spawn_failed for other spawn errors', () => {
      const eacces = Object.assign(new Error('denied'), { code: 'EACCES' });
      mockSpawnSync.mockReturnValue({ error: eacces });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(result.isErr()).toBe(true);
      // eslint-disable-next-line no-underscore-dangle
      expect(result._unsafeUnwrapErr()).toEqual({
        kind: 'spawn_failed',
        editor: 'nano',
        error: eacces,
      });
    });

    it('returns ok when the editor exits non-zero (file may still be edited)', () => {
      mockSpawnSync.mockReturnValue({ status: 1, signal: null });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(result.isOk()).toBe(true);
    });

    it('returns ok when the editor is killed by signal (file may still be edited)', () => {
      mockSpawnSync.mockReturnValue({ status: null, signal: 'SIGINT' });

      const result = launchExternalEditor('/tmp/foo.json', logger, { env: { EDITOR: 'nano' } });

      expect(result.isOk()).toBe(true);
    });
  });
});
