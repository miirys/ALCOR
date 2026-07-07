import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { ReadFilesTool } from './ReadFilesTool';
import type { ReadFilesInput, ToolState } from './types';

describe('ReadFilesTool', () => {
  const createInput = (filepaths: string[]): ReadFilesInput => ({
    tool: 'read_files',
    filepaths,
  });

  const loadingState: ToolState = { type: 'loading' };

  describe('when rendering with a single file', () => {
    it('displays the filepath directly in the label', () => {
      const { lastFrame } = render(
        <ReadFilesTool
          input={createInput(['src/index.ts'])}
          state={loadingState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Read src/index.ts');
    });
  });

  describe('when rendering with multiple files', () => {
    const filepaths = ['src/a.ts', 'src/b.ts', 'src/c.ts'];

    it('displays "Read N files" in the label', () => {
      const { lastFrame } = render(
        <ReadFilesTool input={createInput(filepaths)} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Read 3 files');
    });

    it('shows the file list below the label', () => {
      const { lastFrame } = render(
        <ReadFilesTool input={createInput(filepaths)} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('src/a.ts');
      expect(lastFrame()).toContain('src/b.ts');
      expect(lastFrame()).toContain('src/c.ts');
    });
  });

  describe('terminal width handling', () => {
    it('wraps long filepaths in the list within the terminal width', () => {
      const longPaths = [
        'src/some/very/deeply/nested/path/that/keeps/going/file1.ts',
        'src/another/quite/lengthy/path/to/a/different/file2.ts',
      ];

      const output =
        render(
          <ReadFilesTool
            input={createInput(longPaths)}
            state={loadingState}
            expanded={false}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });

  describe('when rendering with an empty file list', () => {
    it('renders "Read 0 files"', () => {
      const { lastFrame } = render(
        <ReadFilesTool input={createInput([])} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Read 0 files');
    });
  });
});
