/* eslint-disable max-classes-per-file -- action handler and its display formatter are colocated */
import { Injectable, collection } from '@gitlab/needle';
import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { WorkflowCommandService, isCommandError } from '../../../api/workflow_command_service';
import { WorkflowAction } from '../clients/types';
import { CommandTimeoutSignal } from './command_timeout_signal';
import {
  ToolInputFormatter,
  WorkflowActionContext,
  WorkflowActionHandler,
  WorkflowActionOf,
} from './index';

export type RunShellCommandAction = WorkflowActionOf<'runShellCommand'>;

const runShellCommandArgsSchema = z.object({
  command: z.string(),
});

@Injectable(ToolInputFormatter, [])
export class RunShellCommandFormatter implements ToolInputFormatter {
  toolName = 'shell_command';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const { command } = runShellCommandArgsSchema.parse(args);
    return {
      tool: 'shell_command',
      command,
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(WorkflowCommandService)])
export class RunShellCommandActionHandler implements WorkflowActionHandler<RunShellCommandAction> {
  #logger: Logger;

  #workflowCommandService: BareService<WorkflowCommandService>;

  constructor(logger: Logger, commandServices: WorkflowCommandService[]) {
    this.#logger = withPrefix(logger, '[RunShellCommandActionHandler]');
    this.#workflowCommandService = createFallbackService(this.#logger, commandServices);
  }

  name = 'shell_command';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is RunShellCommandAction {
    return Boolean(action.runShellCommand);
  }

  async execute(
    { runShellCommand }: RunShellCommandAction,
    { workspaceFolderPath, workflowId, abortSignal }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const { command, timeout } = runShellCommand;

    this.#logger.debug(
      `Running shell command: "${command}"${timeout ? ` with timeout of ${timeout}s` : ''}`,
    );

    const commandTimeout = timeout ? new CommandTimeoutSignal(timeout) : undefined;
    if (commandTimeout) {
      this.#logger.debug(`Timeout signal created: command will be aborted after ${timeout}s`);
      commandTimeout.signal.addEventListener('abort', () => {
        this.#logger.debug(`Shell command timed out after ${timeout}s`);
      });
    }

    const signal =
      commandTimeout && abortSignal
        ? AbortSignal.any([abortSignal, commandTimeout.signal])
        : (commandTimeout?.signal ?? abortSignal);

    try {
      const result = await this.#workflowCommandService.runShellCommand(
        workflowId,
        workspaceFolderPath,
        command,
        false,
        signal,
      );

      if (isCommandError(result)) {
        return { ...result, response: '' };
      }

      const { output, exitCode } = result;
      // Output not logged as it can contain sensitive values
      this.#logger.debug(`Shell command exited with code ${exitCode} (${output.length} chars)`);
      const response = `Exit code: ${exitCode}\n${output}`;
      return { response, error: '' };
    } finally {
      commandTimeout?.clear();
    }
  }
}
