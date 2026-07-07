import { readFile, stat, writeFile, lstat, readlink } from 'node:fs/promises';
import { Stats, realpathSync } from 'node:fs';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TextEdit } from 'vscode-languageserver-protocol';
import { FsFileAccessService } from './fs_file_access_service';

jest.mock('node:fs/promises');
jest.mock('node:fs');

const symbolicLink = createFakePartial<Stats>({
  isSymbolicLink() {
    return true;
  },
});

const realFile = createFakePartial<Stats>({
  isSymbolicLink() {
    return false;
  },
});

describe('FsFileAccessService', () => {
  let service: FsFileAccessService;

  beforeEach(() => {
    service = new FsFileAccessService();
  });

  describe('updateFile', () => {
    const mockFileStat = createFakePartial<Stats>({
      mode: 0o644,
    });

    beforeEach(() => {
      jest.mocked(stat).mockResolvedValue(mockFileStat);
      jest.mocked(writeFile).mockResolvedValue(undefined);
    });

    describe('single line edits', () => {
      it('should apply a single edit to replace text within a line', async () => {
        const originalContent = 'The quick brown fox jumps over the lazy dog';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 9 },
          },
          newText: 'slow',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith(
          '/path/file.txt',
          'The slow brown fox jumps over the lazy dog',
          { mode: mockFileStat.mode },
        );
      });

      it('should apply multiple edits to the same line', async () => {
        const originalContent = 'The quick brown fox jumps over the lazy dog';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edits: TextEdit[] = [
          {
            range: {
              start: { line: 0, character: 4 },
              end: { line: 0, character: 9 },
            },
            newText: 'slow',
          },
          {
            range: {
              start: { line: 0, character: 35 },
              end: { line: 0, character: 39 },
            },
            newText: 'active',
          },
        ];

        await service.updateFile('/path/file.txt', edits);

        expect(writeFile).toHaveBeenCalledWith(
          '/path/file.txt',
          'The slow brown fox jumps over the active dog',
          { mode: mockFileStat.mode },
        );
      });

      it('should handle inserting text (zero-width range)', async () => {
        const originalContent = 'Hello World';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 5 },
          },
          newText: ' Beautiful',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Hello Beautiful World', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle deleting text (empty newText)', async () => {
        const originalContent = 'Hello Beautiful World';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 15 },
          },
          newText: '',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Hello World', {
          mode: mockFileStat.mode,
        });
      });
    });

    describe('multi-line edits', () => {
      it('should replace content across multiple lines', async () => {
        const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 2 },
            end: { line: 2, character: 3 },
          },
          newText: 'REPLACED',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Line 1\nLiREPLACEDe 3\nLine 4', {
          mode: mockFileStat.mode,
        });
      });

      it('should replace content across multiple lines when new value contains multi lines', async () => {
        const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 2 },
            end: { line: 2, character: 3 },
          },
          newText: 'WOW\nAMAZING',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith(
          '/path/file.txt',
          'Line 1\nLiWOW\nAMAZINGe 3\nLine 4',
          {
            mode: mockFileStat.mode,
          },
        );
      });

      it('should handle deleting multiple lines', async () => {
        const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 2, character: 6 },
          },
          newText: '',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Line 1\n\nLine 4', {
          mode: mockFileStat.mode,
        });
      });
    });

    describe('line ending preservation', () => {
      it.each([
        { name: 'LF (Unix)', content: 'Line 1\nLine 2\nLine 3', lineEnding: '\n' },
        { name: 'CRLF (Windows)', content: 'Line 1\r\nLine 2\r\nLine 3', lineEnding: '\r\n' },
        { name: 'CR (Classic Mac)', content: 'Line 1\rLine 2\rLine 3', lineEnding: '\r' },
      ])('should preserve $name line endings', async ({ content, lineEnding }) => {
        jest.mocked(readFile).mockResolvedValue(content);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 4 },
          },
          newText: 'Row',
        };

        await service.updateFile('/path/file.txt', [edit]);

        const expectedContent = `Line 1${lineEnding}Row 2${lineEnding}Line 3`;
        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', expectedContent, {
          mode: mockFileStat.mode,
        });
      });

      it('should default to LF when no line endings are detected', async () => {
        const originalContent = 'Single line';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 6 },
          },
          newText: '\nNew',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Single\nNew line', {
          mode: mockFileStat.mode,
        });
      });
    });

    describe('multiple edits', () => {
      it('should apply multiple non-overlapping edits correctly', async () => {
        const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edits: TextEdit[] = [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 4 },
            },
            newText: 'Row',
          },
          {
            range: {
              start: { line: 2, character: 0 },
              end: { line: 2, character: 4 },
            },
            newText: 'Item',
          },
          {
            range: {
              start: { line: 3, character: 5 },
              end: { line: 3, character: 6 },
            },
            newText: '5',
          },
        ];

        await service.updateFile('/path/file.txt', edits);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Row 1\nLine 2\nItem 3\nLine 5', {
          mode: mockFileStat.mode,
        });
      });

      it('should apply edits in reverse order to avoid position shifts', async () => {
        const originalContent = 'ABCDEFGHIJ';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edits: TextEdit[] = [
          {
            range: {
              start: { line: 0, character: 2 },
              end: { line: 0, character: 4 },
            },
            newText: 'XX',
          },
          {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 8 },
            },
            newText: 'YY',
          },
        ];

        await service.updateFile('/path/file.txt', edits);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'ABXXEFYYIJ', {
          mode: mockFileStat.mode,
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty file', async () => {
        jest.mocked(readFile).mockResolvedValue('');

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          newText: 'New content',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'New content', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle empty edits array', async () => {
        const originalContent = 'Original content';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        await service.updateFile('/path/file.txt', []);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', originalContent, {
          mode: mockFileStat.mode,
        });
      });

      it('should handle out-of-bounds character positions by clamping to line end', async () => {
        const originalContent = 'Short\nLine';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 100 },
            end: { line: 0, character: 200 },
          },
          newText: ' Extended',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Short Extended\nLine', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle out-of-bounds line positions by treating as end of file', async () => {
        const originalContent = 'Line 1\nLine 2';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 10, character: 0 },
            end: { line: 10, character: 0 },
          },
          newText: '\nNew line',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Line 1\nLine 2\nNew line', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle mixed line endings in same file', async () => {
        const originalContent = 'Line 1\r\nLine 2\nLine 3\rLine 4';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 4 },
          },
          newText: 'Modified',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith(
          '/path/file.txt',
          'Line 1\r\nModified 2\nLine 3\rLine 4',
          {
            mode: mockFileStat.mode,
          },
        );
      });

      it('should handle unicode characters correctly', async () => {
        const originalContent = 'Hello 👋 World 🌍';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 8 },
          },
          newText: '🚀',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Hello 🚀 World 🌍', {
          mode: mockFileStat.mode,
        });
      });

      it('should throw error for overlapping edits', async () => {
        const originalContent = 'ABCDEFGHIJ';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edits: TextEdit[] = [
          {
            range: {
              start: { line: 0, character: 2 },
              end: { line: 0, character: 6 },
            },
            newText: 'XXXX',
          },
          {
            range: {
              start: { line: 0, character: 4 },
              end: { line: 0, character: 8 },
            },
            newText: 'YYYY',
          },
        ];

        await expect(service.updateFile('/path/file.txt', edits)).rejects.toThrow(
          'Overlapping text edits detected',
        );
      });

      it('should handle edits at exact line boundaries', async () => {
        const originalContent = 'Line 1\nLine 2\nLine 3';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 6 },
            end: { line: 1, character: 0 },
          },
          newText: ' and ',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Line 1 and Line 2\nLine 3', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle CR line endings followed by non-LF character', async () => {
        const originalContent = 'Line 1\rLine 2\rLine 3';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 4 },
          },
          newText: 'Modified',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Line 1\rModified 2\rLine 3', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle editing at the very end of file', async () => {
        const originalContent = 'Hello World';
        jest.mocked(readFile).mockResolvedValue(originalContent);

        const edit: TextEdit = {
          range: {
            start: { line: 0, character: 11 },
            end: { line: 0, character: 11 },
          },
          newText: '!',
        };

        await service.updateFile('/path/file.txt', [edit]);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'Hello World!', {
          mode: mockFileStat.mode,
        });
      });

      it('should handle zero-length content with edits', async () => {
        jest.mocked(readFile).mockResolvedValue('');

        const edits: TextEdit[] = [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            newText: 'First',
          },
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            newText: 'Second',
          },
        ];

        await service.updateFile('/path/file.txt', edits);

        expect(writeFile).toHaveBeenCalledWith('/path/file.txt', 'SecondFirst', {
          mode: mockFileStat.mode,
        });
      });
    });
  });

  describe('realPath', () => {
    it('calls realpathSync to calculate the path', async () => {
      const fullPath = '/test/file.ts';
      jest.mocked(realpathSync).mockReturnValue(fullPath);
      const result = await service.realPath(fullPath);

      expect(realpathSync).toHaveBeenCalledWith(fullPath);

      expect(result).toBe(fullPath);
    });

    it('returns the path in the error object when ENOENT', async () => {
      const fullPath = '/test/file.ts';
      const realPath = '/fake/file.ts';
      jest.mocked(realpathSync).mockImplementation(() => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        error.path = realPath;

        throw error;
      });
      const result = await service.realPath(fullPath);

      expect(result).toBe(realPath);
    });

    it('returns the path in the error object when ENOTDIR', async () => {
      const fullPath = '/test/file.ts';
      const realPath = '/fake/file.ts';
      jest.mocked(realpathSync).mockImplementation(() => {
        const error = new Error('ENOTDIR') as NodeJS.ErrnoException;
        error.code = 'ENOTDIR';
        error.path = realPath;

        throw error;
      });
      const result = await service.realPath(fullPath);

      expect(result).toBe(realPath);
    });

    it('returns an empty string in all other failures', async () => {
      const fullPath = '/test/file.ts';
      const realPath = '/fake/file.ts';
      jest.mocked(realpathSync).mockImplementation(() => {
        const error = new Error('ENOLINK') as NodeJS.ErrnoException;
        error.code = 'ENOLINK';
        error.path = realPath;

        throw error;
      });
      const result = await service.realPath(fullPath);

      expect(result).toBe('');
    });

    it('handles multiple layers of symbolic links', async () => {
      const fullPath = '/test/file.ts';
      const fullPath2 = '/test/file2.ts';
      const fullPath3 = '/test/file3.ts';
      const realPath = '/fake/file.ts';

      jest.mocked(realpathSync).mockReturnValueOnce(realPath);

      jest
        .mocked(lstat)
        .mockResolvedValueOnce(symbolicLink)
        .mockResolvedValueOnce(symbolicLink)
        .mockResolvedValueOnce(symbolicLink)
        .mockResolvedValue(realFile);

      jest
        .mocked(readlink)
        .mockResolvedValueOnce(fullPath2)
        .mockResolvedValueOnce(fullPath3)
        .mockResolvedValue(realPath);

      const results = await service.realPath(fullPath);

      expect(lstat).toHaveBeenCalledTimes(4);
      expect(results).toBe(realPath);
    });
  });
});
