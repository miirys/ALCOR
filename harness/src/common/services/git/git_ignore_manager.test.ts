import { URI } from 'vscode-uri';
import { GitIgnoreManager } from './git_ignore_manager';

/**
 * Builds a gitignore pattern from strings
 * adds a newline at the end and avoids spaces/tabs/newlines in the pattern
 */
const patternBuilder = (patterns: string[]) => {
  return patterns.map((pattern) => pattern.concat('\n')).join('');
};

describe('GitIgnoreManager', () => {
  let manager: GitIgnoreManager;

  beforeEach(() => {
    manager = new GitIgnoreManager(URI.parse('file:///root'));
  });

  const addGitIgnore = (path: string, content: string) => {
    manager.addGitignore(URI.parse(`file:///root/${path}`), content);
  };

  const isIgnored = (path: string) => {
    return manager.isIgnored(URI.parse(`file:///root/${path}`));
  };

  describe('Should handle exclude file from root', () => {
    beforeEach(() => {
      manager.addExcludeFile('*.log');
    });

    test('should ignore files matching simple patterns', async () => {
      expect(isIgnored('file.log')).toBe(true);
    });
  });

  describe('Basic patterns', () => {
    // file:///root/.gitignore
    beforeEach(() => {
      addGitIgnore(
        '.gitignore',
        patternBuilder(['# Comment', '*.log', '/node_modules', 'build/', '!important.log']),
      );
    });

    test('should ignore files matching simple patterns', async () => {
      expect(isIgnored('file.log')).toBe(true);
      expect(isIgnored('folder/nested.log')).toBe(true);
    });

    test('should not ignore non-matching files', async () => {
      expect(isIgnored('file.txt')).toBe(false);
      expect(isIgnored('folder/file.js')).toBe(false);
    });

    test('should handle negation', async () => {
      expect(isIgnored('important.log')).toBe(false);
    });
  });

  describe('Pattern prefixes', () => {
    // file:///root/.gitignore
    beforeEach(() => {
      addGitIgnore(
        '.gitignore',
        patternBuilder(['/root_only.txt', 'sub/', '/abs/path/', '**/node_modules']),
      );
    });

    test('should handle patterns with leading slash', async () => {
      expect(isIgnored('root_only.txt')).toBe(true);
      expect(isIgnored('nested/root_only.txt')).toBe(false);
    });

    test('should handle patterns with trailing slash', async () => {
      expect(isIgnored('sub/file.txt')).toBe(true);
      expect(isIgnored('not_sub')).toBe(false);
    });

    test('should handle absolute paths', async () => {
      expect(isIgnored('abs/path/file.txt')).toBe(true);
      expect(isIgnored('not_abs/path/file.txt')).toBe(false);
    });

    test('should handle double asterisk', async () => {
      expect(isIgnored('node_modules')).toBe(true);
      expect(isIgnored('foo/node_modules')).toBe(true);
      expect(isIgnored('foo/bar/node_modules')).toBe(true);
    });
  });

  describe('Wildcard patterns', () => {
    // file:///root/.gitignore
    beforeEach(() => {
      addGitIgnore(
        '.gitignore',
        patternBuilder(['*.txt', '*.[oa]', '**/logs', 'doc/**/*.pdf', '**/temp/*']),
      );
    });

    test('should handle single asterisk wildcard', async () => {
      expect(isIgnored('file.txt')).toBe(true);
      expect(isIgnored('path/to/another.txt')).toBe(true);
    });

    test('should handle character class wildcards', async () => {
      expect(isIgnored('main.o')).toBe(true);
      expect(isIgnored('lib.a')).toBe(true);
      expect(isIgnored('script.s')).toBe(false);
    });

    test('should handle double asterisk in middle of pattern', async () => {
      expect(isIgnored('doc/chapter1.pdf')).toBe(true);
      expect(isIgnored('doc/section/subsection/figure.pdf')).toBe(true);
      expect(isIgnored('doc/notes.txt')).toBe(true); // Ignored by *.txt
    });

    test('should handle patterns ending with double asterisk', async () => {
      expect(isIgnored('logs')).toBe(true);
      expect(isIgnored('var/logs')).toBe(true);
      expect(isIgnored('var/logs/app.log')).toBe(true);
    });

    test('should handle patterns with single asterisk directory', async () => {
      expect(isIgnored('temp/cache.tmp')).toBe(true);
      expect(isIgnored('var/temp/render.tmp')).toBe(true);
      expect(isIgnored('var/temp/render/file.tmp')).toBe(true);
    });
  });

  describe('Negation and overrides', () => {
    // file:///root/.gitignore
    beforeEach(() => {
      addGitIgnore(
        '.gitignore',
        patternBuilder(['*.ignore', '!keep.ignore', '**/*.secret', '!*.notsecret']),
      );
    });

    test('should handle simple negation', async () => {
      expect(isIgnored('test.ignore')).toBe(true);
      expect(isIgnored('keep.ignore')).toBe(false);
    });

    test('should handle pattern overrides', async () => {
      expect(isIgnored('config.secret')).toBe(true);
      expect(isIgnored('config.notsecret')).toBe(false);
    });
  });

  describe('Multiple .gitignore files', () => {
    beforeEach(() => {
      // file:///root/.gitignore
      addGitIgnore('.gitignore', '*.log');
      // file:///root/sub/.gitignore
      addGitIgnore('sub/.gitignore', '!important.log\n*.txt');
    });

    test('should combine rules from multiple .gitignore files', async () => {
      expect(isIgnored('app.log')).toBe(true);
      expect(isIgnored('sub/app.log')).toBe(true);
      expect(isIgnored('sub/important.log')).toBe(false);
      expect(isIgnored('sub/doc.txt')).toBe(true);
    });
  });

  describe('Special cases', () => {
    // file:///root/.gitignore
    test('should always ignore .git folders', async () => {
      expect(isIgnored('.git')).toBe(true);
      expect(isIgnored('sub/.git')).toBe(true);
    });

    test('should never ignore root directory', async () => {
      expect(isIgnored('.')).toBe(false);
    });
  });

  describe('Multiple .gitignore files with complex patterns', () => {
    beforeEach(() => {
      // file:///root/.gitignore
      addGitIgnore(
        '.gitignore',
        patternBuilder([
          '*.log',
          'build/',
          '!important-build/',
          '**/node_modules',
          '!**/special-modules/',
          '*.ts',
        ]),
      );

      // file:///root/src/.gitignore
      addGitIgnore(
        'src/.gitignore',
        patternBuilder([
          '*.tmp',
          '!keeper.tmp',
          'debug/',
          '!debug/important/critical.log',
          '**/test-output/',
          '!**/critical-tests/',
        ]),
      );

      // file:///root/src/components/.gitignore
      addGitIgnore(
        'src/components/.gitignore',
        patternBuilder([
          '*.bak',
          '!critical.bak',
          'temp/',
          '!temp/save/important.tmp',
          '**/cache/',
          '!**/persistent-cache/',
          '!something.ts',
        ]),
      );
    });

    test('should handle nested .gitignore files', async () => {
      expect(isIgnored('app.log')).toBe(true);
      expect(isIgnored('src/module.log')).toBe(true);
      expect(isIgnored('src/components/widget.log')).toBe(true);

      expect(isIgnored('src/temp.tmp')).toBe(true);
      expect(isIgnored('src/components/helper.tmp')).toBe(true);

      expect(isIgnored('src/components/old.bak')).toBe(true);
    });

    test('should respect negation patterns in nested .gitignore files', async () => {
      expect(isIgnored('important-build/output.txt')).toBe(false);
      expect(isIgnored('src/keeper.tmp')).toBe(false);
      expect(isIgnored('src/components/critical.bak')).toBe(false);
    });

    test('should handle complex nested directory patterns', async () => {
      expect(isIgnored('node_modules/package/file.js')).toBe(true);
      expect(isIgnored('src/lib/node_modules/package/file.js')).toBe(true);
      expect(isIgnored('special-modules/important-pkg/file.js')).toBe(false);

      expect(isIgnored('src/test-output/results.xml')).toBe(true);
      expect(isIgnored('src/components/test-output/results.xml')).toBe(true);
      expect(isIgnored('src/critical-tests/output/results.xml')).toBe(false);

      expect(isIgnored('src/components/cache/data.bin')).toBe(true);
      expect(isIgnored('src/components/persistent-cache/data.bin')).toBe(false);
    });

    test('should handle overlapping ignore and negation patterns', async () => {
      expect(isIgnored('build/output.txt')).toBe(true);
      expect(isIgnored('src/components/something.ts')).toBe(false);
      expect(isIgnored('src/components/temp/file.tmp')).toBe(true);
    });

    test('should handle complex wildcard patterns', async () => {
      // file:///root/docs/.gitignore
      addGitIgnore(
        'docs/.gitignore',
        patternBuilder([
          'a[bc]d.txt',
          '*.md',
          '!README.md',
          '**/temp/**',
          '!**/temp/keep/**',
          'logs/[0-9][0-9][0-9][0-9]/',
        ]),
      );

      expect(isIgnored('docs/abd.txt')).toBe(true);
      expect(isIgnored('docs/acd.txt')).toBe(true);
      expect(isIgnored('docs/add.txt')).toBe(false);
      expect(isIgnored('docs/chapter1.md')).toBe(true);
      expect(isIgnored('docs/README.md')).toBe(false);
      expect(isIgnored('docs/section/temp/cache.tmp')).toBe(true);
      expect(isIgnored('docs/logs/2023/debug.log')).toBe(true);
    });
  });

  describe('Edge cases and special patterns', () => {
    beforeEach(() => {
      // file:///root/.gitignore
      addGitIgnore(
        '.gitignore',
        patternBuilder([
          'node_modules/',
          '*.log',
          '!important.log',
          '/root_only.txt',
          'build/**',
          '!build/keep-this/**',
          '**/temp/',
          '!**/temp/critical/',
        ]),
      );
    });

    test('should handle files with multiple extensions', async () => {
      expect(isIgnored('file.backup.log')).toBe(true);
      expect(isIgnored('important.backup.log')).toBe(true);
      expect(isIgnored('important.log.bak')).toBe(false);
    });

    test('should handle paths with spaces and special characters', async () => {
      expect(isIgnored('path with spaces/file.log')).toBe(true);
      expect(isIgnored('special!()file.log')).toBe(true);
      expect(isIgnored('path with spaces/important.log')).toBe(false);
    });

    test('should handle case sensitivity correctly', async () => {
      expect(isIgnored('file.LOG')).toBe(true);
      expect(isIgnored('IMPORTANT.log')).toBe(false);
      expect(isIgnored('ROOT_ONLY.txt')).toBe(true);
    });

    test('should handle paths with leading slashes', async () => {
      expect(isIgnored('root_only.txt')).toBe(true);
      expect(isIgnored('/root_only.txt')).toBe(true);
      expect(isIgnored('nested/root_only.txt')).toBe(false);
    });
  });

  describe('Files outside the repository root', () => {
    beforeEach(() => {
      addGitIgnore('.gitignore', patternBuilder(['*.log']));
      manager.addExcludeFile('*.tmp');
    });

    test('should treat files above the root as not ignored', async () => {
      const externalFile = URI.parse('file:///outside/file.log');

      expect(() => manager.isIgnored(externalFile)).not.toThrow();
      expect(manager.isIgnored(externalFile)).toBe(false);
    });

    test('should skip exclude file checks for files above the root', async () => {
      const externalFile = URI.parse('file:///outside/file.tmp');

      expect(() => manager.isIgnored(externalFile)).not.toThrow();
      expect(manager.isIgnored(externalFile)).toBe(false);
    });
  });

  describe('Nested .gitignore with conflicting rules', () => {
    beforeEach(() => {
      // file:///root/.gitignore
      addGitIgnore('.gitignore', patternBuilder(['*.log', '!important.log', 'temp/']));
      // file:///root/src/.gitignore
      addGitIgnore('src/.gitignore', patternBuilder(['!*.log', 'important.log']));
      // file:///root/src/components/.gitignore
      addGitIgnore('src/components/.gitignore', patternBuilder(['!critical.log', 'temp/']));
    });

    test('should apply rules from the most specific .gitignore', async () => {
      expect(isIgnored('debug.log')).toBe(true);
      expect(isIgnored('important.log')).toBe(false);
      expect(isIgnored('temp/file.txt')).toBe(true);

      expect(isIgnored('src/debug.log')).toBe(false);
      expect(isIgnored('src/important.log')).toBe(true);
      expect(isIgnored('src/temp/file.txt')).toBe(true);

      expect(isIgnored('src/components/debug.log')).toBe(false);
      expect(isIgnored('src/components/important.log')).toBe(true);
      expect(isIgnored('src/components/temp/file.txt')).toBe(true);
    });
  });
});
