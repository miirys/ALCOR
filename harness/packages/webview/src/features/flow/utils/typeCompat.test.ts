import { describe, it, expect } from 'vitest';
import type { Compatibility } from './typeCompat';
import { checkTypeCompatibility } from './typeCompat';

describe('checkTypeCompatibility', () => {
  // --------------------------------------------------------------------------
  // Exact matches
  // --------------------------------------------------------------------------

  describe('exact matches', () => {
    it.each(['string', 'number', 'integer', 'boolean', 'array', 'object'] as const)(
      'returns "exact" when both types are "%s"',
      (type) => {
        expect(checkTypeCompatibility(type, type)).toBe<Compatibility>('exact');
      },
    );
  });

  // --------------------------------------------------------------------------
  // Coercible pairs
  // --------------------------------------------------------------------------

  describe('coercible pairs', () => {
    it.each([
      ['string', 'number'],
      ['string', 'integer'],
      ['string', 'boolean'],
      ['number', 'integer'],
      ['number', 'string'],
      ['integer', 'number'],
      ['integer', 'string'],
      ['boolean', 'string'],
    ] as const)('returns "coercible" for expected="%s", actual="%s"', (expected, actual) => {
      expect(checkTypeCompatibility(expected, actual)).toBe<Compatibility>('coercible');
    });
  });

  // --------------------------------------------------------------------------
  // Incompatible pairs
  // --------------------------------------------------------------------------

  describe('incompatible pairs', () => {
    it.each([
      ['array', 'string'],
      ['array', 'number'],
      ['array', 'boolean'],
      ['array', 'object'],
      ['object', 'string'],
      ['object', 'number'],
      ['object', 'boolean'],
      ['object', 'array'],
      ['string', 'array'],
      ['string', 'object'],
      ['number', 'array'],
      ['number', 'object'],
      ['boolean', 'number'],
      ['boolean', 'integer'],
      ['boolean', 'array'],
      ['boolean', 'object'],
    ] as const)('returns "incompatible" for expected="%s", actual="%s"', (expected, actual) => {
      expect(checkTypeCompatibility(expected, actual)).toBe<Compatibility>('incompatible');
    });
  });

  // --------------------------------------------------------------------------
  // Unknown (undefined inputs)
  // --------------------------------------------------------------------------

  describe('unknown when either type is undefined', () => {
    it('returns "unknown" when expected is undefined', () => {
      expect(checkTypeCompatibility(undefined, 'string')).toBe<Compatibility>('unknown');
    });

    it('returns "unknown" when actual is undefined', () => {
      expect(checkTypeCompatibility('string', undefined)).toBe<Compatibility>('unknown');
    });

    it('returns "unknown" when both are undefined', () => {
      expect(checkTypeCompatibility(undefined, undefined)).toBe<Compatibility>('unknown');
    });
  });

  // --------------------------------------------------------------------------
  // Array-typed expected (union types)
  // --------------------------------------------------------------------------

  describe('expected is an array of types', () => {
    it('returns "exact" when actual matches one of the expected types', () => {
      expect(checkTypeCompatibility(['string', 'number'], 'string')).toBe<Compatibility>('exact');
      expect(checkTypeCompatibility(['string', 'number'], 'number')).toBe<Compatibility>('exact');
    });

    it('returns "coercible" when actual is coercible to one of the expected types', () => {
      expect(checkTypeCompatibility(['string', 'boolean'], 'integer')).toBe<Compatibility>(
        'coercible',
      );
    });

    it('returns "incompatible" when actual matches none of the expected types', () => {
      expect(checkTypeCompatibility(['array', 'object'], 'string')).toBe<Compatibility>(
        'incompatible',
      );
    });
  });

  // --------------------------------------------------------------------------
  // Array-typed actual
  // --------------------------------------------------------------------------

  describe('actual is an array of types', () => {
    it('returns "exact" when one of the actual types matches expected', () => {
      expect(checkTypeCompatibility('number', ['string', 'number'])).toBe<Compatibility>('exact');
    });

    it('returns "coercible" when one of the actual types is coercible to expected', () => {
      expect(checkTypeCompatibility('string', ['array', 'boolean'])).toBe<Compatibility>(
        'coercible',
      );
    });

    it('returns "incompatible" when none of the actual types match or coerce', () => {
      expect(checkTypeCompatibility('boolean', ['array', 'object'])).toBe<Compatibility>(
        'incompatible',
      );
    });
  });

  // --------------------------------------------------------------------------
  // Both arrays
  // --------------------------------------------------------------------------

  describe('both expected and actual are arrays', () => {
    it('returns "exact" when the arrays share a common type', () => {
      expect(
        checkTypeCompatibility(['string', 'number'], ['boolean', 'string']),
      ).toBe<Compatibility>('exact');
    });

    it('returns "coercible" when no exact overlap but a coercion path exists', () => {
      expect(
        checkTypeCompatibility(['string', 'boolean'], ['array', 'number']),
      ).toBe<Compatibility>('coercible');
    });

    it('returns "incompatible" when no overlap and no coercion path exists', () => {
      expect(
        checkTypeCompatibility(['array', 'object'], ['boolean', 'string']),
      ).toBe<Compatibility>('incompatible');
    });
  });

  // --------------------------------------------------------------------------
  // Edge: unrecognized type strings
  // --------------------------------------------------------------------------

  describe('unrecognized type strings', () => {
    it('returns "exact" when both sides are the same unrecognized type', () => {
      expect(checkTypeCompatibility('custom', 'custom')).toBe<Compatibility>('exact');
    });

    it('returns "incompatible" when expected is unrecognized and actual differs', () => {
      expect(checkTypeCompatibility('custom', 'string')).toBe<Compatibility>('incompatible');
    });

    it('returns "incompatible" when actual is unrecognized and expected differs', () => {
      expect(checkTypeCompatibility('string', 'custom')).toBe<Compatibility>('incompatible');
    });
  });
});
