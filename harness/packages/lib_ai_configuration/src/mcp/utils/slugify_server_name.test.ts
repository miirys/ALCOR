import { slugifyServerName } from './slugify_server_name';

describe('slugifyServerName', () => {
  describe('passthrough for already-valid names', () => {
    it.each([
      ['simple', 'simple'],
      ['with_underscores', 'with_underscores'],
      ['with-dashes', 'with-dashes'],
      ['with.dots', 'with.dots'],
      ['server1', 'server1'],
      ['my_server.v1-beta', 'my_server.v1-beta'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('lowercasing', () => {
    it.each([
      ['MyServer', 'myserver'],
      ['ALLCAPS', 'allcaps'],
      ['Library_Docs', 'library_docs'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('space handling', () => {
    it.each([
      ['My Cool Server', 'my_cool_server'],
      ['library docs', 'library_docs'],
      ['  leading trailing  ', 'leading_trailing'],
      ['multiple   spaces', 'multiple_spaces'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('special character handling', () => {
    it.each([
      ['server@123', 'server_123'],
      ['my/server/name', 'my_server_name'],
      ['hello (world)', 'hello_world'],
      ['a & b', 'a_b'],
      ['emoji🚀server', 'emoji_server'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('preserves dots and hyphens', () => {
    it.each([
      ['server.v2', 'server.v2'],
      ['my-server', 'my-server'],
      ['my-server.v1.0', 'my-server.v1.0'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('underscore collapsing', () => {
    it.each([
      ['a___b', 'a_b'],
      ['a _ _ b', 'a_b'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(slugifyServerName(input)).toBe(expected);
    });
  });

  describe('truncation', () => {
    it('truncates to 250 characters', () => {
      const long = 'a'.repeat(300);
      const result = slugifyServerName(long);
      expect(result).toHaveLength(250);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(slugifyServerName('')).toBeNull();
    });

    it('returns null for only special characters', () => {
      expect(slugifyServerName('!!!@@@###')).toBeNull();
    });

    it('returns null for only whitespace', () => {
      expect(slugifyServerName('   ')).toBeNull();
    });
  });
});
