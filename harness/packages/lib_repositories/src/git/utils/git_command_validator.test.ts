import {
  parseGitArgs,
  isArgLengthValid,
  isCommandStrLengthValid,
  MAX_ARGS_STR_TOTAL_BYTES,
} from './git_command_validator';

describe('Git Command Validation', () => {
  describe('parseGitArgs', () => {
    it.each([
      ['simple arguments', 'arg1 arg2 arg3', ['arg1', 'arg2', 'arg3']],
      ['single quoted arguments', "'arg with spaces' arg2", ['arg with spaces', 'arg2']],
      ['double quoted arguments', '"arg with spaces" arg2', ['arg with spaces', 'arg2']],
      ['escaped characters', 'arg\\ with\\ spaces arg2', ['arg with spaces', 'arg2']],
      ['empty string', '', []],
      ['mixed quotes', `"double" 'single' unquoted`, ['double', 'single', 'unquoted']],
      ['empty single quotes', "arg1 '' arg2", ['arg1', '', 'arg2']],
      ['empty double quotes', 'arg1 "" arg2', ['arg1', '', 'arg2']],
      ['escaped quotes inside double quotes', '"say \\"hi\\"" arg2', ['say "hi"', 'arg2']],
      ['single quote inside double quotes', '"say \'hi\'" arg2', ["say 'hi'", 'arg2']],
      ['backslashes preserved', 'path\\\\to\\\\file', ['path\\to\\file']],

      // Common git argument patterns
      ['flags with values', '-m "Initial commit"', ['-m', 'Initial commit']],
      [
        'file paths with spaces',
        '"my file.txt" "another file.js"',
        ['my file.txt', 'another file.js'],
      ],
      ['multiple flags', '-m "msg" --author "John Doe"', ['-m', 'msg', '--author', 'John Doe']],
      ['branch names with slashes', 'feature/my-branch', ['feature/my-branch']],
      ['HEAD references', 'HEAD~2', ['HEAD~2']],
      ['long flags with dashes', '--force-with-lease', ['--force-with-lease']],
      ['flags with equals', '--option=value', ['--option=value']],
      ['remote refs', 'origin/main', ['origin/main']],
      ['relative paths', '../relative/path', ['../relative/path']],

      // Glob patterns (passed as literals to git)
      ['asterisk wildcard', '*.txt', ['*.txt']],
      ['question mark wildcard', 'file?.log', ['file?.log']],
      ['recursive glob', '**/*.js', ['**/*.js']],
      ['glob with path', 'src/**/*.ts', ['src/**/*.ts']],
      ['multiple globs', '*.txt *.js', ['*.txt', '*.js']],
      ['glob in brackets', '[abc].txt', ['[abc].txt']],
      ['negation glob', '!*.test.js', ['!*.test.js']],
      ['glob with git command', 'add *.txt', ['add', '*.txt']],

      // Operators (passed as literals to git)
      ['AND operator', 'file.txt && echo done', ['file.txt', '&&', 'echo', 'done']],
      ['OR operator', 'file.txt || echo bad', ['file.txt', '||', 'echo', 'bad']],
      ['pipe operator', 'file.txt | cat', ['file.txt', '|', 'cat']],
      ['output redirect', 'file.txt > output', ['file.txt', '>', 'output']],
      ['input redirect', '< file.txt', ['<', 'file.txt']],
      ['append redirect', 'file.txt >> log', ['file.txt', '>>', 'log']],
      ['semicolon separator', 'file.txt ; rm bad', ['file.txt', ';', 'rm', 'bad']],
      ['background process', 'file.txt &', ['file.txt', '&']],

      // Mixed patterns
      ['glob and operator', '*.txt && echo done', ['*.txt', '&&', 'echo', 'done']],
      ['multiple operators', 'a && b || c', ['a', '&&', 'b', '||', 'c']],
      ['quoted glob preserved', '"*.txt"', ['*.txt']],
      ['quoted operator preserved', '"&&"', ['&&']],

      // Edge cases
      ['multiple spaces', 'arg1    arg2', ['arg1', 'arg2']],
      ['leading spaces', '  arg1 arg2', ['arg1', 'arg2']],
      ['trailing spaces', 'arg1 arg2  ', ['arg1', 'arg2']],
      ['tabs between args', 'arg1\targ2', ['arg1', 'arg2']],
      ['newline in quoted string', '"-m\nline1\nline2"', ['-m\nline1\nline2']],
      ['hyphenated filenames', 'my-file-name.txt', ['my-file-name.txt']],
    ])('should parse %s', (_, input, expected) => {
      expect(parseGitArgs(input)).toEqual(expected);
    });

    describe('special characters as literals', () => {
      it('should pass globs as literal strings (no expansion)', () => {
        // When shell=false, these won't expand - they're literal arguments
        expect(parseGitArgs('add *.txt')).toEqual(['add', '*.txt']);
        expect(parseGitArgs('rm **/*.js')).toEqual(['rm', '**/*.js']);
      });

      it('should pass operators as literal strings (no execution)', () => {
        // When shell=false, these won't execute - they're literal arguments
        expect(parseGitArgs('commit && push')).toEqual(['commit', '&&', 'push']);
        expect(parseGitArgs('log | grep bug')).toEqual(['log', '|', 'grep', 'bug']);
      });

      it('should preserve special characters in quotes', () => {
        expect(parseGitArgs('"file*.txt"')).toEqual(['file*.txt']);
        expect(parseGitArgs("'&&'")).toEqual(['&&']);
        expect(parseGitArgs('"-m" "Fix && update"')).toEqual(['-m', 'Fix && update']);
      });
    });
  });

  describe('isCommandStrLengthValid', () => {
    describe.each([
      ['normal command', 'git', 'status', true],
      ['empty strings', '', '', true],
      ['empty args', 'git', '', true],
      ['empty command', '', 'status', true],
      ['at limit', 'git', 'a'.repeat(MAX_ARGS_STR_TOTAL_BYTES - 3), false],
      ['just under limit', 'git', 'a'.repeat(MAX_ARGS_STR_TOTAL_BYTES - 4), true],
      ['way over limit', 'git', 'a'.repeat(MAX_ARGS_STR_TOTAL_BYTES), false],
    ])('when %s', (_, command, args, expected) => {
      it(`returns ${expected}`, () => {
        expect(isCommandStrLengthValid(command, args)).toBe(expected);
      });
    });
  });

  describe('isArgLengthValid', () => {
    it.each([
      ['normal argument', 'normal-argument', true],
      ['100 characters', 'a'.repeat(100), true],
      ['1000 characters', 'a'.repeat(1000), true],
      ['1001 characters', 'a'.repeat(1001), false],
    ])('%s', (_, input, expected) => {
      expect(isArgLengthValid(input)).toBe(expected);
    });
  });
});
