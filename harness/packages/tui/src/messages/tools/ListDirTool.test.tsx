import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { ListDirTool } from './ListDirTool';
import type { ListDirInput, ToolState } from './types';

describe('ListDirTool', () => {
  const createInput = (directory: string): ListDirInput => ({
    tool: 'list_dir',
    directory,
  });

  const loadingState: ToolState = { type: 'loading' };
  const successState: ToolState = { type: 'success', output: '' };

  describe('when rendering', () => {
    it('displays directory in the label', () => {
      const { lastFrame } = render(
        <ListDirTool
          input={createInput('/src/components')}
          state={loadingState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('List /src/components');
    });
  });

  describe('when loading', () => {
    it('shows loading indicator', () => {
      const { lastFrame } = render(
        <ListDirTool input={createInput('/src')} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('...');
    });
  });

  describe('when successful', () => {
    it('does not show any indicator', () => {
      const { lastFrame } = render(
        <ListDirTool input={createInput('/src')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).not.toContain('...');
      expect(lastFrame()).not.toContain('✗');
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long directory label within the terminal width', () => {
      const longPath = '/some/very/long/nested/directory/path/with/many/segments/components';

      const output =
        render(
          <ListDirTool
            input={createInput(longPath)}
            state={loadingState}
            expanded={false}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });
});
