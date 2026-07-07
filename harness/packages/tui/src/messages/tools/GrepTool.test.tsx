import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { GrepTool } from './GrepTool';
import type { GrepInput, ToolState } from './types';

describe('GrepTool', () => {
  const createInput = (pattern: string): GrepInput => ({
    tool: 'grep',
    pattern,
  });

  const loadingState: ToolState = { type: 'loading' };
  const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

  describe('when rendering', () => {
    it('displays pattern in the label', () => {
      const { lastFrame } = render(
        <GrepTool input={createInput('TODO')} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('⌕ Search · TODO in files');
    });

    it('displays directory in the label when provided', () => {
      const input: GrepInput = { tool: 'grep', pattern: 'TODO', directory: 'src/' };
      const { lastFrame } = render(
        <GrepTool input={input} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('⌕ Search · TODO in src/');
    });

    it('displays case insensitive suffix when caseInsensitive is true', () => {
      const input: GrepInput = { tool: 'grep', pattern: 'TODO', caseInsensitive: true };
      const { lastFrame } = render(
        <GrepTool input={input} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('⌕ Search · TODO in files (case insensitive)');
    });
  });

  describe('when successful with no matches', () => {
    it('shows "No matches found." for empty output', () => {
      const { lastFrame } = render(
        <GrepTool
          input={createInput('nonexistent')}
          state={createSuccessState('')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('No matches found.');
    });

    it('shows "No matches found." for the "No matches found." prefix line', () => {
      const { lastFrame } = render(
        <GrepTool
          input={createInput('nonexistent')}
          state={createSuccessState('No matches found.\n')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('No matches found.');
    });
  });

  describe('when successful with one match', () => {
    it('shows the prefix line as summary when collapsed', () => {
      const { lastFrame } = render(
        <GrepTool
          input={createInput('TODO')}
          state={createSuccessState('Found 1 match\nsrc/index.ts:42_42\nTODO fix this\n')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Found 1 match');
    });
  });

  describe('when successful with multiple matches', () => {
    const output =
      'Found 3 matches\nsrc/a.ts:1_2\nmatch1\nmatch2\nsrc/b.ts:5_5\nmatch3\nsrc/c.ts:10_12\nmatch4\nmatch5\nmatch6\n';

    describe('when not expanded', () => {
      it('shows the prefix line as summary', () => {
        const { lastFrame } = render(
          <GrepTool
            input={createInput('match')}
            state={createSuccessState(output)}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('Found 3 matches');
      });
    });

    describe('when expanded', () => {
      it('shows full output', () => {
        const { lastFrame } = render(
          <GrepTool
            input={createInput('match')}
            state={createSuccessState(output)}
            expanded={true}
          />,
        );

        expect(lastFrame()).toContain('src/a.ts:1_2');
        expect(lastFrame()).toContain('src/b.ts:5_5');
        expect(lastFrame()).toContain('src/c.ts:10_12');
      });
    });
  });

  describe('when successful with truncated matches', () => {
    const output =
      'Found 250 matches (showing first 10)\nsrc/a.ts:1_1\nmatch\n(Results truncated: showing 10 of 250 matches (240 hidden). Consider using a more specific path or pattern.)\n';

    it('shows the prefix line as summary when collapsed', () => {
      const { lastFrame } = render(
        <GrepTool
          input={createInput('match')}
          state={createSuccessState(output)}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Found 250 matches (showing first 10)');
    });

    it('shows full output including truncation notice when expanded', () => {
      const { lastFrame } = render(
        <GrepTool
          input={createInput('match')}
          state={createSuccessState(output)}
          expanded={true}
        />,
      );

      expect(lastFrame()).toContain('Found 250 matches (showing first 10)');
      expect(lastFrame()).toContain('Results truncated');
    });
  });

  describe('terminal width handling', () => {
    it('wraps long match paths within the terminal width', () => {
      const longOutput =
        'Found 1 match\nsrc/very/long/nested/path/with/many/segments/that/keeps/going/file.ts:42_42\nactualMatchContentLineThatIsAlsoVeryLongAndContainsNoBreakableWhitespace\n';

      const output =
        render(
          <GrepTool
            input={createInput('match')}
            state={createSuccessState(longOutput)}
            expanded={true}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });
});
