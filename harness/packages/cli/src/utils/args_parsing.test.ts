import { describe, it, expect } from '@jest/globals';
import { parseBooleanOption } from './args_parsing';

describe('parseBooleanOption', () => {
  describe('undefined and empty values', () => {
    it.each([
      { input: undefined, expected: false, description: 'undefined' },
      { input: null, expected: false, description: 'null' },
      { input: '', expected: false, description: 'empty string' },
    ])('should return $expected for $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });

  describe('boolean values', () => {
    it.each([
      { input: true, expected: true, description: 'boolean true' },
      { input: false, expected: false, description: 'boolean false' },
    ])('should return $expected for $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });

  describe('truthy string values', () => {
    it.each([
      { input: 'true', expected: true, description: '"true"' },
      { input: 'TRUE', expected: true, description: '"TRUE" (uppercase)' },
      { input: 'True', expected: true, description: '"True" (mixed case)' },
      { input: '1', expected: true, description: '"1"' },
      { input: 'yes', expected: true, description: '"yes"' },
      { input: 'YES', expected: true, description: '"YES" (uppercase)' },
      { input: 'Yes', expected: true, description: '"Yes" (mixed case)' },
      { input: ' true ', expected: true, description: '" true " (with whitespace)' },
      { input: ' yes ', expected: true, description: '" yes " (with whitespace)' },
      { input: ' 1 ', expected: true, description: '" 1 " (with whitespace)' },
    ])('should return $expected for $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });

  describe('falsy string values', () => {
    it.each([
      { input: 'false', expected: false, description: '"false"' },
      { input: 'FALSE', expected: false, description: '"FALSE" (uppercase)' },
      { input: 'False', expected: false, description: '"False" (mixed case)' },
      { input: '0', expected: false, description: '"0"' },
      { input: 'no', expected: false, description: '"no"' },
      { input: 'NO', expected: false, description: '"NO" (uppercase)' },
      { input: 'No', expected: false, description: '"No" (mixed case)' },
      { input: ' false ', expected: false, description: '" false " (with whitespace)' },
      { input: ' no ', expected: false, description: '" no " (with whitespace)' },
      { input: ' 0 ', expected: false, description: '" 0 " (with whitespace)' },
    ])('should return $expected for $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });

  describe('backwards compatibility - other non-empty strings', () => {
    it.each([
      { input: 'random', expected: true, description: '"random" (backwards compatibility)' },
      { input: 'enabled', expected: true, description: '"enabled"' },
      { input: 'on', expected: true, description: '"on"' },
      { input: '2', expected: true, description: '"2"' },
      { input: '-1', expected: true, description: '"-1"' },
      { input: 'anything', expected: true, description: '"anything"' },
    ])('should return $expected for $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it.each([
      {
        input: '   ',
        expected: true,
        description: 'strings with only whitespace (backwards compatibility)',
      },
      { input: '\ttrue\t', expected: true, description: 'tab characters in truthy values' },
      { input: '\ntrue\n', expected: true, description: 'newline characters in truthy values' },
      { input: '\tfalse\t', expected: false, description: 'tab characters in falsy values' },
    ])('should handle $description', ({ input, expected }) => {
      expect(parseBooleanOption(input)).toBe(expected);
    });
  });
});
