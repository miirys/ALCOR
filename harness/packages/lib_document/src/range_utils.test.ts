import { Position, Range } from 'vscode-languageserver-protocol';
import { rangeOverlapsAny } from './range_utils';

describe('range_utils', () => {
  const createPosition = (line: number, character: number): Position => ({
    line,
    character,
  });

  const createRange = (
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ): Range => ({
    start: createPosition(startLine, startChar),
    end: createPosition(endLine, endChar),
  });

  describe('rangeOverlapsAny', () => {
    const testRange = createRange(0, 5, 0, 15);

    describe('when array is empty', () => {
      it('should return false for empty array', () => {
        expect(rangeOverlapsAny(testRange, [])).toBe(false);
      });
    });

    describe('when array contains single range', () => {
      it('should return true when single range overlaps', () => {
        const ranges = [createRange(0, 10, 0, 20)];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(true);
      });

      it('should return false when single range does not overlap', () => {
        const ranges = [createRange(0, 20, 0, 25)];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(false);
      });
    });

    describe('when array contains multiple ranges', () => {
      it('should return true when first range overlaps', () => {
        const ranges = [
          createRange(0, 10, 0, 20), // overlaps
          createRange(1, 0, 1, 10), // does not overlap
          createRange(2, 0, 2, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(true);
      });

      it('should return true when middle range overlaps', () => {
        const ranges = [
          createRange(1, 0, 1, 10), // does not overlap
          createRange(0, 10, 0, 20), // overlaps
          createRange(2, 0, 2, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(true);
      });

      it('should return true when last range overlaps', () => {
        const ranges = [
          createRange(1, 0, 1, 10), // does not overlap
          createRange(2, 0, 2, 10), // does not overlap
          createRange(0, 10, 0, 20), // overlaps
        ];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(true);
      });

      it('should return true when multiple ranges overlap', () => {
        const ranges = [
          createRange(0, 0, 0, 10), // overlaps
          createRange(0, 10, 0, 20), // overlaps
          createRange(0, 12, 0, 25), // overlaps
        ];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(true);
      });

      it('should return false when no ranges overlap', () => {
        const ranges = [
          createRange(0, 0, 0, 4), // does not overlap
          createRange(0, 16, 0, 20), // does not overlap
          createRange(1, 0, 1, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(testRange, ranges)).toBe(false);
      });
    });

    describe('when testing with zero-width ranges', () => {
      const zeroWidthRange = createRange(0, 5, 0, 5);

      it('should return true when zero-width range overlaps with ranges containing it', () => {
        const ranges = [
          createRange(0, 0, 0, 10), // contains zero-width range
          createRange(1, 0, 1, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(zeroWidthRange, ranges)).toBe(true);
      });

      it('should return false when zero-width range does not overlap with any ranges', () => {
        const ranges = [
          createRange(0, 0, 0, 4), // does not contain zero-width range
          createRange(0, 6, 0, 10), // does not contain zero-width range
        ];

        expect(rangeOverlapsAny(zeroWidthRange, ranges)).toBe(false);
      });
    });

    describe('when testing with multi-line ranges', () => {
      const multiLineRange = createRange(1, 5, 3, 10);

      it('should return true when multi-line range overlaps with ranges in array', () => {
        const ranges = [
          createRange(0, 0, 2, 0), // overlaps with multi-line range
          createRange(4, 0, 4, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(multiLineRange, ranges)).toBe(true);
      });

      it('should return false when multi-line range does not overlap with any ranges', () => {
        const ranges = [
          createRange(0, 0, 1, 4), // does not overlap
          createRange(4, 0, 4, 10), // does not overlap
        ];

        expect(rangeOverlapsAny(multiLineRange, ranges)).toBe(false);
      });
    });
  });
});
