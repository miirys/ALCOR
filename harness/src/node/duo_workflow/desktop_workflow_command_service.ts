import {
  isCommandTimedOut,
  RunCommandError,
  RunCommandSuccess,
  USER_INTERRUPTED_COMMAND,
  WorkflowCommandService,
} from '@gitlab-org/workflow-executor';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { asPromise, isAbortError } from '@gitlab-org/resiliency';
import { doNotAwait } from '@gitlab-org/core';
import { runCommandRequest, cancelRunningCommandNotification } from './workflow_rpc_messages';

/** Time to wait for the IDE to respond with partial output after sending a cancel notification */
export const IDE_CANCEL_TIMEOUT_MS = 3000;

@Injectable(WorkflowCommandService, [Logger, RpcMessageSender])
export class DesktopWorkflowCommandService implements WorkflowCommandService {
  #logger: Logger;

  #messageSender: RpcMessageSender;

  constructor(logger: Logger, rpcMessageSender: RpcMessageSender) {
    this.#logger = withPrefix(logger, '[DuoWorkflowCommandService]');
    this.#messageSender = rpcMessageSender;
  }

  readonly priority: number = 2;

  async runCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    silent: boolean,
    args: string[],
    abortSignal: AbortSignal = new AbortController().signal,
  ): Promise<RunCommandSuccess | RunCommandError> {
    return this.#executeViaRpc(workflowId, workspaceFolderPath, command, silent, args, abortSignal);
  }

  async runShellCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    silent: boolean,
    abortSignal: AbortSignal = new AbortController().signal,
  ): Promise<RunCommandSuccess | RunCommandError> {
    return this.#executeViaRpc(
      workflowId,
      workspaceFolderPath,
      command,
      silent,
      undefined,
      abortSignal,
    );
  }

  async #executeViaRpc(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    silent: boolean,
    args: string[] | undefined,
    abortSignal: AbortSignal,
  ): Promise<RunCommandSuccess | RunCommandError> {
    const rpcPromise = this.#messageSender.send(runCommandRequest, {
      workflowId,
      workspaceFolderPath,
      command,
      silent,
      args,
    });

    try {
      const { output, exitCode } = await Promise.race([rpcPromise, asPromise(abortSignal)]);

      this.#logger.debug(`Received exit code: ${exitCode}`);

      return { output, exitCode: exitCode ?? null };
    } catch (e) {
      if (isAbortError(e)) {
        if (e.message === USER_INTERRUPTED_COMMAND) {
          return this.#handleUserInterrupt(workflowId, rpcPromise);
        }
        if (isCommandTimedOut(e.message)) {
          return this.#handleTimeout(workflowId, rpcPromise, e.message);
        }
        return { error: 'Operation was aborted because the workflow was cancelled or stopped' };
      }

      this.#logger.info(
        `Tried to run the command in IDE terminal but failed with: ${e instanceof Error ? e.message : e}\nWill fallback to running the command directly, without the IDE.`,
      );
      // Re-throw errors so the fallback wrapper can kick in and attempt to run this command without IDE integration
      throw e;
    }
  }

  async #handleTimeout(
    workflowId: string,
    rpcPromise: Promise<{ output: string; exitCode?: number }>,
    timeoutMessage: string,
  ): Promise<RunCommandError> {
    this.#logger.info(`${timeoutMessage}, sending cancel notification to IDE`);

    doNotAwait(this.#messageSender.send(cancelRunningCommandNotification, { workflowId }));

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        rpcPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('IDE did not respond in time')),
            IDE_CANCEL_TIMEOUT_MS,
          );
        }),
      ]);

      const output = result.output ?? '';
      const partialOutput = output.length > 0 ? `\nPartial output:\n${output}` : '';
      return { error: `${timeoutMessage}${partialOutput}` };
    } catch (e) {
      this.#logger.debug(
        `IDE did not respond within timeout after cancel notification: ${e instanceof Error ? e.message : e}`,
      );
      return { error: timeoutMessage };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #handleUserInterrupt(
    workflowId: string,
    rpcPromise: Promise<{ output: string; exitCode?: number }>,
  ): Promise<RunCommandError> {
    this.#logger.info('User interrupted command, sending cancel notification to IDE');

    doNotAwait(this.#messageSender.send(cancelRunningCommandNotification, { workflowId }));

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        rpcPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('IDE did not respond in time')),
            IDE_CANCEL_TIMEOUT_MS,
          );
        }),
      ]);

      const output = result.output ?? '';
      const partialOutput = output.length > 0 ? `\nPartial output:\n${output}` : '';
      return { error: `${USER_INTERRUPTED_COMMAND}${partialOutput}` };
    } catch (e) {
      this.#logger.debug(
        `IDE did not respond within timeout after cancel notification: ${e instanceof Error ? e.message : e}`,
      );
      return { error: USER_INTERRUPTED_COMMAND };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
