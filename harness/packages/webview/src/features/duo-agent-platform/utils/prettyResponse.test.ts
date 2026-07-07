import { describe, it, expect } from 'vitest';
import { prettyResponse } from './prettyResponse';

describe('prettyResponse', () => {
  describe('null / empty inputs', () => {
    it('returns null for null', () => {
      expect(prettyResponse(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(prettyResponse(undefined)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(prettyResponse('')).toBeNull();
    });
  });

  describe('string values', () => {
    it('returns a plain string as-is', () => {
      expect(prettyResponse('hello world')).toBe('hello world');
    });

    it('pretty-prints a JSON string', () => {
      const input = JSON.stringify({ tree: [{ id: '1', name: 'src' }] });
      const expected = JSON.stringify({ tree: [{ id: '1', name: 'src' }] }, null, 2);
      expect(prettyResponse(input)).toBe(expected);
    });
  });

  describe('object values', () => {
    it('pretty-prints a plain object', () => {
      const input = { status: 'success', count: 3 };
      expect(prettyResponse(input)).toBe(JSON.stringify(input, null, 2));
    });

    it('recurses into a content field that is a plain string', () => {
      expect(prettyResponse({ content: 'Issue created' })).toBe('Issue created');
    });

    it('recurses into a content field that is a JSON string and pretty-prints it', () => {
      const inner = { tree: [{ id: '1', name: 'src' }] };
      const input = { content: JSON.stringify(inner) };
      expect(prettyResponse(input)).toBe(JSON.stringify(inner, null, 2));
    });

    it('returns null when content field is an empty string', () => {
      expect(prettyResponse({ content: '' })).toBeNull();
    });
  });
});
