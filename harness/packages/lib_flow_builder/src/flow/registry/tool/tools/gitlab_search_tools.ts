/**
 * GitLab Search Tool Definitions
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

const CATEGORY = 'GitLab::Search';

export const GITLAB_SEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'gitlab_blob_search',
    label: 'Blob Search',
    description: 'Search code blobs across the GitLab project.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['search'],
      properties: {
        search: { type: 'string', description: 'Search query string' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              basename: { type: 'string' },
              data: { type: 'string' },
              path: { type: 'string' },
              filename: { type: 'string' },
              ref: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'gitlab_issue_search',
    label: 'Issue Search',
    description: 'Search for issues in the GitLab project.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['search'],
      properties: {
        search: { type: 'string', description: 'Search query string' },
        state: { type: 'string', description: 'Filter by state: opened, closed, or all' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              iid: { type: 'integer' },
              title: { type: 'string' },
              state: { type: 'string' },
              web_url: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'gitlab_merge_request_search',
    label: 'Merge Request Search',
    description: 'Search for merge requests in the GitLab project.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['search'],
      properties: {
        search: { type: 'string', description: 'Search query string' },
        state: { type: 'string', description: 'Filter by state: opened, closed, merged, or all' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              iid: { type: 'integer' },
              title: { type: 'string' },
              state: { type: 'string' },
              web_url: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'gitlab_documentation_search',
    label: 'Documentation Search',
    description: 'Search GitLab documentation.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Documentation search query' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
      },
    },
  },
];
