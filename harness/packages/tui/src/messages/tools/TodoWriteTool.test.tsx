import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { TodoWriteTool } from './TodoWriteTool';
import type { TodoWriteInput, ToolState } from './types';

describe('TodoWriteTool', () => {
  const successState: ToolState = { type: 'success', output: '' };
  const loadingState: ToolState = { type: 'loading' };
  const errorState: ToolState = { type: 'error', error: 'something went wrong' };

  const createInput = (todos: TodoWriteInput['todos']): TodoWriteInput => ({
    tool: 'todo_write',
    todos,
  });

  describe('label', () => {
    it('displays the "Todos" label', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Write tests', status: 'pending' }])}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Todos');
    });
  });

  describe('status icons', () => {
    it('shows pending icon for pending todos', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Pending task', status: 'pending' }])}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('○');
      expect(lastFrame()).toContain('Pending task');
    });

    it('shows in_progress icon for in_progress todos', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Active task', status: 'in_progress' }])}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('◎');
      expect(lastFrame()).toContain('Active task');
    });

    it('shows completed icon for completed todos', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Done task', status: 'completed' }])}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('●');
      expect(lastFrame()).toContain('Done task');
    });

    it('shows cancelled icon for cancelled todos', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Dropped task', status: 'cancelled' }])}
          state={successState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('⊘');
      expect(lastFrame()).toContain('Dropped task');
    });
  });

  describe('multiple todos', () => {
    it('renders all todos', () => {
      const todos: TodoWriteInput['todos'] = [
        { description: 'First task', status: 'completed' },
        { description: 'Second task', status: 'in_progress' },
        { description: 'Third task', status: 'pending' },
      ];

      const { lastFrame } = render(
        <TodoWriteTool input={createInput(todos)} state={successState} expanded={false} />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('First task');
      expect(frame).toContain('Second task');
      expect(frame).toContain('Third task');
    });

    it('renders icons for each todo', () => {
      const todos: TodoWriteInput['todos'] = [
        { description: 'Done', status: 'completed' },
        { description: 'Active', status: 'in_progress' },
        { description: 'Waiting', status: 'pending' },
        { description: 'Skipped', status: 'cancelled' },
      ];

      const { lastFrame } = render(
        <TodoWriteTool input={createInput(todos)} state={successState} expanded={false} />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('●');
      expect(frame).toContain('◎');
      expect(frame).toContain('○');
      expect(frame).toContain('⊘');
    });
  });

  describe('empty todos list', () => {
    it('renders without error', () => {
      const { lastFrame } = render(
        <TodoWriteTool input={createInput([])} state={successState} expanded={false} />,
      );

      expect(lastFrame()).toContain('Todos');
    });
  });

  describe('tool states', () => {
    it('renders in loading state', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Task', status: 'in_progress' }])}
          state={loadingState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Todos');
      expect(lastFrame()).toContain('Task');
    });

    it('renders in error state', () => {
      const { lastFrame } = render(
        <TodoWriteTool
          input={createInput([{ description: 'Task', status: 'pending' }])}
          state={errorState}
          expanded={false}
        />,
      );

      expect(lastFrame()).toContain('Todos');
      expect(lastFrame()).toContain('Task');
    });
  });
});
