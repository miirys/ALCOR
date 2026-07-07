/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { BaseGitCommand, validateGitCommand } from '@gitlab-org/repositories/node';
import { parseGitLabRemote } from '@gitlab-org/repositories';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { ConfigService } from '@gitlab-org/config';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { GenerateTokenResponse } from '../../../api/types';
import { WorkflowAction } from '../clients/types';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type RunGitCommandAction = WorkflowActionOf<'runGitCommand'>;

const runGitCommandArgsSchema = z.object({
  command: z.string(),
  args: z.string().optional(),
});

@Injectable(ToolInputFormatter, [])
export class RunGitCommandFormatter implements ToolInputFormatter {
  toolName = 'run_git_command';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { command, args: commandArgs } = runGitCommandArgsSchema.parse(args);
    return {
      tool: 'run_git_command',
      command,
      ...(commandArgs != null && { commandArgs }),
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, ConfigService, SecretRedactor])
export class RunGitCommandActionHandler
  extends BaseGitCommand
  implements WorkflowActionHandler<RunGitCommandAction>
{
  #configService: ConfigService;

  constructor(logger: Logger, configService: ConfigService, secretRedactor: SecretRedactor) {
    super(withPrefix(logger, '[RunGitCommandActionHandler]'), configService, secretRedactor);
    this.#configService = configService;
  }

  name = 'run_git_command';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is RunGitCommandAction {
    return Boolean(action.runGitCommand);
  }

  // FIXME: This is broken for subrepositories, it only works if workspaceFolderPath === repositoryPath
  async execute(
    { runGitCommand }: RunGitCommandAction,
    { workspaceFolderPath, workflowToken, workflowId, abortSignal }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    try {
      // before running command we parse its args and validate it is safe to run
      const validationResult = validateGitCommand(runGitCommand.command, runGitCommand.arguments);

      if (!validationResult.isValid) {
        throw new Error(validationResult.error);
      }

      const parsedArgs = validationResult.args ?? [];
      const commandArgs = [
        ...parsedArgs,
        ...this.#buildSessionTrailerArgs(
          runGitCommand.command,
          parsedArgs,
          workflowId,
          runGitCommand.repository_url,
          workflowToken,
        ),
      ];

      const gitArgs = await this.buildGitArgs(
        runGitCommand.command,
        commandArgs,
        runGitCommand.repository_url,
        workspaceFolderPath,
      );

      const result = await this.runGitCommand(
        gitArgs,
        workspaceFolderPath,
        workflowToken.gitlab_rails.token,
        abortSignal,
      );
      // Output not logged as it can contain sensitive values
      this.logger.debug(
        `Git command "${runGitCommand.command}" exited with code ${result.exitCode} (${result.output.length} chars)`,
      );
      const response = `Exit code: ${result.exitCode}\n${result.output}`;
      return { response, error: '' };
    } catch (error) {
      this.logger.error('Git command execution error', error);
      return { response: '', error: `${error instanceof Error ? error.message : error}` };
    }
  }

  #buildSessionTrailerArgs(
    command: string,
    args: string[],
    workflowId: string,
    repositoryUrl: string,
    workflowToken: GenerateTokenResponse,
  ): string[] {
    if (command !== 'commit' || args.includes('--amend')) return [];
    if (!this.#configService.get('duo.sessionTrackingEnabled')) return [];

    const instanceUrl = this.#configService.get('baseUrl') ?? workflowToken.gitlab_rails.base_url;
    const projectPath = parseGitLabRemote(repositoryUrl, instanceUrl)?.namespaceWithPath;

    if (!instanceUrl || !projectPath || !workflowId) return [];

    return [
      '--trailer',
      'Co-authored-by: GitLab Duo <duo@gitlab.com>',
      '--trailer',
      `Duo-Session: ${instanceUrl}/${projectPath}/-/automate/agent-sessions/${workflowId}`,
    ];
  }
}
