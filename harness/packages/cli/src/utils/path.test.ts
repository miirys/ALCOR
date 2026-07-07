import type { Stats } from 'node:fs';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { InvalidOptionArgumentError } from 'commander';

const mockStatSync = jest.fn<() => Stats>();
const mockRealpathSync = jest.fn<() => string>();

jest.unstable_mockModule('node:fs', () => ({
  statSync: mockStatSync,
  realpathSync: mockRealpathSync,
}));

const { resolveCwdPath } = await import('./path');

const validDirStat = { isDirectory: () => true } as unknown as Stats;
const fileStat = { isDirectory: () => false } as unknown as Stats;

describe('resolveCwdPath', () => {
  beforeEach(() => {
    mockStatSync.mockReset();
    mockRealpathSync.mockReset();
  });

  describe('when given an absolute path', () => {
    beforeEach(() => {
      mockStatSync.mockReturnValue(validDirStat);
      mockRealpathSync.mockReturnValue('/some/absolute/path');
    });

    it('returns the canonical path', () => {
      const result = resolveCwdPath('/some/absolute/path');

      expect(result).toBe('/some/absolute/path');
      expect(mockRealpathSync).toHaveBeenCalledWith('/some/absolute/path');
    });

    describe('when the path is a symlink to a different canonical path', () => {
      beforeEach(() => {
        mockRealpathSync.mockReturnValue('/data/repos/lsp/main');
      });

      it('returns the resolved canonical path, not the symlink path', () => {
        const result = resolveCwdPath('/home/user/repos/lsp/main');

        expect(result).toBe('/data/repos/lsp/main');
      });
    });
  });

  describe('when given a relative path', () => {
    beforeEach(() => {
      mockStatSync.mockReturnValue(validDirStat);
    });

    it('resolves the path against the provided basePath and returns the canonical path', () => {
      mockRealpathSync.mockReturnValue('/base/sub/dir');

      const result = resolveCwdPath('sub/dir', '/base');

      expect(result).toBe('/base/sub/dir');
    });

    describe('when the resolved path is a symlink', () => {
      beforeEach(() => {
        mockRealpathSync.mockReturnValue('/data/repos/lsp/main');
      });

      it('returns the canonical path', () => {
        const result = resolveCwdPath('main', '/home/user/repos/lsp');

        expect(result).toBe('/data/repos/lsp/main');
      });
    });
  });

  describe('when the path does not exist', () => {
    beforeEach(() => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockStatSync.mockImplementation(() => {
        throw error;
      });
    });

    it('throws InvalidOptionArgumentError with a "does not exist" message', () => {
      expect(() => resolveCwdPath('/nonexistent/path')).toThrow(InvalidOptionArgumentError);
      expect(() => resolveCwdPath('/nonexistent/path')).toThrow('does not exist');
    });
  });

  describe('when statSync throws a non-ENOENT error', () => {
    beforeEach(() => {
      const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      mockStatSync.mockImplementation(() => {
        throw error;
      });
    });

    it('re-throws the original error', () => {
      expect(() => resolveCwdPath('/restricted/path')).toThrow('EACCES: permission denied');
    });
  });

  describe('when the path exists but is not a directory', () => {
    beforeEach(() => {
      mockStatSync.mockReturnValue(fileStat);
    });

    it('throws InvalidOptionArgumentError with a "not a directory" message', () => {
      expect(() => resolveCwdPath('/some/file.txt')).toThrow(InvalidOptionArgumentError);
      expect(() => resolveCwdPath('/some/file.txt')).toThrow('not a directory');
    });
  });
});
