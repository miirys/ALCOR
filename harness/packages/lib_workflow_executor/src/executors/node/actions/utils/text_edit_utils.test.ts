import { createTextEditsFromContent } from './text_edit_utils';

describe('createTextEditsFromContent', () => {
  const oldString = 'old content';
  const newString = 'new content';

  it('should create text edits for single occurrence', () => {
    const content = `file with ${oldString} to edit`;
    const result = createTextEditsFromContent(content, oldString, newString);

    expect(result).toEqual([
      {
        newText: 'new content',
        range: { end: { character: 21, line: 0 }, start: { character: 10, line: 0 } },
      },
    ]);
  });

  it('should create text edits for multiple occurrences', () => {
    const content = `${oldString} in multiple ${oldString} places`;
    const result = createTextEditsFromContent(content, oldString, newString);

    expect(result).toEqual([
      {
        newText: 'new content',
        range: { end: { character: 11, line: 0 }, start: { character: 0, line: 0 } },
      },
      {
        newText: 'new content',
        range: { end: { character: 35, line: 0 }, start: { character: 24, line: 0 } },
      },
    ]);
  });

  describe('multi-line content handling', () => {
    it.each([
      { description: 'LF newlines', newLine: '\n' },
      { description: 'CRLF newlines', newLine: '\r\n' },
      { description: 'CR newlines', newLine: '\r' },
    ])('handles replacements across multiple lines with $description', ({ newLine }) => {
      const multiLineContent = `first line${newLine}second line with ${oldString}${newLine}third line`;
      const result = createTextEditsFromContent(multiLineContent, oldString, newString);

      expect(result).toEqual([
        {
          newText: 'new content',
          range: {
            start: { line: 1, character: 17 },
            end: { line: 1, character: 28 },
          },
        },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles empty oldString gracefully', () => {
      const content = 'some content';
      const result = createTextEditsFromContent(content, '', newString);

      expect(result).toEqual([]);
    });

    it('handles empty newString (deletion)', () => {
      const content = `prefix ${oldString} suffix`;
      const result = createTextEditsFromContent(content, oldString, '');

      expect(result).toEqual([
        {
          newText: '',
          range: {
            start: { line: 0, character: 7 },
            end: { line: 0, character: 18 },
          },
        },
      ]);
    });

    it('handles empty file content', () => {
      const result = createTextEditsFromContent('', oldString, newString);

      expect(result).toEqual([]);
    });

    it('handles replacement when newString contains oldString', () => {
      const recursiveOldString = 'foo';
      const recursiveNewString = 'foo bar';
      const content = `${recursiveOldString} and ${recursiveOldString}`;
      const result = createTextEditsFromContent(content, recursiveOldString, recursiveNewString);

      expect(result).toEqual([
        {
          newText: 'foo bar',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        },
        {
          newText: 'foo bar',
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 11 } },
        },
      ]);
    });

    it('handles no matches found', () => {
      const content = 'file with no matches';
      const result = createTextEditsFromContent(content, oldString, newString);

      expect(result).toEqual([]);
    });

    it('prevents overlapping ranges as required by LSP spec', () => {
      // Content: "abcabcabc" - oldString "abcabc" could potentially match at:
      // - Position 0-5: "abcabc" (characters 0-5)
      // - Position 3-8: "abcabc" (characters 3-8) <- would overlap with first match by 3 characters
      const content = 'abcabcabc';
      const overlappingOldString = 'abcabc';
      const replacementString = 'XYZ';

      const result = createTextEditsFromContent(content, overlappingOldString, replacementString);

      expect(result).toHaveLength(1);
      expect(result).toEqual([
        {
          newText: 'XYZ',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, // first match returned
        },
      ]);
    });
  });
});
