import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import type { ToolCall, ToolInput } from '../../types';
import { Tool } from './Tool';

const createTool = (input: ToolCall['input']): ToolCall => ({
  id: 'tool-1',
  type: 'tool',
  name: input.tool,
  input,
  state: { type: 'success', output: 'done' },
  timestamp: Date.now(),
});

describe('Tool', () => {
  describe('routing', () => {
    it.each<{ name: string; input: ToolInput; expectedContains: string[] }>([
      {
        name: 'read_file to ReadFileTool',
        input: { tool: 'read_file', filepath: 'test.ts' },
        expectedContains: ['Read', 'test.ts'],
      },
      {
        name: 'read_files to ReadFilesTool',
        input: { tool: 'read_files', filepaths: ['a.ts', 'b.ts'] },
        expectedContains: ['Read 2 files'],
      },
      {
        name: 'edit_file to EditFileTool',
        input: {
          tool: 'edit_file',
          filepath: 'test.ts',
          diff: {
            old: { filepath: 'test.ts', content: 'old' },
            new: { filepath: 'test.ts', content: 'new' },
          },
        },
        expectedContains: ['Edit', 'test.ts'],
      },
      {
        name: 'create_file_with_contents to CreateFileTool',
        input: {
          tool: 'create_file_with_contents',
          filepath: 'new.ts',
          content: 'content',
        },
        expectedContains: ['✎ Write', 'new.ts'],
      },
      {
        name: 'run_command to RunCommandTool',
        input: { tool: 'run_command', command: 'npm test' },
        expectedContains: ['❯_ Shell', 'npm test'],
      },
      {
        name: 'shell_command to RunCommandTool',
        input: { tool: 'shell_command', command: 'echo hi' },
        expectedContains: ['❯_ Shell', 'echo hi'],
      },
      {
        name: 'list_dir to ListDirTool',
        input: { tool: 'list_dir', directory: 'src/' },
        expectedContains: ['List', 'src/'],
      },
      {
        name: 'find_files to FindFilesTool',
        input: { tool: 'find_files', pattern: '*.ts' },
        expectedContains: ['Find files', '*.ts'],
      },
      {
        name: 'grep to GrepTool',
        input: { tool: 'grep', pattern: 'TODO' },
        expectedContains: ['⌕ Search · TODO in files'],
      },
      {
        name: 'mkdir to MkdirTool',
        input: { tool: 'mkdir', path: 'new-dir' },
        expectedContains: ['⊞ Mkdir', 'new-dir'],
      },
      {
        name: 'run_git_command to GitCommandTool',
        input: { tool: 'run_git_command', command: 'status' },
        expectedContains: ['git', 'status'],
      },
      {
        name: 'todo_write to TodoWriteTool',
        input: {
          tool: 'todo_write',
          todos: [
            { description: 'Implement feature', status: 'completed' as const },
            { description: 'Write tests', status: 'in_progress' as const },
          ],
        },
        expectedContains: ['Todos', 'Implement feature', 'Write tests'],
      },
      {
        name: 'generic to GenericTool',
        input: { tool: 'generic', name: 'custom_tool', args: {} },
        expectedContains: ['custom_tool', 'Input:'],
      },
    ])('routes $name', ({ input, expectedContains }) => {
      const tool = createTool(input);
      const { lastFrame } = render(<Tool tool={tool} expanded={false} />);

      expectedContains.forEach((text) => {
        expect(lastFrame()).toContain(text);
      });
    });
  });

  describe('fallback', () => {
    it('routes unknown tool types to GenericTool', () => {
      const tool = createTool({
        tool: 'generic',
        name: 'unknown_future_tool',
        args: { param: 'value' },
      });
      const { lastFrame } = render(<Tool tool={tool} expanded={false} />);

      expect(lastFrame()).toContain('unknown_future_tool');
      expect(lastFrame()).toContain('Input:');
    });
  });

  // Guards against `<Tool>` dropping `columns` before it reaches a renderer;
  // per-tool tests can't catch that.
  describe('columns plumbing', () => {
    it('forwards the columns prop to the selected renderer', () => {
      const tool = createTool({
        tool: 'create_file_with_contents',
        filepath: 'wide.ts',
        content: 'x'.repeat(200),
      });

      const output = render(<Tool tool={tool} expanded={true} columns={40} />).lastFrame() ?? '';

      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(40);
    });
  });
});
