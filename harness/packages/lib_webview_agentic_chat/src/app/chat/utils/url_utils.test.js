import { isExternalURL } from './url_utils';

describe('isExternalURL', () => {
  let originalLocation;

  beforeAll(() => {
    originalLocation = window.location;
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://example.com',
      },
      writable: true,
    });
  });

  describe('URL validation', () => {
    it.each([
      // External URLs
      ['https://external.com/path', 'different domain', true],
      ['https://sub.external.com/path', 'different subdomain', true],
      ['http://example.com/path', 'different protocol with same domain', true],
      ['https://example.com:8080/path', 'different port with same domain', true],

      // Internal URLs
      ['https://example.com/path', 'same origin absolute URL', false],
      ['/internal/path', 'relative path', false],
      ['/path?param=value', 'relative path with query params', false],
      ['/path#section', 'relative path with hash', false],
      ['/', 'root path', false],
      ['./path', 'current directory path', false],
      ['../path', 'parent directory path', false],

      // Edge cases
      ['https://example.com/path with spaces', 'URL with spaces', false],
      ['https://example.com/пуť', 'URL with unicode characters', false],
    ])('returns %s for %s', (url, description, expected) => {
      expect(isExternalURL(url)).toBe(expected);
    });
  });
});
