import { redactUrlCredential } from './redact_url_password';

describe('redactUrlCredential', () => {
  describe('URLs with credentials', () => {
    it.each([
      ['http://user:secret@example.com', 'http://user:******@example.com/'],
      [
        'https://user:password123@proxy.corp.com:8080',
        'https://user:***********@proxy.corp.com:8080/',
      ],
      ['http://admin:p@ss:word@host.com', 'http://admin:*************@host.com/'],
      ['http://user:@example.com', 'http://user@example.com/'],
      ['http://user:a@example.com/path?query=1', 'http://user:*@example.com/path?query=1'],
    ])('redacts password in %s', (input, expected) => {
      expect(redactUrlCredential(input)).toBe(expected);
    });
  });

  describe('URLs without credentials', () => {
    it.each([
      ['http://example.com', 'http://example.com/'],
      ['https://example.com:8080/path', 'https://example.com:8080/path'],
      ['http://user@example.com', 'http://user@example.com/'],
      ['https://example.com/path?query=value#hash', 'https://example.com/path?query=value#hash'],
    ])('passes through %s unchanged (except normalization)', (input, expected) => {
      expect(redactUrlCredential(input)).toBe(expected);
    });
  });

  describe('invalid URLs', () => {
    it.each([
      ['not-a-url', '*********'],
      ['', ''],
      ['justastring', '***********'],
      ['://invalid', '**********'],
      ['secret-password-here', '********************'],
    ])('returns asterisks for invalid input: %s', (input, expected) => {
      expect(redactUrlCredential(input)).toBe(expected);
    });
  });
});
