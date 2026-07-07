/**
 * GitLab Actions Tool Definitions
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

const CATEGORY = 'GitLab::Actions';

export const GITLAB_ACTIONS_TOOLS: ToolDefinition[] = [
  {
    name: 'create_issue_note',
    label: 'Create Issue Note',
    description: 'Add a comment to a GitLab issue.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['issue_iid', 'body'],
      properties: {
        issue_iid: { type: 'integer', description: 'Internal ID of the issue' },
        body: { type: 'string', description: 'The note body in Markdown' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'ID of the created note' },
      },
    },
  },
  {
    name: 'create_merge_request_note',
    label: 'Create MR Note',
    description: 'Add a comment to a GitLab merge request.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['merge_request_iid', 'body'],
      properties: {
        merge_request_iid: { type: 'integer', description: 'Internal ID of the merge request' },
        body: { type: 'string', description: 'The note body in Markdown' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'ID of the created note' },
      },
    },
  },
  {
    name: 'create_commit',
    label: 'Create Commit',
    description: 'Create a commit with file changes on a branch.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['branch', 'commit_message', 'actions'],
      properties: {
        branch: { type: 'string', description: 'Branch to commit to' },
        commit_message: { type: 'string', description: 'Commit message' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'File action (create, delete, move, update)',
              },
              file_path: { type: 'string', description: 'Path to the file' },
              content: { type: 'string', description: 'File content (for create/update)' },
            },
          },
          description: 'List of file actions to include in the commit',
        },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The commit SHA' },
        short_id: { type: 'string' },
        title: { type: 'string' },
      },
    },
  },
  {
    name: 'create_branch',
    label: 'Create Branch',
    description: 'Create a new branch from a given ref.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['branch', 'ref'],
      properties: {
        branch: { type: 'string', description: 'Name of the new branch' },
        ref: { type: 'string', description: 'Branch or SHA to create from' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the created branch' },
        commit: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            short_id: { type: 'string' },
          },
        },
      },
    },
  },
];
