/**
 * GitLab Context Tool Definitions
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

const CATEGORY = 'GitLab::Context';

export const GITLAB_CONTEXT_TOOLS: ToolDefinition[] = [
  {
    name: 'get_issue',
    label: 'Get Issue',
    description: 'Retrieve a GitLab issue by its IID.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['issue_iid'],
      properties: {
        issue_iid: { type: 'integer', description: 'Internal ID of the issue' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        state: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        assignees: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'get_merge_request',
    label: 'Get Merge Request',
    description: 'Retrieve a GitLab merge request by its IID.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['merge_request_iid'],
      properties: {
        merge_request_iid: { type: 'integer', description: 'Internal ID of the merge request' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        state: { type: 'string' },
        source_branch: { type: 'string' },
        target_branch: { type: 'string' },
      },
    },
  },
  {
    name: 'list_merge_request_diffs',
    label: 'List MR Diffs',
    description: 'List the file diffs in a merge request.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['merge_request_iid'],
      properties: {
        merge_request_iid: { type: 'integer', description: 'Internal ID of the merge request' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        diffs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              old_path: { type: 'string' },
              new_path: { type: 'string' },
              diff: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_repository_file',
    label: 'Get Repository File',
    description: 'Get the contents of a file from the GitLab repository.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['file_path'],
      properties: {
        file_path: { type: 'string', description: 'Path to the file in the repository' },
        ref: { type: 'string', description: 'Branch or tag name (defaults to default branch)' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Base64-decoded file content' },
        file_name: { type: 'string' },
        file_path: { type: 'string' },
        size: { type: 'integer' },
      },
    },
  },
  {
    name: 'list_repository_tree',
    label: 'List Repository Tree',
    description: 'List the files and directories in a repository path.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path inside the repository (defaults to root)' },
        ref: { type: 'string', description: 'Branch or tag name (defaults to default branch)' },
        recursive: { type: 'boolean', description: 'List files recursively' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', description: 'blob (file) or tree (directory)' },
              path: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_job_logs',
    label: 'Get Job Logs',
    description: 'Retrieve the log output of a CI/CD job.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['job_id'],
      properties: {
        job_id: { type: 'integer', description: 'ID of the CI/CD job' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        log: { type: 'string', description: 'Job log output' },
      },
    },
  },
  {
    name: 'get_pipeline_failing_jobs',
    label: 'Get Pipeline Failing Jobs',
    description: 'Get the failing jobs from a CI/CD pipeline.',
    category: CATEGORY,
    inputSchema: {
      type: 'object',
      required: ['pipeline_id'],
      properties: {
        pipeline_id: { type: 'integer', description: 'ID of the pipeline' },
        project_id: { type: 'string', description: 'Project path (defaults to current project)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              stage: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
  },
];
