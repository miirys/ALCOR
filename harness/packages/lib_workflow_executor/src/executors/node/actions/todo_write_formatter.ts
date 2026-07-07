import { Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { ToolInputFormatter } from './index';

const todoWriteArgsSchema = z.object({
  todos: z.array(
    z.object({
      description: z.string(),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    }),
  ),
});

/**
 * Formats `todo_write` tool input so the TUI can render it as a task list.
 * This tool has no {@link WorkflowActionHandler}; its display mapping lives here.
 */
@Injectable(ToolInputFormatter, [])
export class TodoWriteFormatter implements ToolInputFormatter {
  toolName = 'todo_write';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { todos } = todoWriteArgsSchema.parse(args);
    return {
      tool: 'todo_write',
      todos,
    };
  }
}
