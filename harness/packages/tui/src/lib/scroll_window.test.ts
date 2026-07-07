import { describe, it, expect } from '@jest/globals';
import { computeScrollWindow } from './scroll_window';

describe('computeScrollWindow', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  describe('when items fewer than maxVisible', () => {
    it('returns all items with no scroll indicators', () => {
      const result = computeScrollWindow(['x', 'y'], 0, 5);

      expect(result.visibleItems).toEqual(['x', 'y']);
      expect(result.showScrollUp).toBe(false);
      expect(result.showScrollDown).toBe(false);
    });
  });

  describe('when items equal to maxVisible', () => {
    it('returns all items with no scroll indicators', () => {
      const result = computeScrollWindow(items.slice(0, 3), 1, 3);

      expect(result.visibleItems).toEqual(['a', 'b', 'c']);
      expect(result.showScrollUp).toBe(false);
      expect(result.showScrollDown).toBe(false);
    });
  });

  describe('when items exceed maxVisible', () => {
    describe('when focus is at the end', () => {
      it('shows up indicator but not down', () => {
        const result = computeScrollWindow(items, 7, 3);

        expect(result.showScrollUp).toBe(true);
        expect(result.showScrollDown).toBe(false);
        expect(result.visibleItems).toEqual(['f', 'g', 'h']);
      });
    });

    describe('when focus is at the start', () => {
      it('shows down indicator but not up', () => {
        const result = computeScrollWindow(items, 0, 3);

        expect(result.showScrollUp).toBe(false);
        expect(result.showScrollDown).toBe(true);
        expect(result.visibleItems).toEqual(['a', 'b', 'c']);
      });
    });

    describe('when focus is in the middle', () => {
      it('shows both indicators', () => {
        const result = computeScrollWindow(items, 4, 3);

        expect(result.showScrollUp).toBe(true);
        expect(result.showScrollDown).toBe(true);
      });
    });
  });

  describe('visibleItems always contains the focused item', () => {
    it.each([0, 1, 2, 3, 4, 5, 6, 7])('contains focused item at index %i', (focusedIndex) => {
      const result = computeScrollWindow(items, focusedIndex, 3);

      expect(result.visibleItems).toContain(items[focusedIndex]);
    });
  });

  describe('when items are empty', () => {
    it('returns empty result', () => {
      const result = computeScrollWindow([], 0, 5);

      expect(result.visibleItems).toEqual([]);
      expect(result.windowStart).toBe(0);
      expect(result.windowEnd).toBe(0);
      expect(result.showScrollUp).toBe(false);
      expect(result.showScrollDown).toBe(false);
    });
  });

  describe('edge cases for maxVisible', () => {
    describe('when maxVisible is 0', () => {
      it('returns empty visible items', () => {
        const result = computeScrollWindow(items, 0, 0);

        expect(result.visibleItems).toEqual([]);
      });
    });

    describe('when maxVisible is 1', () => {
      it('returns only the focused item', () => {
        const result = computeScrollWindow(items, 3, 1);

        expect(result.visibleItems).toEqual(['d']);
        expect(result.showScrollUp).toBe(true);
        expect(result.showScrollDown).toBe(true);
      });
    });
  });

  describe('window boundaries', () => {
    it('reports correct windowStart and windowEnd', () => {
      const result = computeScrollWindow(items, 5, 3);

      expect(result.windowStart).toBe(3);
      expect(result.windowEnd).toBe(6);
      expect(result.visibleItems).toEqual(['d', 'e', 'f']);
    });

    it('expands backward when forward space is exhausted', () => {
      const result = computeScrollWindow(items, 7, 3);

      expect(result.windowStart).toBe(5);
      expect(result.windowEnd).toBe(8);
      expect(result.visibleItems).toEqual(['f', 'g', 'h']);
    });
  });

  describe('when focusedIndex is out of bounds', () => {
    it('clamps negative focusedIndex to 0', () => {
      const result = computeScrollWindow(items, -5, 3);

      expect(result.visibleItems).toContain('a');
      expect(result.showScrollUp).toBe(false);
    });

    it('clamps focusedIndex beyond array length', () => {
      const result = computeScrollWindow(items, 100, 3);

      expect(result.visibleItems).toContain('h');
      expect(result.showScrollDown).toBe(false);
    });
  });

  describe('with measureItem (variable-height items)', () => {
    const wideLines = ['short', 'this is a very long line that wraps', 'tiny', 'medium length'];
    const measure = (line: string) => Math.max(1, Math.ceil(line.length / 10));

    it('respects row budget when items have variable height', () => {
      const result = computeScrollWindow(wideLines, 0, 3, measure);

      expect(result.visibleItems).toContain('short');
      const totalRows = result.visibleItems.reduce((sum, l) => sum + measure(l), 0);
      expect(totalRows).toBeLessThanOrEqual(3);
    });

    it('always includes the focused item even if it exceeds budget', () => {
      const result = computeScrollWindow(wideLines, 1, 2, measure);

      expect(result.visibleItems).toEqual(['this is a very long line that wraps']);
    });
  });
});
