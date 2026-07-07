/**
 * File System Tool Definitions
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

const CATEGORY = 'File System';

export const FILE_SYSTEM_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    label: 'Read File',
    description: 'Read the contents of a file at the given path.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['file_path'],
      properties: {
        file_path: { type: 'string', description: 'Absolute or relative path to the file' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The file contents' },
      },
    },
  },
  {
    name: 'read_files',
    label: 'Read Files',
    description: 'Read the contents of multiple files at once.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['file_paths'],
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths to read',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
          },
          description: 'Array of file path/content pairs',
        },
      },
    },
  },
  {
    name: 'create_file_with_contents',
    label: 'Create File',
    description: 'Create a new file with the given contents.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['file_path', 'contents'],
      properties: {
        file_path: { type: 'string', description: 'Path for the new file' },
        contents: { type: 'string', description: 'Contents to write to the file' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
  {
    name: 'edit_file',
    label: 'Edit File',
    description: 'Edit an existing file by replacing a specific string.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['file_path', 'old_string', 'new_string'],
      properties: {
        file_path: { type: 'string', description: 'Path to the file to edit' },
        old_string: { type: 'string', description: 'The exact string to find and replace' },
        new_string: { type: 'string', description: 'The replacement string' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_dir',
    label: 'List Directory',
    description: 'List the contents of a directory.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['dir_path'],
      properties: {
        dir_path: { type: 'string', description: 'Path to the directory to list' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of directory entries',
        },
      },
    },
  },
  {
    name: 'find_files',
    label: 'Find Files',
    description: 'Find files matching a glob or name pattern.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files against' },
        dir_path: {
          type: 'string',
          description: 'Directory to search in (defaults to project root)',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of matching file paths',
        },
      },
    },
  },
  {
    name: 'mkdir',
    label: 'Create Directory',
    description: 'Create a new directory (including parent directories).',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['dir_path'],
      properties: {
        dir_path: { type: 'string', description: 'Path of the directory to create' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
  {
    name: 'grep',
    label: 'Grep',
    description: 'Search file contents for a pattern using regular expressions.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Regular expression pattern to search for' },
        dir_path: {
          type: 'string',
          description: 'Directory to search in (defaults to project root)',
        },
        include: { type: 'string', description: 'Glob pattern to filter files to search' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'integer' },
              content: { type: 'string' },
            },
          },
          description: 'List of matching lines with file and line number',
        },
      },
    },
  },
];
