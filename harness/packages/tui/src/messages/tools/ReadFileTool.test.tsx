import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { ReadFileTool } from './ReadFileTool';
import type { ReadFileInput, ToolState } from './types';

describe('ReadFileTool', () => {
  const createInput = (filepath: string): ReadFileInput => ({
    tool: 'read_file',
    filepath,
  });

  const loadingState: ToolState = { type: 'loading' };
  const successState: ToolState = { type: 'success', output: '' };

  describe('when rendering', () => {
    it('displays filepath in the label', () => {
      const { lastFrame } = render(
        <ReadFileTool input={createInput('src/test.ts')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Read');
      expect(lastFrame()).toContain('src/test.ts');
    });

    it('displays line range when offset and limit are provided', () => {
      const input: ReadFileInput = {
        tool: 'read_file',
        filepath: 'src/test.ts',
        offset: 10,
        limit: 20,
      };
      const { lastFrame } = render(
        <ReadFileTool input={input} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('src/test.ts:11–30');
    });

    it('displays open-ended range when only offset is provided', () => {
      const input: ReadFileInput = { tool: 'read_file', filepath: 'src/test.ts', offset: 5 };
      const { lastFrame } = render(
        <ReadFileTool input={input} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('src/test.ts:6–end');
    });

    it('does not display range when neither offset nor limit is provided', () => {
      const { lastFrame } = render(
        <ReadFileTool input={createInput('src/test.ts')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).not.toContain(':');
    });
  });

  describe('when loading', () => {
    it('shows loading indicator', () => {
      const { lastFrame } = render(
        <ReadFileTool input={createInput('src/test.ts')} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('...');
    });
  });

  describe('when successful', () => {
    it('does not show loading indicator', () => {
      const { lastFrame } = render(
        <ReadFileTool input={createInput('src/test.ts')} state={successState} expanded={false} />,
      );

      expect(lastFrame()).not.toContain('...');
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long filepath label within the terminal width', () => {
      const longPath = 'src/some/very/long/nested/directory/path/with/many/segments/file.ts';

      const output =
        render(
          <ReadFileTool
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
