import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { RunCommandTool } from './RunCommandTool';
import type { RunCommandInput, ShellCommandInput, ToolState } from './types';

type ToolType = 'run_command' | 'shell_command';

const createInput = (
  command: string,
  tool: ToolType = 'run_command',
): RunCommandInput | ShellCommandInput => ({
  tool,
  command,
});

const successState: ToolState = { type: 'success', output: '' };
const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

describe('RunCommandTool', () => {
  describe.each(['run_command', 'shell_command'] as const)('with %s input', (toolType) => {
    describe('when rendering', () => {
      it('displays "Run command" label', () => {
        const { lastFrame } = render(
          <RunCommandTool
            input={createInput('echo hello', toolType)}
            state={successState}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('❯_ Shell');
      });

      it('displays the command', () => {
        const { lastFrame } = render(
          <RunCommandTool
            input={createInput('ls -la', toolType)}
            state={successState}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('ls -la');
      });
    });

    describe('when successful with output', () => {
      it('displays the output', () => {
        const { lastFrame } = render(
          <RunCommandTool
            input={createInput('echo hello', toolType)}
            state={createSuccessState('hello world')}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('hello world');
      });
    });

    describe('when output is long', () => {
      const longOutput = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');

      describe('when not expanded', () => {
        it('shows truncated indicator', () => {
          const { lastFrame } = render(
            <RunCommandTool
              input={createInput('cat file.txt', toolType)}
              state={createSuccessState(longOutput)}
              expanded={false}
            />,
          );

          expect(lastFrame()).toContain('(truncated)');
        });
      });

      describe('when expanded', () => {
        it('shows full output without truncated indicator', () => {
          const { lastFrame } = render(
            <RunCommandTool
              input={createInput('cat file.txt', toolType)}
              state={createSuccessState(longOutput)}
              expanded={true}
            />,
          );

          expect(lastFrame()).not.toContain('(truncated)');
          expect(lastFrame()).toContain('line 9');
        });
      });
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long command within the terminal width', () => {
      const longCommand =
        'docker run --rm -v $(pwd):/workspace --network host very-long-image-name:latest';

      const output =
        render(
          <RunCommandTool
            input={createInput(longCommand)}
            state={successState}
            expanded={false}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });

    it('wraps long output within the terminal width', () => {
      const longOutput =
        'aReallyLongOutputLineWithNoBreakableWhitespaceThatWouldOtherwiseOverflowANarrowTerminal';

      const output =
        render(
          <RunCommandTool
            input={createInput('echo')}
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
