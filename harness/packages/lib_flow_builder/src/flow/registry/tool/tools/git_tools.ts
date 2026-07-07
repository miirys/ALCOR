/**
 * Git Tool Definitions
 *
 * IMPORTANT: These tool definitions are derived from the duo_workflow_service
 * backend (duo_workflow_service/tools/*.py). This is a temporary hardcoded
 * catalog — tools should be provided dynamically by API in the near future.
 * See: gitlab-org/editor-extensions/gitlab-lsp#1933
 *
 * Tool names MUST match the workflow service exactly so the LSP registry
 * stays consistent with the backend.
 */
import type { ToolDefinition } from '../type';

const CATEGORY = 'Git';

export const GIT_TOOLS: ToolDefinition[] = [
  {
    name: 'run_git_command',
    label: 'Run Git Command',
    description: 'Execute a git command in the project repository.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: {
          type: 'array',
          items: { type: 'string' },
          description: 'Git command arguments (e.g. ["status", "--short"])',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string', description: 'Standard output from the command' },
        stderr: { type: 'string', description: 'Standard error from the command' },
        exit_code: { type: 'integer', description: 'Exit code of the command' },
      },
    },
  },
];
