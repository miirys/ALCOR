import { assertPathSegment, isValidPathSegment } from './path_segment';

describe('plugin/path_segment', () => {
  describe('isValidPathSegment', () => {
    it.each(['plugin', 'my-plugin', 'my_plugin', 'plugin.v2', '1.2.3', 'A_b-9'])(
      'accepts the safe segment %p',
      (segment) => {
        expect(isValidPathSegment(segment)).toBe(true);
      },
    );

    it.each([
      ['empty string', ''],
      ['dot', '.'],
      ['dot-dot', '..'],
      ['leading dash', '-rf'],
      ['forward slash', 'a/b'],
      ['backslash', 'a\\b'],
      ['null byte', 'a\u0000b'],
      ['control char', 'a\u0001b'],
      ['del char', 'a\u007fb'],
      ['space', 'a b'],
    ])('rejects %s', (_label, segment) => {
      expect(isValidPathSegment(segment)).toBe(false);
    });
  });

  describe('assertPathSegment', () => {
    describe('when the segment is safe', () => {
      it('passes', () => {
        expect(() => assertPathSegment('safe-name', 'plugin name')).not.toThrow();
      });
    });

    describe('when the segment is unsafe', () => {
      it('throws a labelled error', () => {
        expect(() => assertPathSegment('../escape', 'plugin name')).toThrow(
          /Invalid plugin name: .* is not a safe path segment/,
        );
      });
    });
  });
});
