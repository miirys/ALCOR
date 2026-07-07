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

export type RunCommandAction = WorkflowActionOf<'runCommand'>;

// The display path receives either a single `command` string or a
// `program` + optional `args` pair (distinct from the gRPC execution contract).
const runCommandArgsSchema = z.union([
  z.object({ command: z.string() }),
  z.object({ program: z.string(), args: z.string().optional() }),
]);

@Injectable(ToolInputFormatter, [])
export class RunCommandFormatter implements ToolInputFormatter {
  toolName = 'run_command';

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown): ToolInputDisplay {
    const parsed = runCommandArgsSchema.parse(args);

    if ('command' in parsed) {
      return {
        tool: 'run_command',
        command: parsed.command,
      };
    }

    const command = parsed.args ? `${parsed.program} ${parsed.args}` : parsed.program;

    return {
      tool: 'run_command',
      command,
    };
  }
}

@Injectable(WorkflowActionHandler, [Logger, collection(WorkflowCommandService)])
export class RunCommandActionHandler implements WorkflowActionHandler<RunCommandAction> {
  #logger: Logger;

  #workflowCommandService: BareService<WorkflowCommandService>;

  constructor(logger: Logger, commandServices: WorkflowCommandService[]) {
    this.#logger = withPrefix(logger, '[RunCommandActionHandler]');
    this.#workflowCommandService = createFallbackService(this.#logger, commandServices);
  }

  name = 'run_command';

  supportsVirtualWorkspace = false;

  canHandle(action: WorkflowAction): action is RunCommandAction {
    return Boolean(action.runCommand);
  }

  async execute(
    { runCommand }: RunCommandAction,
    { workspaceFolderPath, workflowId, abortSignal }: WorkflowActionContext,
  ): Promise<PlainTextResponse> {
    const { program, flags, arguments: args, timeout } = runCommand;

    this.#logger.debug(
      `Running command with params: ${JSON.stringify({ program, flags, arguments: args, timeout })}`,
    );

    const commandTimeout = timeout ? new CommandTimeoutSignal(timeout) : undefined;
    if (commandTimeout) {
      this.#logger.debug(`Timeout signal created: command will be aborted after ${timeout}s`);
      commandTimeout.signal.addEventListener('abort', () => {
        this.#logger.debug(`Command "${program}" timed out after ${timeout}s`);
      });
    }

    const signal =
      commandTimeout && abortSignal
        ? AbortSignal.any([abortSignal, commandTimeout.signal])
        : (commandTimeout?.signal ?? abortSignal);

    try {
      const result = await this.#workflowCommandService.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        false,
        [...flags, ...args],
        signal,
      );

      if (isCommandError(result)) {
        return { ...result, response: '' };
      }

      const { output, exitCode } = result;
      // Output not logged as it can contain sensitive values
      this.#logger.debug(
        `Command "${program}" exited with code ${exitCode} (${output.length} chars)`,
      );
      const response = `Exit code: ${exitCode}\n${output}`;
      return { response, error: '' };
    } finally {
      commandTimeout?.clear();
    }
  }
}
