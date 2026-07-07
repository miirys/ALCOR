import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { GenericTool } from './GenericTool';
import type { GenericInput, ToolState } from './types';

describe('GenericTool', () => {
  const createInput = (name: string, args: Record<string, unknown> = {}): GenericInput => ({
    tool: 'generic',
    name,
    args,
  });

  const successState: ToolState = { type: 'success', output: '' };
  const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

  describe('when rendering', () => {
    it('displays tool name in the label', () => {
      const { lastFrame } = render(
        <GenericTool input={createInput('custom_tool')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('custom_tool');
    });

    it('shows Input label and JSON args', () => {
      const { lastFrame } = render(
        <GenericTool
          input={createInput('my_tool', { foo: 'bar' })}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Input:');
      expect(lastFrame()).toContain('"foo"');
      expect(lastFrame()).toContain('"bar"');
    });
  });

  describe('when successful with output', () => {
    it('shows Output label and content', () => {
      const { lastFrame } = render(
        <GenericTool
          input={createInput('my_tool')}
          state={createSuccessState('result data')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Output:');
      expect(lastFrame()).toContain('result data');
    });
  });

  describe('when args are long', () => {
    const longArgs = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`key${i}`, `value${i}`]),
    );

    describe('when not expanded', () => {
      it('shows truncated indicator', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('my_tool', longArgs)}
            state={successState}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('(truncated)');
      });
    });

    describe('when expanded', () => {
      it('shows full args without truncated indicator', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('my_tool', longArgs)}
            state={successState}
            expanded={true}
          />,
        );

        expect(lastFrame()).not.toContain('(truncated)');
        expect(lastFrame()).toContain('"key9"');
      });
    });
  });

  describe('when output is long', () => {
    const longOutput = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

    describe('when expanded', () => {
      it('shows full output without truncated indicator', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('my_tool')}
            state={createSuccessState(longOutput)}
            expanded={true}
          />,
        );

        expect(lastFrame()).not.toContain('(truncated)');
        expect(lastFrame()).toContain('line 9');
      });
    });
  });

  describe('when output is stringified JSON', () => {
    const jsonOutput = JSON.stringify({ search_results: [{ title: 'Duo', url: '/duo' }] });

    describe('when expanded', () => {
      it('pretty-prints the JSON across indented lines', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('gitlab_documentation_search')}
            state={createSuccessState(jsonOutput)}
            expanded={true}
          />,
        );

        const frame = lastFrame() ?? '';
        expect(frame).toContain('"search_results"');
        expect(frame).toContain('"title"');
        expect(frame).toContain('  "title": "Duo"');
      });
    });

    describe('when not expanded', () => {
      it('shows readable indented lines rather than a single truncated blob', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('gitlab_documentation_search')}
            state={createSuccessState(jsonOutput)}
            expanded={false}
          />,
        );

        const frame = lastFrame() ?? '';
        expect(frame).toContain('  "search_results"');
      });
    });
  });

  describe('when args is empty object', () => {
    it('displays {} in the Input section', () => {
      const { lastFrame } = render(
        <GenericTool input={createInput('my_tool', {})} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Input:');
      expect(lastFrame()).toContain('{}');
    });
  });

  describe('terminal width handling', () => {
    it('wraps long JSON args within the terminal width', () => {
      const longArgs = {
        a_really_long_argument_name: 'a_really_long_argument_value_that_does_not_break_naturally',
      };

      const output =
        render(
          <GenericTool
            input={createInput('my_tool', longArgs)}
            state={successState}
            expanded={true}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });

    it('wraps long output within the terminal width', () => {
      const longOutput =
        'verylongoutputlinewithnobreakablewhitespacethatwouldotherwiseoverflowanarrowterminal';

      const output =
        render(
          <GenericTool
            input={createInput('my_tool')}
            state={createSuccessState(longOutput)}
            expanded={true}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });

  describe('when both args and output are truncatable', () => {
    const longArgs = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`key${i}`, `value${i}`]),
    );
    const longOutput = Array.from({ length: 10 }, (_, i) => `output line ${i}`).join('\n');

    describe('when not expanded', () => {
      it('shows truncated indicator for both sections', () => {
        const { lastFrame } = render(
          <GenericTool
            input={createInput('my_tool', longArgs)}
            state={createSuccessState(longOutput)}
            expanded={false}
          />,
        );

        const frame = lastFrame() ?? '';
        const truncatedMatches = frame.match(/\(truncated\)/g);
        expect(truncatedMatches).toHaveLength(2);
      });
    });
  });
});
