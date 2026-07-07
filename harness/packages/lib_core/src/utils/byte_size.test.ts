import { getByteSize, truncateToByteLimit } from './byte_size';

describe('byte_size utilities', () => {
  describe('getByteSize', () => {
    it.each([
      ['empty string', '', 0],
      ['simple ascii', 'hello', 5],
      ['with spaces', 'hello world', 11],
      ['emoji', '🦊', 4],
      ['mixed ascii/emoji content', 'hello 🦊 world', 16],
      ['multi-byte chars', '안녕하세요', 15], // Korean characters
      ['special chars', '∑πμ', 7],
    ])('calculates correct byte size for %s', (_, input, expected) => {
      expect(getByteSize(input)).toBe(expected);
    });
  });

  describe('truncateToByteLimit', () => {
    describe('when input is under byte limit', () => {
      it('returns original string unchanged', () => {
        const input = 'hello world';
        expect(truncateToByteLimit(input, 20)).toBe(input);
      });

      it('handles empty string', () => {
        expect(truncateToByteLimit('', 10)).toBe('');
      });
    });

    describe('when input exceeds byte limit', () => {
      it('handles byte limit of 0', () => {
        expect(truncateToByteLimit('hello', 0)).toBe('');
      });

      it.each([
        ['breaks at word boundary', 'hello world goodbye', 14, 'hello world'],
        ['handles emoji correctly', 'hello 🦊 world', 10, 'hello'],
        [
          'truncates at byte limit when no word boundary found',
          'hello_world_goodbye',
          7,
          'hello_w',
        ],
        ['handles multiple spaces', 'hello   world   goodbye', 12, 'hello'],
      ])('%s', (_, input, byteLimit, expected) => {
        expect(truncateToByteLimit(input, byteLimit)).toBe(expected);
      });

      it('respects custom separator', () => {
        const input = 'hello-world-goodbye';
        expect(truncateToByteLimit(input, 14, { separator: /-/g })).toBe('hello-world');
      });

      it('handles case where no separator is found', () => {
        const input = 'helloworld';
        expect(truncateToByteLimit(input, 7)).toBe('hellowo');
      });
    });

    describe('when provided with a suffix', () => {
      describe('when input is under byte limit', () => {
        let input: string;
        let suffix: string;

        beforeEach(() => {
          input = 'hello';
          suffix = '[truncated]';
        });

        it('returns original string unchanged', () => {
          const result = truncateToByteLimit(input, 20, { suffix });
          expect(result).toBe(input);
        });
      });

      describe('when input exceeds byte limit', () => {
        let input: string;
        let suffix: string;

        beforeEach(() => {
          input = 'hi world goodbye';
          suffix = '[truncated]';
        });

        it('adds suffix when truncation occurs', () => {
          const result = truncateToByteLimit(input, 15, { suffix });
          expect(result).toBe('hi [truncated]');
          expect(getByteSize(result)).toBeLessThanOrEqual(15);
        });
      });

      describe('when suffix is larger than byte limit', () => {
        let input: string;
        let largeSuffix: string;

        beforeEach(() => {
          input = 'hello world';
          largeSuffix = '[suffix very long wow]';
        });

        it('returns truncated suffix only', () => {
          const result = truncateToByteLimit(input, 10, { suffix: largeSuffix });
          expect(result).toBe(' [suffix v');
          expect(getByteSize(result)).toBe(10);
        });
      });

      describe('with multi-byte characters', () => {
        let input: string;
        let emojiSuffix: string;

        beforeEach(() => {
          input = 'hello 🦊 world goodbye';
          emojiSuffix = '...🔥';
        });

        it('handles multi-byte characters correctly', () => {
          const result = truncateToByteLimit(input, 15, { suffix: emojiSuffix });
          expect(getByteSize(result)).toBeLessThanOrEqual(15);
          expect(result).toContain(emojiSuffix);
        });
      });
    });
  });
});
