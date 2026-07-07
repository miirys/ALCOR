import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { GitCommandTool } from './GitCommandTool';
import type { GitCommandInput, ToolState } from './types';

describe('GitCommandTool', () => {
  const createInput = (command: string, commandArgs?: string): GitCommandInput => ({
    tool: 'run_git_command',
    command,
    commandArgs,
  });

  const successState: ToolState = { type: 'success', output: '' };
  const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

  describe('when rendering', () => {
    it('displays git command in the label', () => {
      const { lastFrame } = render(
        <GitCommandTool input={createInput('status')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('git status');
    });

    it('displays git command and args in the label', () => {
      const { lastFrame } = render(
        <GitCommandTool
          input={createInput('log', '--oneline -5')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('git log --oneline -5');
    });
  });

  describe('when successful with output', () => {
    it('displays the output', () => {
      const output = '* main\n  feature-branch';

      const { lastFrame } = render(
        <GitCommandTool
          input={createInput('branch')}
          state={createSuccessState(output)}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('main');
      expect(lastFrame()).toContain('feature-branch');
    });
  });

  describe('when output is long', () => {
    const longOutput = Array.from({ length: 10 }, (_, i) => `commit ${i}`).join('\n');

    describe('when not expanded', () => {
      it('shows truncated indicator', () => {
        const { lastFrame } = render(
          <GitCommandTool
            input={createInput('log')}
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
          <GitCommandTool
            input={createInput('log')}
            state={createSuccessState(longOutput)}
            expanded={true}
          />,
        );

        expect(lastFrame()).not.toContain('(truncated)');
        expect(lastFrame()).toContain('commit 9');
      });
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long output line within the terminal width', () => {
      const longOutput =
        'aabbccddeeff112233445566 commit subject that is intentionally very long to test wrapping';

      const output =
        render(
          <GitCommandTool
            input={createInput('log')}
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
