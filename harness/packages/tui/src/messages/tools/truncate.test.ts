import { describe, it, expect } from '@jest/globals';
import { truncate, isTruncatable, formatJsonOutput } from './truncate';

describe('truncate', () => {
  describe('when text is empty', () => {
    it('returns empty string', () => {
      expect(truncate('')).toBe('');
    });
  });

  describe('when text is under limits', () => {
    it('returns original text unchanged', () => {
      const text = 'line 1\nline 2\nline 3';

      expect(truncate(text)).toBe(text);
    });
  });

  describe('when text has exactly 5 lines', () => {
    it('returns original text unchanged', () => {
      const text = 'line 1\nline 2\nline 3\nline 4\nline 5';

      expect(truncate(text)).toBe(text);
    });
  });

  describe('when a line has exactly 120 characters', () => {
    it('returns original text unchanged', () => {
      const text = 'z'.repeat(120);

      expect(truncate(text)).toBe(text);
    });
  });

  describe('when text exceeds 5 lines', () => {
    it('truncates to first 5 lines', () => {
      const text = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7';

      expect(truncate(text)).toBe('line 1\nline 2\nline 3\nline 4\nline 5');
    });
  });

  describe('when a line exceeds 120 characters', () => {
    it('truncates the line and adds ellipsis', () => {
      const longLine = 'z'.repeat(150);

      const result = truncate(longLine);

      expect(result).toBe(`${'z'.repeat(117)}...`);
      expect(result.length).toBe(120);
    });
  });
});

describe('isTruncatable', () => {
  describe('when text is empty', () => {
    it('returns false', () => {
      expect(isTruncatable('')).toBe(false);
    });
  });

  describe('when text is under limits', () => {
    it('returns false', () => {
      expect(isTruncatable('short text')).toBe(false);
    });
  });

  describe('when text has exactly 5 lines', () => {
    it('returns false', () => {
      const text = 'line 1\nline 2\nline 3\nline 4\nline 5';

      expect(isTruncatable(text)).toBe(false);
    });
  });

  describe('when a line has exactly 120 characters', () => {
    it('returns false', () => {
      const text = 'z'.repeat(120);

      expect(isTruncatable(text)).toBe(false);
    });
  });

  describe('when text exceeds 5 lines', () => {
    it('returns true', () => {
      const text = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6';

      expect(isTruncatable(text)).toBe(true);
    });
  });

  describe('when a line exceeds 120 characters', () => {
    it('returns true', () => {
      const longLine = 'z'.repeat(150);

      expect(isTruncatable(longLine)).toBe(true);
    });
  });
});

describe('formatJsonOutput', () => {
  describe('when text is a stringified JSON object', () => {
    it('pretty-prints it across multiple indented lines', () => {
      expect(formatJsonOutput('{"search_results":[{"title":"Duo","url":"/duo"}]}')).toBe(
        '{\n  "search_results": [\n    {\n      "title": "Duo",\n      "url": "/duo"\n    }\n  ]\n}',
      );
    });
  });

  describe('when text is a stringified JSON array', () => {
    it('pretty-prints it', () => {
      expect(formatJsonOutput('[{"a":1},{"b":2}]')).toBe(
        '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]',
      );
    });
  });

  describe('when text has surrounding whitespace around JSON', () => {
    it('still parses and pretty-prints it', () => {
      const text = '  \n{"a":1}\n  ';

      expect(formatJsonOutput(text)).toBe('{\n  "a": 1\n}');
    });
  });

  describe('when text is not valid JSON', () => {
    it('returns the original text unchanged', () => {
      const text = 'PR created: #42';

      expect(formatJsonOutput(text)).toBe(text);
    });
  });

  describe('when text is a JSON primitive', () => {
    it('returns the original text unchanged for a number', () => {
      expect(formatJsonOutput('42')).toBe('42');
    });

    it('returns the original text unchanged for a quoted string', () => {
      expect(formatJsonOutput('"foo"')).toBe('"foo"');
    });

    it('returns the original text unchanged for a boolean', () => {
      expect(formatJsonOutput('true')).toBe('true');
    });

    it('returns the original text unchanged for null', () => {
      expect(formatJsonOutput('null')).toBe('null');
    });
  });

  describe('when text is empty', () => {
    it('returns empty string', () => {
      expect(formatJsonOutput('')).toBe('');
    });
  });
});
