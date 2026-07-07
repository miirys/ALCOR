import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { FindFilesTool } from './FindFilesTool';
import type { FindFilesInput, ToolState } from './types';

describe('FindFilesTool', () => {
  const createInput = (pattern: string): FindFilesInput => ({
    tool: 'find_files',
    pattern,
  });

  const loadingState: ToolState = { type: 'loading' };
  const createSuccessState = (output: string): ToolState => ({ type: 'success', output });

  describe('when rendering', () => {
    it('displays pattern in the label', () => {
      const { lastFrame } = render(
        <FindFilesTool input={createInput('*.tsx')} state={loadingState} expanded={false} />,
      );

      expect(lastFrame()).toContain('⌕ Find files · *.tsx');
    });
  });

  describe('when successful with no files', () => {
    it('shows "No files found."', () => {
      const { lastFrame } = render(
        <FindFilesTool
          input={createInput('*.xyz')}
          state={createSuccessState('')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('No files found.');
    });
  });

  describe('when output contains "No matches" message', () => {
    it('shows "No files found."', () => {
      const { lastFrame } = render(
        <FindFilesTool
          input={createInput('*.xyz')}
          state={createSuccessState('No matches found')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('No files found.');
    });
  });

  describe('when successful with one file', () => {
    it('shows "1 file found." when collapsed', () => {
      const { lastFrame } = render(
        <FindFilesTool
          input={createInput('*.ts')}
          state={createSuccessState('src/index.ts')}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('1 file found.');
    });
  });

  describe('when successful with multiple files', () => {
    const output = 'src/a.ts\nsrc/b.ts\nsrc/c.ts';

    describe('when not expanded', () => {
      it('shows "N files found."', () => {
        const { lastFrame } = render(
          <FindFilesTool
            input={createInput('*.ts')}
            state={createSuccessState(output)}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('3 files found.');
      });
    });

    describe('when expanded', () => {
      it('shows full file list', () => {
        const { lastFrame } = render(
          <FindFilesTool
            input={createInput('*.ts')}
            state={createSuccessState(output)}
            expanded={true}
          />,
        );

        expect(lastFrame()).toContain('src/a.ts');
        expect(lastFrame()).toContain('src/b.ts');
        expect(lastFrame()).toContain('src/c.ts');
        expect(lastFrame()).not.toContain('3 files found.');
      });
    });
  });

  describe('terminal width handling', () => {
    it('wraps long filepaths within the terminal width', () => {
      const longPaths =
        'src/some/very/deeply/nested/path/with/many/segments/file1.ts\nsrc/another/very/deeply/nested/path/that/also/has/many/segments/file2.ts';

      const output =
        render(
          <FindFilesTool
            input={createInput('*.ts')}
            state={createSuccessState(longPaths)}
            expanded={true}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });
});
