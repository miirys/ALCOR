import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { DiffLineContent } from './DiffLineContent';
import type { DiffLine } from './parse_patch';

describe('DiffLineContent', () => {
  describe('when rendering an addition line', () => {
    it('should display + prefix in gutter and content', () => {
      const line: DiffLine = { type: 'add', content: 'new code', newLineNum: 5 };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      expect(lastFrame()).toContain('+');
      expect(lastFrame()).toContain('new code');
    });

    it('should place the prefix in the gutter alongside the line number', () => {
      const line: DiffLine = { type: 'add', content: 'new code', newLineNum: 5 };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      // Gutter format: " <old> <new> <prefix> " — prefix sits next to line numbers
      expect(lastFrame()).toMatch(/5\s+\+/);
    });
  });

  describe('when rendering a deletion line', () => {
    it('should display - prefix in gutter and content', () => {
      const line: DiffLine = { type: 'del', content: 'old code', oldLineNum: 3 };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      expect(lastFrame()).toContain('-');
      expect(lastFrame()).toContain('old code');
    });

    it('should place the prefix in the gutter alongside the line number', () => {
      const line: DiffLine = { type: 'del', content: 'old code', oldLineNum: 3 };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      // Gutter format: " <old> <new> <prefix> " — prefix sits next to line numbers
      expect(lastFrame()).toMatch(/3\s+-/);
    });
  });

  describe('when rendering a context line', () => {
    it('should display content with space prefix', () => {
      const line: DiffLine = {
        type: 'context',
        content: 'unchanged',
        oldLineNum: 10,
        newLineNum: 12,
      };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      expect(lastFrame()).toContain('unchanged');
    });
  });

  describe('when rendering a header line', () => {
    it('should display hunk header content', () => {
      const line: DiffLine = { type: 'header', content: '@@ -1,5 +1,7 @@' };

      const { lastFrame } = render(<DiffLineContent line={line} />);

      expect(lastFrame()).toContain('@@ -1,5 +1,7 @@');
    });
  });

  describe('when content exceeds terminal width', () => {
    // ink-testing-library renders at 100 columns; with containerChromeWidth=2
    // and PREFIX_WIDTH=11 the content area is 87 columns.
    const CHROME = 2;
    const longContent =
      'someReallyLongVariableName = calculateSomethingComplex(parameterOne, parameterTwo, parameterThree)';

    describe('when the line is an addition with content longer than 87 chars', () => {
      it('should split the content across two rows at the content width boundary', () => {
        const line: DiffLine = { type: 'add', content: longContent, newLineNum: 5 };

        const { lastFrame } = render(<DiffLineContent line={line} containerChromeWidth={CHROME} />);
        const frame = lastFrame() ?? '';
        const rows = frame.split('\n');

        expect(rows[0]).toContain(
          'someReallyLongVariableName = calculateSomethingComplex(parameterOne, parameterTwo, par',
        );
        expect(rows[1]).toContain('meterThree)');
      });

      it('should render the line number exactly once', () => {
        const line: DiffLine = { type: 'add', content: longContent, newLineNum: 5 };

        const { lastFrame } = render(<DiffLineContent line={line} containerChromeWidth={CHROME} />);
        const frame = lastFrame() ?? '';

        const matches = frame.match(/\b5\b/g) ?? [];
        expect(matches).toHaveLength(1);
      });

      it('should not repeat the +/- prefix on wrapped continuation rows', () => {
        const line: DiffLine = { type: 'add', content: longContent, newLineNum: 5 };

        const { lastFrame } = render(<DiffLineContent line={line} containerChromeWidth={CHROME} />);
        const rows = (lastFrame() ?? '').split('\n');

        // The gutter encodes "this is a new diff line" via line number + prefix
        // on the first row; continuation rows intentionally show neither so
        // readers don't miscount wrapped lines as additional changes.
        expect(rows[0]).toMatch(/\+/);
        expect(rows[1]).not.toMatch(/\+/);
      });
    });

    describe('when the line content fits within the available width', () => {
      it('should render on a single row', () => {
        const line: DiffLine = { type: 'add', content: 'short line', newLineNum: 3 };

        const { lastFrame } = render(<DiffLineContent line={line} />);
        const frame = lastFrame() ?? '';

        expect(frame.split('\n')).toHaveLength(1);
      });
    });
  });
});
