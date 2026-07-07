/**
 * Shared setup logic for headless workflow testing.
 *
 * This module handles:
 * - Loading configuration from .env.template
 * - Building CLI binary for Linux x64 (optional, skipped if existingBinaryPath provided)
 * - Fetching direct_access credentials from GitLab API
 * - Creating workflow session
 * - Building the environment variables map
 */

import { execSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-ignore - listr2@9 auto-installed by `bun -i`
import { Listr } from 'listr2@9';

import type { GenerateTokenResponse } from '@gitlab-org/workflow-executor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type LinuxBunTarget = 'bun-linux-x64' | 'bun-linux-x64-baseline' | 'bun-linux-arm64';

export interface SetupOptions {
  existingBinaryPath?: string;
  /**
   * Bun target for the Linux binary to build. Defaults to 'bun-linux-x64-baseline'
   * since Docker hosts vary; pass 'bun-linux-x64' for the modern variant on
   * hardware that supports AVX2/BMI2/FMA (faster but will SIGILL on older CPUs).
   */
  linuxTarget?: LinuxBunTarget;
}

export interface SetupResult {
  binaryPath: string;
  cloneUrl: string;
  directAccess: GenerateTokenResponse;
  workflowId: string;
  flowConfig: string;
  additionalContext: string;
  envMap: Map<string, string>;
  gitlabToken: string;
  gitlabBaseUrl: string;
}

interface TaskContext {
  gitlabToken: string;
  gitlabBaseUrl: string;
  lspRepoPath: string;
  cliPath: string;
  binaryPath?: string;
  envMap?: Map<string, string>;
  directAccess?: GenerateTokenResponse;
  flowConfig?: string;
  additionalContext?: string;
  workflowId?: string;
  cloneUrl?: string;
}

export function parseEnvFile(content: string): Map<string, string> {
  const envMap = new Map<string, string>();
  content.split('\n').forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      envMap.set(key.trim(), valueParts.join('=').trim());
    }
  });
  return envMap;
}

async function getErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return json.message || json.error || text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

async function createWorkflowSession(
  baseUrl: string,
  token: string,
  projectId: string,
  definition: string,
  goal: string,
): Promise<string> {
  const url = `${baseUrl}/api/v4/ai/duo_workflows/workflows`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_id: projectId,
      agent_privileges: [1, 2, 3, 4, 5],
      goal,
      start_workflow: false,
      workflow_definition: definition,
      environment: 'ambient',
    }),
  });

  if (!response.ok) {
    const detail = await getErrorDetail(response);
    throw new Error(
      `Failed to create workflow session for project ${projectId}: ${url} ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  const templatePath = join(__dirname, '.env.template');
  const templateContent = await readFile(templatePath, 'utf-8');
  const envTemplate = parseEnvFile(templateContent);

  const gitlabToken = process.env.GITLAB_AUTH_TOKEN || process.env.GITLAB_API_PRIVATE_TOKEN;
  const gitlabBaseUrl =
    process.env.GITLAB_BASE_URL || envTemplate.get('GITLAB_BASE_URL') || 'https://gitlab.com';

  if (!gitlabToken) {
    throw new Error(
      'GITLAB_AUTH_TOKEN or GITLAB_API_PRIVATE_TOKEN environment variable is required with API scope',
    );
  }

  const lspRepoPath = join(__dirname, '..', '..', '..', '..');
  const cliPath = join(lspRepoPath, 'packages', 'cli');

  const setupTasks = new Listr<TaskContext>(
    [
      {
        title: 'Set everything up...',
        task: (ctx, task) => {
          return task.newListr(
            [
              options.existingBinaryPath
                ? {
                    title: 'Using existing binary',
                    task: async () => {
                      const binaryPath = options.existingBinaryPath!;
                      try {
                        await access(binaryPath);
                      } catch {
                        throw new Error(`Binary not found at provided path: ${binaryPath}`);
                      }
                      ctx.binaryPath = binaryPath;
                    },
                  }
                : {
                    title: `Build CLI binary (${options.linuxTarget ?? 'bun-linux-x64-baseline'})`,
                    task: async () => {
                      const target = options.linuxTarget ?? 'bun-linux-x64-baseline';
                      execSync('bun run cli:compile', {
                        cwd: ctx.lspRepoPath,
                        stdio: 'pipe',
                        env: {
                          ...process.env,
                          SUPPORTED_TARGETS: target,
                        },
                      });
                      // Mirror the filename mapping in compile_executables.ts's getExecutableName:
                      // - bun-linux-x64           → duo-linux-x64-modern (opt-in modern variant)
                      // - bun-linux-x64-baseline  → duo-linux-x64        (legacy filename preserved)
                      // - bun-linux-arm64         → duo-linux-arm64
                      let platform: string;
                      switch (target) {
                        case 'bun-linux-x64':
                          platform = 'linux-x64-modern';
                          break;
                        case 'bun-linux-x64-baseline':
                          platform = 'linux-x64';
                          break;
                        default:
                          platform = target.replace(/^bun-/, '');
                      }
                      const binaryName = `duo-${platform}`;
                      const binaryPath = join(ctx.cliPath, 'bin', binaryName);
                      try {
                        await access(binaryPath);
                        ctx.binaryPath = binaryPath;
                      } catch {
                        throw new Error(`Binary not found at expected path: ${binaryPath}`);
                      }
                    },
                  },
              {
                title: 'Load configuration and setup workflow',
                task: (_: TaskContext, subtask: { newListr: Function }) => {
                  return subtask.newListr([
                    {
                      title: 'Load configuration files',
                      task: (__: TaskContext, configTask: { newListr: Function }) => {
                        return configTask.newListr(
                          [
                            {
                              title: 'Load environment template',
                              task: () => {
                                ctx.envMap = envTemplate;
                              },
                            },
                            {
                              title: 'Load flow config',
                              task: async () => {
                                const configPath = join(__dirname, 'flow_definition.json');
                                const content = await readFile(configPath, 'utf-8');
                                ctx.flowConfig = JSON.stringify(JSON.parse(content));
                              },
                            },
                            {
                              title: 'Load additional context',
                              task: async () => {
                                const contextPath = join(__dirname, 'additional_context.json');
                                const content = await readFile(contextPath, 'utf-8');
                                ctx.additionalContext = JSON.stringify(JSON.parse(content));
                              },
                            },
                          ],
                          { concurrent: true },
                        );
                      },
                    },
                    {
                      title: 'Setup GitLab workflow',
                      task: (__: TaskContext, workflowTask: { newListr: Function }) => {
                        return workflowTask.newListr(
                          [
                            {
                              title: 'Fetch direct access credentials',
                              task: async () => {
                                const url = new URL(
                                  '/api/v4/ai/duo_workflows/direct_access',
                                  ctx.gitlabBaseUrl,
                                );
                                const response = await fetch(url, {
                                  method: 'POST',
                                  headers: {
                                    Authorization: `Bearer ${ctx.gitlabToken}`,
                                  },
                                });
                                if (!response.ok) {
                                  const detail = await getErrorDetail(response);
                                  throw new Error(
                                    `Failed to fetch direct access: ${response.status} ${response.statusText} from ${url}${detail ? ` - ${detail}` : ''}`,
                                  );
                                }
                                ctx.directAccess = (await response.json()) as GenerateTokenResponse;
                              },
                            },
                            {
                              title: 'Create workflow session',
                              task: async () => {
                                const definition = ctx.envMap!.get('DUO_WORKFLOW_DEFINITION')!;
                                const goal = ctx.envMap!.get('DUO_WORKFLOW_GOAL')!;
                                const projectId = ctx.envMap!.get('DUO_WORKFLOW_PROJECT_ID')!;

                                ctx.workflowId = await createWorkflowSession(
                                  ctx.gitlabBaseUrl,
                                  ctx.gitlabToken,
                                  projectId,
                                  definition,
                                  goal,
                                );
                              },
                            },
                          ],
                          { concurrent: true },
                        );
                      },
                    },
                  ]);
                },
              },
            ],
            { concurrent: true },
          );
        },
      },
      {
        title: 'Configure environment...',
        task: async (ctx) => {
          const { envMap, directAccess, flowConfig, additionalContext, workflowId } = ctx;

          envMap!.set('DUO_WORKFLOW_SERVICE_SERVER', directAccess!.duo_workflow_service.base_url);
          envMap!.set(
            'DUO_WORKFLOW_SERVICE_REALM',
            directAccess!.duo_workflow_service.headers['x-gitlab-realm'],
          );
          envMap!.set(
            'DUO_WORKFLOW_INSTANCE_ID',
            directAccess!.duo_workflow_service.headers['x-gitlab-instance-id'],
          );
          envMap!.set(
            'DUO_WORKFLOW_GLOBAL_USER_ID',
            directAccess!.duo_workflow_service.headers['x-gitlab-global-user-id'],
          );
          envMap!.set('DUO_WORKFLOW_SERVICE_TOKEN', directAccess!.duo_workflow_service.token);

          if (directAccess!.workflow_metadata) {
            envMap!.set('DUO_WORKFLOW_METADATA', JSON.stringify(directAccess!.workflow_metadata));
          }

          envMap!.set('GITLAB_BASE_URL', directAccess!.gitlab_rails.base_url);
          envMap!.set('GITLAB_TOKEN', gitlabToken);

          envMap!.set(
            'AGENT_PLATFORM_GITLAB_VERSION',
            directAccess!.duo_workflow_service.headers['x-gitlab-version'],
          );

          envMap!.set('DUO_WORKFLOW_FLOW_CONFIG', flowConfig!);
          envMap!.set('DUO_WORKFLOW_WORKFLOW_ID', workflowId!);
          envMap!.set('DUO_WORKFLOW_ADDITIONAL_CONTEXT_CONTENT', additionalContext!);

          ctx.cloneUrl = envMap!.get('GITLAB_PROJECT_CLONE_URL')!;
        },
      },
    ],
    {
      ctx: {
        gitlabToken,
        gitlabBaseUrl,
        lspRepoPath,
        cliPath,
      },
      rendererOptions: {
        collapseSubtasks: false,
      },
    },
  );

  console.log('Setting up test environment\n');
  const ctx = await setupTasks.run();

  return {
    binaryPath: ctx.binaryPath!,
    cloneUrl: ctx.cloneUrl!,
    directAccess: ctx.directAccess!,
    workflowId: ctx.workflowId!,
    flowConfig: ctx.flowConfig!,
    additionalContext: ctx.additionalContext!,
    envMap: ctx.envMap!,
    gitlabToken,
    gitlabBaseUrl,
  };
}
