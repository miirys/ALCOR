import { parseSpecifier } from './plugin_specifier';

describe('plugin/plugin_specifier', () => {
  describe('parseSpecifier', () => {
    describe('when the specifier is plain', () => {
      it('splits into plugin and marketplace', () => {
        expect(parseSpecifier('foo@bar')).toEqual({ plugin: 'foo', marketplace: 'bar' });
      });
    });

    describe('when the specifier contains an extra @', () => {
      it('splits on the last @, leaving an unsafe plugin segment that is rejected', () => {
        expect(() => parseSpecifier('foo@scope@mkt')).toThrow(/not a safe path segment/);
      });
    });

    describe('when the specifier is malformed', () => {
      it.each([
        ['no @', 'foo'],
        ['leading @', '@bar'],
        ['trailing @', 'foo@'],
      ])('rejects %s', (_label, raw) => {
        expect(() => parseSpecifier(raw)).toThrow(/Invalid plugin specifier/);
      });
    });

    describe('when the marketplace segment is unsafe', () => {
      it('rejects it', () => {
        expect(() => parseSpecifier('foo@../etc')).toThrow(/not a safe path segment/);
      });
    });

    describe('when the plugin segment is unsafe', () => {
      it('rejects it', () => {
        expect(() => parseSpecifier('..@mkt')).toThrow(/not a safe path segment/);
      });
    });
  });
});
