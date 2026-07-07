import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { EditFileTool } from './EditFileTool';
import type { EditFileInput, ToolState } from './types';

describe('EditFileTool', () => {
  const createInput = (
    filepath: string,
    oldContent: string,
    newContent: string,
  ): EditFileInput => ({
    tool: 'edit_file',
    filepath,
    diff: {
      old: { filepath, content: oldContent },
      new: { filepath, content: newContent },
    },
  });

  const successState: ToolState = { type: 'success', output: '' };

  it('displays filepath in the label', () => {
    const { lastFrame } = render(
      <EditFileTool
        input={createInput('src/test.ts', 'old', 'new')}
        state={successState}
        expanded={false}
      />,
    );

    expect(lastFrame()).toContain('Edit');
    expect(lastFrame()).toContain('src/test.ts');
  });

  describe('terminal width handling', () => {
    // EditFileTool delegates the diff body to <Diff>, which derives its own
    // width from `useStdout`. Only the BaseTool chrome + label row are sized
    // by the `columns` prop threaded from the dispatcher, so the assertion
    // targets the label row (no diff patch).
    it('wraps a long filepath label within the terminal width', () => {
      const longPath = 'src/some/deeply/nested/directory/structure/that/keeps/going/file.ts';

      const output =
        render(
          <EditFileTool
            input={createInput(longPath, 'same', 'same')}
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
