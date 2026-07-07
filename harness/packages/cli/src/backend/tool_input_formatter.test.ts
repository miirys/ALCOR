import { describe, it, expect } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import {
  ToolInputFormatter as ToolFormatter,
  TodoWriteFormatter,
  McpToolFormatter,
} from '@gitlab-org/workflow-executor/node';
import type { ParsedCliInput } from '../parse';
import { ToolInputFormatterService } from './tool_input_formatter';

const fakeCliInput = createFakePartial<ParsedCliInput>({ cwd: '/workspace' });

describe('ToolInputFormatterService', () => {
  describe('when a formatter exists for the tool', () => {
    it('delegates to the formatter format method', async () => {
      const formatter = createFakePartial<ToolFormatter>({
        toolName: 'read_file',
        format: () => ({ tool: 'read_file', filepath: 'src/test.ts' }),
      });
      const service = new ToolInputFormatterService(fakeCliInput, [formatter], new TestLogger());

      const result = await service.formatToolInput('read_file', { file_path: 'src/test.ts' });

      expect(result).toEqual({ tool: 'read_file', filepath: 'src/test.ts' });
    });
  });

  describe('when the tool name matches the MCP naming convention', () => {
    const service = new ToolInputFormatterService(
      fakeCliInput,
      [new McpToolFormatter()],
      new TestLogger(),
    );

    it('returns mcp_tool display with parsed server and tool names', async () => {
      const result = await service.formatToolInput('mcp__gitlab__search_issues', {
        query: 'open bugs',
        project_id: '123',
      });

      expect(result).toEqual({
        tool: 'mcp_tool',
        serverName: 'gitlab',
        name: 'search_issues',
        args: { query: 'open bugs', project_id: '123' },
      });
    });

    it('handles MCP tools with underscored server and tool names', async () => {
      const result = await service.formatToolInput('mcp__my_server__get_resource', { id: '42' });

      expect(result).toEqual({
        tool: 'mcp_tool',
        serverName: 'my_server',
        name: 'get_resource',
        args: { id: '42' },
      });
    });
  });

  describe('when a formatter throws', () => {
    it('does not propagate the error and falls back to generic display', async () => {
      const formatter = createFakePartial<ToolFormatter>({
        toolName: 'edit_file',
        format: () => {
          throw new TypeError('The "path" argument must be of type string. Received undefined');
        },
      });
      const service = new ToolInputFormatterService(fakeCliInput, [formatter], new TestLogger());

      await expect(
        service.formatToolInput('edit_file', { old_str: 'a', new_str: 'b' }),
      ).resolves.toEqual({
        tool: 'generic',
        name: 'edit_file',
        args: { old_str: 'a', new_str: 'b' },
      });
    });
  });

  describe('when the tool name does not match any formatter or MCP pattern', () => {
    it('falls back to generic display', async () => {
      const service = new ToolInputFormatterService(fakeCliInput, [], new TestLogger());

      const result = await service.formatToolInput('unknown_tool', { foo: 'bar' });

      expect(result).toEqual({
        tool: 'generic',
        name: 'unknown_tool',
        args: { foo: 'bar' },
      });
    });
  });

  describe('todo_write', () => {
    const service = new ToolInputFormatterService(
      fakeCliInput,
      [new TodoWriteFormatter()],
      new TestLogger(),
    );

    it('returns a todo_write display when toolName is todo_write and args.todos is an array', async () => {
      const todos = [
        { description: 'Write tests', status: 'pending' as const },
        { description: 'Fix bug', status: 'in_progress' as const },
      ];

      const result = await service.formatToolInput('todo_write', { todos });

      expect(result).toEqual({ tool: 'todo_write', todos });
    });

    it('passes through all todo statuses unchanged', async () => {
      const todos = [
        { description: 'Task A', status: 'pending' as const },
        { description: 'Task B', status: 'in_progress' as const },
        { description: 'Task C', status: 'completed' as const },
        { description: 'Task D', status: 'cancelled' as const },
      ];

      const result = await service.formatToolInput('todo_write', { todos });

      expect(result).toEqual({ tool: 'todo_write', todos });
    });

    it('falls back to generic when todos is not an array', async () => {
      const result = await service.formatToolInput('todo_write', { todos: 'not-an-array' });

      expect(result).toEqual({
        tool: 'generic',
        name: 'todo_write',
        args: { todos: 'not-an-array' },
      });
    });

    it('falls back to generic when todos is missing', async () => {
      const result = await service.formatToolInput('todo_write', {});

      expect(result).toEqual({
        tool: 'generic',
        name: 'todo_write',
        args: {},
      });
    });

    it('handles an empty todos array', async () => {
      const result = await service.formatToolInput('todo_write', { todos: [] });

      expect(result).toEqual({ tool: 'todo_write', todos: [] });
    });
  });
});
