import { normalizeKittyInput } from './handle_kitty_input';
import { createKittyKey } from './test_helpers';

describe('normalizeKittyInput', () => {
  describe('key name normalization', () => {
    it.each([
      ['ESC', 'escape'],
      ['ENTER', 'return'],
      ['UP', 'up'],
      ['DOWN', 'down'],
      ['LEFT', 'left'],
      ['RIGHT', 'right'],
      ['PAGE_UP', 'pageup'],
      ['PAGE_DOWN', 'pagedown'],
      ['F1', 'f1'],
      ['F12', 'f12'],
      ['PASTE', 'paste'],
      ['A', 'A'],
      [' ', 'space'],
    ])('normalizes Kitty %s to %s', (kittyName, expectedName) => {
      const result = normalizeKittyInput(createKittyKey({ name: kittyName, text: '' }));
      expect(result.name).toBe(expectedName);
      expect(result.source).toBe('kitty');
    });
  });

  describe('modifiers', () => {
    it('preserves ctrl, alt→meta, shift, and super modifiers', () => {
      const result = normalizeKittyInput(
        createKittyKey({ name: 'C', ctrl: true, alt: true, shift: true, super: true }),
      );

      expect(result.ctrl).toBe(true);
      expect(result.meta).toBe(true);
      expect(result.option).toBe(true); // alias for meta
      expect(result.shift).toBe(true);
      expect(result.super).toBe(true);
    });
  });

  describe('kitty-specific features', () => {
    it('preserves event type, lock states, and base code', () => {
      const result = normalizeKittyInput(
        createKittyKey({
          name: 'A',
          event: 'release',
          caps_lock: true,
          num_lock: true,
          code: { base: 65 },
        }),
      );

      expect(result.eventType).toBe('release');
      expect(result.capsLock).toBe(true);
      expect(result.numLock).toBe(true);
      expect(result.baseCode).toBe(65);
    });

    it('detects number keys', () => {
      const result = normalizeKittyInput(createKittyKey({ name: '5', text: '5' }));
      expect(result.number).toBe(true);
    });

    it('adds timestamp', () => {
      const result = normalizeKittyInput(createKittyKey());
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });
});
