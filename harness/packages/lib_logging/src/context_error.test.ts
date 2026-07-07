import { isContextError, getCtx } from './context_error';
import { logCtxItem } from './log_context';

describe('ContextError', () => {
  const contextError = {
    ctx: logCtxItem('test', 'value'),
  };
  const notAContextError = {
    message: 'test error',
  };

  describe('isContextError', () => {
    it('returns true for objects with ctx property that has a name', () => {
      expect(isContextError(contextError)).toBe(true);
    });

    it('returns false for objects without ctx property', () => {
      expect(isContextError(notAContextError)).toBe(false);
    });
  });

  describe('getCtx', () => {
    it('returns ctx for valid ContextError', () => {
      expect(getCtx(contextError)).toBe(contextError.ctx);
    });

    it('returns undefined for objects without ctx', () => {
      expect(getCtx(notAContextError)).toBeUndefined();
    });
  });
});
