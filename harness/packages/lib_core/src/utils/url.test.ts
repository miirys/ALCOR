import {
  addQueryParams,
  ensureEndsWithSlash,
  ensureRelativePath,
  convertToHttpUrl,
  QueryValue,
} from './url';

describe('URL utilities', () => {
  describe('addQueryParams', () => {
    it('should add query parameters to a URL', () => {
      const url = new URL('https://example.com');
      const query: Record<string, QueryValue> = {
        name: 'test',
        count: 42,
        active: true,
      };

      const result = addQueryParams(url, query);

      expect(result).toBe(url);
      expect(url.searchParams.get('name')).toBe('test');
      expect(url.searchParams.get('count')).toBe('42');
      expect(url.searchParams.get('active')).toBe('true');
      expect(url.href).toBe('https://example.com/?name=test&count=42&active=true');
    });

    it('should handle string arrays in query parameters', () => {
      const url = new URL('https://example.com');
      const query: Record<string, QueryValue> = {
        tags: ['typescript', 'javascript'],
      };

      addQueryParams(url, query);

      expect(url.searchParams.getAll('tags')).toEqual(['typescript,javascript']);
      expect(url.href).toBe('https://example.com/?tags=typescript%2Cjavascript');
    });

    it('should skip null and undefined values', () => {
      const url = new URL('https://example.com');
      const query: Record<string, QueryValue> = {
        name: 'test',
        empty: null,
        missing: undefined,
      };

      addQueryParams(url, query);

      expect(url.searchParams.has('name')).toBe(true);
      expect(url.searchParams.has('empty')).toBe(false);
      expect(url.searchParams.has('missing')).toBe(false);
      expect(url.href).toBe('https://example.com/?name=test');
    });

    it('should append to existing query parameters', () => {
      const url = new URL('https://example.com?existing=value');
      const query: Record<string, QueryValue> = {
        name: 'test',
      };

      addQueryParams(url, query);

      expect(url.searchParams.get('existing')).toBe('value');
      expect(url.searchParams.get('name')).toBe('test');
      expect(url.href).toBe('https://example.com/?existing=value&name=test');
    });
  });

  describe('ensureEndsWithSlash', () => {
    it('should add a trailing slash if missing', () => {
      expect(ensureEndsWithSlash('https://example.com')).toBe('https://example.com/');
      expect(ensureEndsWithSlash('https://example.com/path')).toBe('https://example.com/path/');
    });

    it('should not add a trailing slash if already present', () => {
      expect(ensureEndsWithSlash('https://example.com/')).toBe('https://example.com/');
      expect(ensureEndsWithSlash('https://example.com/path/')).toBe('https://example.com/path/');
    });

    it('should work with URL objects', () => {
      const url = new URL('https://example.com/path');
      expect(ensureEndsWithSlash(url)).toBe('https://example.com/path/');

      const urlWithSlash = new URL('https://example.com/path/');
      expect(ensureEndsWithSlash(urlWithSlash)).toBe('https://example.com/path/');
    });
  });

  describe('ensureRelativePath', () => {
    it('should add ./ prefix to paths without leading slash', () => {
      expect(ensureRelativePath('path/to/resource')).toBe('./path/to/resource');
    });

    it('should replace leading slash with ./', () => {
      expect(ensureRelativePath('/path/to/resource')).toBe('./path/to/resource');
    });

    it('should not modify paths that already start with ./', () => {
      expect(ensureRelativePath('./path/to/resource')).toBe('./path/to/resource');
    });

    it('should handle empty paths', () => {
      expect(ensureRelativePath('')).toBe('./');
    });

    it('should handle paths with just a slash', () => {
      expect(ensureRelativePath('/')).toBe('./');
    });
  });

  describe('convertToHttpUrl', () => {
    it('should convert SSH git URLs to HTTPS', () => {
      expect(convertToHttpUrl('git@gitlab.com:user/repo.git')).toBe(
        'https://gitlab.com/user/repo.git',
      );
      expect(convertToHttpUrl('git@github.com:owner/repository.git')).toBe(
        'https://github.com/owner/repository.git',
      );
    });

    it('should convert git:// protocol to https://', () => {
      expect(convertToHttpUrl('git://gitlab.com/user/repo.git')).toBe(
        'https://gitlab.com/user/repo.git',
      );
    });

    it('should convert SSH with explicit protocol to HTTPS', () => {
      expect(convertToHttpUrl('ssh://git@gitlab.com/user/repo.git')).toBe(
        'https://gitlab.com/user/repo.git',
      );
    });

    it('should leave HTTPS URLs unchanged', () => {
      const httpsUrl = 'https://gitlab.com/user/repo.git';
      expect(convertToHttpUrl(httpsUrl)).toBe(httpsUrl);
    });

    it('should leave HTTP URLs unchanged', () => {
      const httpUrl = 'http://gitlab.com/user/repo.git';
      expect(convertToHttpUrl(httpUrl)).toBe(httpUrl);
    });

    it('should leave unknown formats unchanged', () => {
      const unknownUrl = 'file:///path/to/repo';
      expect(convertToHttpUrl(unknownUrl)).toBe(unknownUrl);
    });

    it('should handle malformed SSH URLs gracefully', () => {
      const malformedUrl = 'git@invalid';
      expect(convertToHttpUrl(malformedUrl)).toBe(malformedUrl);
    });
  });
});
