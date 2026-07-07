import {
  parseMarketplaceCatalog,
  parseKnownMarketplacesFile,
  parsePluginsConfigFile,
  SchemaValidationError,
} from './parse';

describe('schema/parse', () => {
  describe('parseMarketplaceCatalog', () => {
    const validCatalog = {
      name: 'duo-demo',
      owner: { name: 'GitLab' },
      plugins: [{ name: 'gitlab-helper', source: './plugins/gitlab-helper' }],
    };

    describe('when the input is valid', () => {
      it('returns the parsed catalog', () => {
        const result = parseMarketplaceCatalog(validCatalog);
        expect(result.name).toBe('duo-demo');
        expect(result.plugins).toHaveLength(1);
      });
    });

    describe('when the input has unrecognized fields', () => {
      it('preserves them (loose schema)', () => {
        const result = parseMarketplaceCatalog({ ...validCatalog, futureField: 'keep me' });
        expect((result as Record<string, unknown>).futureField).toBe('keep me');
      });
    });

    describe('when the input is empty', () => {
      it('throws a SchemaValidationError naming the file', () => {
        expect(() => parseMarketplaceCatalog({})).toThrow(SchemaValidationError);
        expect(() => parseMarketplaceCatalog({})).toThrow(/marketplace\.json is invalid/);
      });
    });

    describe('when the name is not kebab-case', () => {
      it('rejects it with a readable message', () => {
        expect(() => parseMarketplaceCatalog({ ...validCatalog, name: 'Not Kebab' })).toThrow(
          /kebab-case/,
        );
      });
    });

    describe('when the owner is missing', () => {
      it('rejects it', () => {
        const withoutOwner = { name: validCatalog.name, plugins: validCatalog.plugins };
        expect(() => parseMarketplaceCatalog(withoutOwner)).toThrow(SchemaValidationError);
      });
    });
  });

  describe('parseKnownMarketplacesFile', () => {
    const validFile = {
      'duo-demo': {
        lastUpdated: '2026-06-25T00:00:00.000Z',
        installLocation: '/home/user/.config/gitlab/duo/marketplaces/duo-demo',
        source: { source: 'directory', path: '/some/path' },
      },
    };

    describe('when the input is valid', () => {
      it('returns the parsed registry', () => {
        const result = parseKnownMarketplacesFile(validFile);
        expect(Object.keys(result)).toEqual(['duo-demo']);
      });
    });

    describe('when the input is corrupt', () => {
      it('throws a SchemaValidationError naming the file', () => {
        expect(() => parseKnownMarketplacesFile({ 'duo-demo': { source: 'oops' } })).toThrow(
          /known_marketplaces\.json is invalid/,
        );
      });
    });
  });

  describe('parsePluginsConfigFile', () => {
    describe('when the input is valid', () => {
      it('returns the parsed config', () => {
        const result = parsePluginsConfigFile({ enabledPlugins: { 'foo@mkt': true } });
        expect(result.enabledPlugins).toEqual({ 'foo@mkt': true });
      });
    });

    describe('when the input is an empty object', () => {
      it('returns an empty config', () => {
        expect(parsePluginsConfigFile({})).toEqual({});
      });
    });

    describe('when the input is corrupt', () => {
      it('throws a SchemaValidationError naming the file', () => {
        expect(() => parsePluginsConfigFile({ enabledPlugins: { 'foo@mkt': 'nope' } })).toThrow(
          /plugins\.json is invalid/,
        );
      });
    });
  });
});
