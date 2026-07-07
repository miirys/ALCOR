import { createInterfaceId } from '@gitlab/needle';

export const USER_INTERRUPTED_COMMAND = 'Command was interrupted by the user';
export const COMMAND_TIMED_OUT_PREFIX = 'Command timed out after';

export const commandTimedOutMessage = (timeoutSeconds: number) =>
  `${COMMAND_TIMED_OUT_PREFIX} ${timeoutSeconds}s`;

export const isCommandTimedOut = (message: string) => message.startsWith(COMMAND_TIMED_OUT_PREFIX);

export type RunCommandError = { error: string };
export type RunCommandSuccess = { output: string; exitCode: number | null };

export const isCommandError = (
  result: RunCommandError | RunCommandSuccess,
): result is RunCommandError => {
  return Object.hasOwn(result, 'error');
};

export interface WorkflowCommandService {
  priority: number;
  runCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    silent: boolean,
    args: string[],
    abortSignal?: AbortSignal,
  ): Promise<RunCommandSuccess | RunCommandError>;
  runShellCommand(
    workflowId: string,
    workspaceFolderPath: string,
    command: string,
    silent: boolean,
    abortSignal?: AbortSignal,
  ): Promise<RunCommandSuccess | RunCommandError>;
}

export const WorkflowCommandService =
  createInterfaceId<WorkflowCommandService>('WorkflowCommandService');
