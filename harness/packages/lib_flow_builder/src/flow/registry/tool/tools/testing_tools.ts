/**
 * Testing Tool Definitions
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

const CATEGORY = 'Testing';

export const TESTING_TOOLS: ToolDefinition[] = [
  {
    name: 'run_tests',
    label: 'Run Tests',
    description: 'Execute the test suite or a specific test file.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      properties: {
        test_path: {
          type: 'string',
          description: 'Path to a specific test file or directory (runs all tests if omitted)',
        },
        test_filter: {
          type: 'string',
          description: 'Filter expression to select specific tests',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string', description: 'Test output' },
        stderr: { type: 'string', description: 'Error output' },
        exit_code: { type: 'integer', description: 'Exit code (0 = all tests passed)' },
      },
    },
  },
];
