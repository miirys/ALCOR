import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { CreateFileTool } from './CreateFileTool';
import type { CreateFileInput, ToolState } from './types';

describe('CreateFileTool', () => {
  const createInput = (filepath: string, content: string): CreateFileInput => ({
    tool: 'create_file_with_contents',
    filepath,
    content,
  });

  const successState: ToolState = { type: 'success', output: '' };

  describe('when rendering', () => {
    it('displays filepath in the label', () => {
      const { lastFrame } = render(
        <CreateFileTool
          input={createInput('src/test.ts', '')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('✎ Write');
      expect(lastFrame()).toContain('src/test.ts');
    });

    it('displays content', () => {
      const { lastFrame } = render(
        <CreateFileTool
          input={createInput('test.ts', 'const hello = "world";')}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('const hello = "world"');
    });
  });

  describe('when content is long', () => {
    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');

    describe('when not expanded', () => {
      it('shows truncated indicator', () => {
        const { lastFrame } = render(
          <CreateFileTool
            input={createInput('test.ts', longContent)}
            state={successState}
            expanded={false}
          />,
        );

        expect(lastFrame()).toContain('(truncated)');
      });
    });

    describe('when expanded', () => {
      it('shows full content without truncated indicator', () => {
        const { lastFrame } = render(
          <CreateFileTool
            input={createInput('test.ts', longContent)}
            state={successState}
            expanded={true}
          />,
        );

        expect(lastFrame()).not.toContain('(truncated)');
        expect(lastFrame()).toContain('line 10');
      });
    });
  });

  describe('terminal width handling', () => {
    it('wraps a long content line within the terminal width', () => {
      const longLine =
        'export const veryLongConstName = someFunctionCall(argumentOne, argumentTwo, argumentThree, argumentFour);';

      const output =
        render(
          <CreateFileTool
            input={createInput('test.ts', longLine)}
            state={successState}
            expanded={true}
            columns={40}
          />,
        ).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });

    it('wraps a long filepath label within the terminal width', () => {
      const longPath = 'src/some/deeply/nested/directory/structure/that/keeps/going/file.ts';

      const output =
        render(
          <CreateFileTool
            input={createInput(longPath, 'x')}
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
