import { URI } from 'vscode-uri';
import { FastDirectoryMatcher } from './dir_matcher';

describe('FastDirectoryMatcher', () => {
  describe('Unix-like systems', () => {
    let parser: FastDirectoryMatcher;

    const gitignores = [
      'file:///home/user/project/.gitignore',
      'file:///home/user/project/src/.gitignore',
      'file:///home/user/project/src/components/.gitignore',
      'file:///home/user/project/src/utils/.gitignore',
      'file:///home/user/project/tests/.gitignore',
      'file:///home/user/project/tests/unit/.gitignore',
      'file:///home/user/project/tests/integration/.gitignore',
      'file:///home/user/project/docs/.gitignore',
      'file:///home/user/project/docs/api/.gitignore',
      'file:///home/user/project/build/.gitignore',
      'file:///home/user/project/config/.gitignore',
      'file:///home/user/project/scripts/.gitignore',
      'file:///home/user/project/third-party/lib1/.gitignore',
      'file:///home/user/project/third-party/lib2/.gitignore',
    ];

    beforeEach(() => {
      parser = new FastDirectoryMatcher();
      gitignores.forEach((gitignore) => {
        parser.addFileToMatch(URI.parse(gitignore));
      });
    });

    test('should find root .gitignore for file in project root', () => {
      const uri = URI.parse('file:///home/user/project/somefile.txt');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([URI.parse('file:///home/user/project')]);
    });

    test('should find most specific .gitignore for file in nested directory', () => {
      const uri = URI.parse('file:///home/user/project/docs/api/some_file.ts');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('file:///home/user/project'),
        URI.parse('file:///home/user/project/docs'),
        URI.parse('file:///home/user/project/docs/api'),
      ]);
    });

    test('should find all matching .gitignore directories for deeply nested file', () => {
      const uri = URI.parse('file:///home/user/project/src/components/Button/index.tsx');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('file:///home/user/project'),
        URI.parse('file:///home/user/project/src'),
        URI.parse('file:///home/user/project/src/components'),
      ]);
    });

    test('should return empty array for file outside of project', () => {
      const uri = URI.parse('file:///home/user/other-project/file.txt');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([]);
    });

    test('should handle files in directories without specific .gitignore', () => {
      const uri = URI.parse('file:///home/user/project/src/utils/helpers/string.ts');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('file:///home/user/project'),
        URI.parse('file:///home/user/project/src'),
        URI.parse('file:///home/user/project/src/utils'),
      ]);
    });

    test('should handle root directory query', () => {
      const uri = URI.parse('file:///home/user/project');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([URI.parse('file:///home/user/project')]);
    });

    test('should handle non-existent nested directory query', () => {
      const uri = URI.parse('file:///home/user/project/non-existent/folder');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([URI.parse('file:///home/user/project')]);
    });

    test('should handle URI with query parameters', () => {
      const uri = URI.parse('file:///home/user/project/src/utils/file.ts?query=param');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('file:///home/user/project'),
        URI.parse('file:///home/user/project/src'),
        URI.parse('file:///home/user/project/src/utils'),
      ]);
    });

    test('should handle URI with fragments', () => {
      const uri = URI.parse('file:///home/user/project/docs/api/endpoint.md#section');
      const result = parser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('file:///home/user/project'),
        URI.parse('file:///home/user/project/docs'),
        URI.parse('file:///home/user/project/docs/api'),
      ]);
    });
  });

  describe('Windows paths', () => {
    test('should handle Windows paths', () => {
      const windowsParser = new FastDirectoryMatcher();
      windowsParser.addFileToMatch(URI.parse('c:/win/path/to/project/.gitignore'));
      windowsParser.addFileToMatch(URI.parse('c:/win/path/to/project/src/.gitignore'));
      windowsParser.addFileToMatch(URI.parse('c:/win/path/to/project/src/components/.gitignore'));

      const uri = URI.parse('c:/win/path/to/project/src/components/Button.tsx');
      const result = windowsParser.findMatchingDirectories(uri);
      expect(result).toEqual([
        URI.parse('c:/win/path/to/project'),
        URI.parse('c:/win/path/to/project/src'),
        URI.parse('c:/win/path/to/project/src/components'),
      ]);
    });

    test('should handle Windows root directory', () => {
      const windowsParser = new FastDirectoryMatcher();
      windowsParser.addFileToMatch(URI.parse('c:/Users/user/project/.gitignore'));

      const uri = URI.parse('c:/Users/user/project');
      const result = windowsParser.findMatchingDirectories(uri);
      expect(result).toEqual([URI.parse('c:/Users/user/project')]);
    });

    test('should handle Windows paths with different casings', () => {
      const windowsParser = new FastDirectoryMatcher();
      windowsParser.addFileToMatch(URI.parse('C:/Users/User/Project/.gitignore'));

      const uri = URI.parse('C:/Users/User/Project/file.txt');
      const result = windowsParser.findMatchingDirectories(uri);
      expect(result).toEqual([URI.parse('C:/Users/User/Project')]);
    });
  });

  describe('dispose', () => {
    test('should clear all directories after dispose', () => {
      const matcher = new FastDirectoryMatcher();
      matcher.addFileToMatch(URI.parse('file:///home/user/project/.gitignore'));
      matcher.addFileToMatch(URI.parse('file:///home/user/project/src/.gitignore'));

      expect(
        matcher.findMatchingDirectories(URI.parse('file:///home/user/project/src/file.ts')),
      ).toHaveLength(2);

      matcher.dispose();

      expect(
        matcher.findMatchingDirectories(URI.parse('file:///home/user/project/src/file.ts')),
      ).toHaveLength(0);
    });

    test('should allow adding new directories after dispose', () => {
      const matcher = new FastDirectoryMatcher();
      matcher.addFileToMatch(URI.parse('file:///home/user/project/.gitignore'));
      matcher.dispose();

      matcher.addFileToMatch(URI.parse('file:///home/user/new-project/.gitignore'));

      expect(
        matcher.findMatchingDirectories(URI.parse('file:///home/user/project/file.ts')),
      ).toHaveLength(0);
      expect(
        matcher.findMatchingDirectories(URI.parse('file:///home/user/new-project/file.ts')),
      ).toHaveLength(1);
    });
  });
});
