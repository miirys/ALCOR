import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { MkdirTool } from './MkdirTool';
import type { MkdirInput, ToolState } from './types';

describe('MkdirTool', () => {
  const createInput = (path: string): MkdirInput => ({
    tool: 'mkdir',
    path,
  });

  const loadingState: ToolState = { type: 'loading' };
  const successState: ToolState = { type: 'success', output: '' };

  describe('when rendering', () => {
    it('displays path in the label', () => {
      const { lastFrame } = render(
        <MkdirTool
          input={createInput('src/new-directory')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('⊞ Mkdir');
      expect(lastFrame()).toContain('src/new-directory');
    });
  });

  describe('when loading', () => {
    it('shows loading indicator', () => {
      const { lastFrame } = render(
        <MkdirTool
          input={createInput('src/new-directory')}
          state={loadingState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('◐');
    });
  });

  describe('when successful', () => {
    it('does not show loading indicator', () => {
      const { lastFrame } = render(
        <MkdirTool
          input={createInput('src/new-directory')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).not.toContain('◐');
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long path label within the terminal width', () => {
      const longPath = 'src/some/very/long/nested/directory/path/with/many/segments/new-folder';

      const output =
        render(
          <MkdirTool
            input={createInput(longPath)}
            state={successState}
            expanded={false}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });
});
