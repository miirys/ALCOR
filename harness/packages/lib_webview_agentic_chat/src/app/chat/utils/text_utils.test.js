import { truncateToNCharacters } from './text_utils';

describe('Text utils', () => {
  describe('truncateToNCharacters', () => {
    it('should return the original text when it is shorter than the limit', () => {
      const text = 'Short text';
      const result = truncateToNCharacters(text, 20);
      expect(result).toBe('Short text');
    });

    it('should truncate text and add ellipsis when it exceeds the limit', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateToNCharacters(text, 20);
      expect(result).toBe('This is a very long …');
    });

    it('should handle edge case when text length equals the limit', () => {
      const text = 'Exactly twenty chars';
      const result = truncateToNCharacters(text, 20);
      expect(result).toBe('Exactly twenty chars');
    });

    it('should handle empty string', () => {
      const text = '';
      const result = truncateToNCharacters(text, 10);
      expect(result).toBe('');
    });

    it('should handle zero limit', () => {
      const text = 'Some text';
      const result = truncateToNCharacters(text, 0);
      expect(result).toBe('…');
    });

    it('should handle single character limit', () => {
      const text = 'Hello';
      const result = truncateToNCharacters(text, 1);
      expect(result).toBe('H…');
    });
  });
});
