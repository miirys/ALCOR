import { logCtxItem, logCtxParent, joinContextsIfDefined } from './log_context';

describe('log_context', () => {
  const ctx1 = logCtxItem('context1', 'value1');
  const ctx2 = logCtxItem('context2', 'value2');
  const ctx3 = logCtxItem('context3', 'value3');

  describe('logCtxItem', () => {
    it('creates a log context item', () => {
      const ctx = logCtxItem('test', 'value');

      expect(ctx.name).toBe('test');
      expect(ctx.value).toBe('value');
      expect(ctx.children).toBeUndefined();
    });
  });

  describe('logCtxParent', () => {
    it('creates a log context parent with children', () => {
      const parent = logCtxParent('parent', ctx1, ctx2);

      expect(parent.name).toBe('parent');
      expect(parent.children).toEqual([ctx1, ctx2]);
      expect(parent.value).toBeUndefined();
    });

    it('filters out undefined children', () => {
      const parent = logCtxParent('parent', ctx1, undefined, ctx2);

      expect(parent.children).toEqual([ctx1, ctx2]);
    });
  });

  describe('joinContextsIfDefined', () => {
    it('returns undefined when no contexts provided', () => {
      const result = joinContextsIfDefined('merged');

      expect(result).toBeUndefined();
    });

    it('returns undefined when all contexts are undefined', () => {
      const result = joinContextsIfDefined('merged', undefined, undefined);

      expect(result).toBeUndefined();
    });

    it('returns the single context when only one defined context provided', () => {
      const result = joinContextsIfDefined('merged', undefined, ctx1, undefined);

      expect(result).toBe(ctx1);
    });

    it('merges multiple contexts into a parent', () => {
      const result = joinContextsIfDefined('merged', ctx1, undefined, ctx2, ctx3);

      expect(result?.name).toBe('merged');
      expect(result?.children).toEqual([ctx1, ctx2, ctx3]);
    });
  });
});
