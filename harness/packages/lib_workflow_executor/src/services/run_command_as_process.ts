import { spawn, SpawnOptions } from 'node:child_process';
import { Injectable } from '@gitlab/needle';
import { ConfigService } from '@gitlab-org/config';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  isCommandTimedOut,
  RunCommandError,
  RunCommandSuccess,
  USER_INTERRUPTED_COMMAND,
  WorkflowCommandService,
} from '../api/workflow_command_service';

@Injectable(WorkflowCommandService, [Logger, ConfigService])
export class RunCommandAsProcess implements WorkflowCommandService {
  #logger: Logger;

  #configService: ConfigService;

  constructor(logger: Logger, configService: ConfigService) {
    this.#logger = withPrefix(logger, '[RunCommandAsProcess]');
    this.#configService = configService;
  }

  readonly priority: number = 1;

  /**
   * Creates a filtered environment object excluding sensitive variables for process execution
   */
  #createFilteredEnv(sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    // When running in Remote Execution, these environment variables should not be available to the
    // untrusted child process when running LLM generated commands
    const excludedVars = ['CI_JOB_TOKEN', 'GITLAB_OAUTH_TOKEN', 'DUO_WORKFLOW_SERVICE_TOKEN'];

    const filtered: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(sourceEnv)) {
      if (!excludedVars.includes(key)) {
        filtered[key] = value;
      }
    }

    if (!filtered.AI_AGENT) {
      try {
        const lsVersion = getLanguageServerVersion();
        const clientName = this.#configService.get('clientInfo')?.name;
        const sanitized = clientName?.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
        filtered.AI_AGENT = sanitized
          ? `gitlab-lsp_${lsVersion}__${sanitized}`
          : `gitlab-lsp_${lsVersion}`;
      } catch {
        this.#logger.debug('Could not determine language server version for AI_AGENT env var');
      }
    }

    return filtered;
  }

  /**
   * Executes a command directly as a child process without shell interpretation.
   * Arguments are passed separately to avoid shell injection vulnerabilities.
   */
  async runCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    _silent: boolean,
    args: string[],
    abortSignal: AbortSignal = new AbortController().signal,
  ): Promise<RunCommandSuccess | RunCommandError> {
    this.#logger.debug(
      `Running command: ${command} ${args.join(' ')} in ${workspaceFolderPath} for workflowId: ${workflowId}`,
    );

    return this.#spawnCommand(command, args, {
      cwd: workspaceFolderPath,
      signal: abortSignal,
      shell: false,
    });
  }

  /**
   * Executes a command string through the system shell, enabling shell features
   * like pipes, redirects, and command chaining (e.g., `&&`, `|`).
   */
  async runShellCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    _silent: boolean,
    abortSignal: AbortSignal = new AbortController().signal,
  ): Promise<RunCommandSuccess | RunCommandError> {
    this.#logger.debug(
      `Running shell command: ${command} in ${workspaceFolderPath} for workflowId: ${workflowId}`,
    );

    return this.#spawnCommand(command, [], {
      cwd: workspaceFolderPath,
      signal: abortSignal,
      shell: true,
    });
  }

  /**
   * Spawns a child process with the given command and options.
   * Captures stdout/stderr and handles abort signals.
   */
  #spawnCommand(
    command: string,
    args: string[],
    options: SpawnOptions,
  ): Promise<RunCommandSuccess | RunCommandError> {
    const { signal, ...spawnOptions } = options;

    return new Promise((resolve) => {
      // Don't pass signal to spawn() - we handle abort ourselves to control
      // the error message and capture partial output
      const child = spawn(command, args, {
        ...spawnOptions,
        env: this.#createFilteredEnv(),
      });

      let output = '';
      let resolved = false;

      const resolveOnce = (result: RunCommandSuccess | RunCommandError) => {
        if (!resolved) {
          resolved = true;
          signal?.removeEventListener('abort', abortHandler);
          resolve(result);
        }
      };

      const abortHandler = () => {
        const reason = signal?.reason;
        const isUserInterrupt =
          reason instanceof Error && reason.message === USER_INTERRUPTED_COMMAND;
        const isTimeout = reason instanceof Error && isCommandTimedOut(reason.message);

        child.kill('SIGTERM');

        if (isUserInterrupt) {
          this.#logger.info('Command interrupted by user');
          const partialOutput = output.length > 0 ? `\nPartial output:\n${output}` : '';
          resolveOnce({
            error: `${USER_INTERRUPTED_COMMAND}${partialOutput}`,
          });
        } else if (isTimeout) {
          this.#logger.info('Command timed out');
          const partialOutput = output.length > 0 ? `\nPartial output:\n${output}` : '';
          resolveOnce({
            error: `${reason.message}${partialOutput}`,
          });
        } else {
          this.#logger.info('Command aborted due to signal');
          resolveOnce({
            error: 'Operation was aborted because the workflow was cancelled or stopped',
          });
        }
      };

      child.stdout?.on('data', (data) => {
        output += data;
      });

      child.stderr?.on('data', (data) => {
        output += data;
      });

      child.on('error', (error) => {
        this.#logger.error(`Command execution error: ${error.message}`);
        resolveOnce({ error: error.message });
      });

      child.on('close', (exitCode) => {
        // Output not logged as it can contain sensitive values
        this.#logger.debug(`Command exited with code ${exitCode} (${output.length} chars)`);
        resolveOnce({ output, exitCode });
      });

      // Handle already-aborted signal (e.g., user interrupted during IDE terminal
      // fallback before this service was called)
      if (signal?.aborted) {
        abortHandler();
        return;
      }

      signal?.addEventListener('abort', abortHandler);
    });
  }
}
