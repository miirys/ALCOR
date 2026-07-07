import { DefaultRpcMessageSender, MessageConnection } from '@gitlab-org/rpc-client';
import { RpcMessageDefinitionProvider } from '@gitlab-org/rpc';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { USER_INTERRUPTED_COMMAND } from '@gitlab-org/workflow-executor';
import { runCommandRequest, cancelRunningCommandNotification } from './workflow_rpc_messages';
import {
  DesktopWorkflowCommandService,
  IDE_CANCEL_TIMEOUT_MS,
} from './desktop_workflow_command_service';

jest.useFakeTimers();

describe('DesktopWorkflowCommandService', () => {
  let desktopWorkflowCommandService: DesktopWorkflowCommandService;
  let mockConnection: MessageConnection;
  let mockLogger: TestLogger;
  let sendRequestSpy: jest.SpyInstance;
  const workflowId = '1234';
  const workspaceFolderPath = '/path/to/folder';
  const program = 'npm';
  const silent = true;
  const args = ['--no-warnings', 'run', 'build'];

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockConnection = createFakePartial<MessageConnection>({
      sendRequest: jest.fn(),
      sendNotification: jest.fn(),
    });

    const mockDefinitionProvider = createFakePartial<RpcMessageDefinitionProvider>({
      getMessageDefinitions: () => [runCommandRequest, cancelRunningCommandNotification],
    });

    const rpcMessageSender = new DefaultRpcMessageSender(mockConnection, mockDefinitionProvider);

    sendRequestSpy = jest.spyOn(rpcMessageSender, 'send');

    desktopWorkflowCommandService = new DesktopWorkflowCommandService(mockLogger, rpcMessageSender);
  });

  describe('runCommand', () => {
    describe('when rpc command succeeds', () => {
      let processOutput: string;
      let processExitCode: number;

      beforeEach(() => {
        processOutput = 'This is the command output';
        processExitCode = 0;
        jest
          .mocked(mockConnection.sendRequest)
          .mockResolvedValue({ output: processOutput, exitCode: processExitCode });
      });

      it('returns the output and exit code', async () => {
        const result = await desktopWorkflowCommandService.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
        );

        expect(result).toEqual({ output: processOutput, exitCode: processExitCode });

        expect(sendRequestSpy).toHaveBeenCalledWith(runCommandRequest, {
          command: program,
          workspaceFolderPath,
          workflowId,
          args,
          silent,
        });
      });
    });

    describe('when the abort signal triggers before the RPC message returns', () => {
      beforeEach(() => {
        jest.mocked(mockConnection.sendRequest).mockReturnValue(new Promise(() => {}));
      });

      it('returns abort error', async () => {
        const abortController = new AbortController();

        const resultPromise = desktopWorkflowCommandService.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort();
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: 'Operation was aborted because the workflow was cancelled or stopped',
        });
      });
    });

    describe('when the user interrupts the running command', () => {
      it('sends a cancel notification to the IDE', async () => {
        jest.mocked(mockConnection.sendRequest).mockReturnValue(new Promise(() => {}));
        const abortController = new AbortController();

        const resultPromise = desktopWorkflowCommandService.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort(new Error(USER_INTERRUPTED_COMMAND));

        // Advance past the IDE cancel timeout so the promise resolves
        await jest.advanceTimersByTimeAsync(IDE_CANCEL_TIMEOUT_MS);

        await resultPromise;

        expect(sendRequestSpy).toHaveBeenCalledWith(cancelRunningCommandNotification, {
          workflowId,
        });
      });

      describe('when the IDE responds with partial output before the timeout', () => {
        it('returns the interrupt error with partial output', async () => {
          let resolveRpc: (value: unknown) => void;
          jest.mocked(mockConnection.sendRequest).mockReturnValue(
            new Promise((resolve) => {
              resolveRpc = resolve;
            }),
          );

          const abortController = new AbortController();

          const resultPromise = desktopWorkflowCommandService.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          abortController.abort(new Error(USER_INTERRUPTED_COMMAND));

          // IDE responds with partial output before the timeout fires
          resolveRpc!({ output: 'partial output so far', exitCode: undefined });
          await jest.advanceTimersByTimeAsync(IDE_CANCEL_TIMEOUT_MS - 1);

          const result = await resultPromise;

          expect(result).toEqual({
            error: `${USER_INTERRUPTED_COMMAND}\nPartial output:\npartial output so far`,
          });
        });
      });

      describe('when the IDE does not respond before the timeout', () => {
        it('returns the interrupt error without partial output', async () => {
          jest.mocked(mockConnection.sendRequest).mockReturnValue(new Promise(() => {}));
          const abortController = new AbortController();

          const resultPromise = desktopWorkflowCommandService.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          abortController.abort(new Error(USER_INTERRUPTED_COMMAND));

          // Advance past the timeout
          await jest.advanceTimersByTimeAsync(IDE_CANCEL_TIMEOUT_MS);

          const result = await resultPromise;

          expect(result).toEqual({
            error: USER_INTERRUPTED_COMMAND,
          });
        });
      });
    });

    describe('when the RPC message throws an error', () => {
      beforeEach(() => {
        jest
          .mocked(mockConnection.sendRequest)
          .mockRejectedValue(
            new Error('oh no command failed, user doesnt have shell integration or something'),
          );
      });

      it('re-throws the error so that the non-IDE fallback service can try running the command', async () => {
        await expect(
          desktopWorkflowCommandService.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
          ),
        ).rejects.toThrow('oh no command failed, user doesnt have shell integration or something');
      });
    });
  });

  describe('runShellCommand', () => {
    const shellCommand = 'echo "hello" && ls -la | grep test';

    describe('when rpc command succeeds', () => {
      let processOutput: string;
      let processExitCode: number;

      beforeEach(() => {
        processOutput = 'This is the command output';
        processExitCode = 0;
        jest
          .mocked(mockConnection.sendRequest)
          .mockResolvedValue({ output: processOutput, exitCode: processExitCode });
      });

      it('returns the output and exit code', async () => {
        const result = await desktopWorkflowCommandService.runShellCommand(
          workflowId,
          workspaceFolderPath,
          shellCommand,
          silent,
        );

        expect(result).toEqual({ output: processOutput, exitCode: processExitCode });

        expect(sendRequestSpy).toHaveBeenCalledWith(runCommandRequest, {
          command: shellCommand,
          workspaceFolderPath,
          workflowId,
          args: undefined,
          silent,
        });
      });
    });

    describe('when the abort signal triggers before the RPC message returns', () => {
      beforeEach(() => {
        jest.mocked(mockConnection.sendRequest).mockReturnValue(new Promise(() => {}));
      });

      it('returns abort error', async () => {
        const abortController = new AbortController();

        const resultPromise = desktopWorkflowCommandService.runShellCommand(
          workflowId,
          workspaceFolderPath,
          shellCommand,
          silent,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort();
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: 'Operation was aborted because the workflow was cancelled or stopped',
        });
      });
    });

    describe('when the RPC message throws an error', () => {
      beforeEach(() => {
        jest
          .mocked(mockConnection.sendRequest)
          .mockRejectedValue(
            new Error('oh no command failed, user doesnt have shell integration or something'),
          );
      });

      it('re-throws the error so that the non-IDE fallback service can try running the command', async () => {
        await expect(
          desktopWorkflowCommandService.runShellCommand(
            workflowId,
            workspaceFolderPath,
            shellCommand,
            silent,
          ),
        ).rejects.toThrow('oh no command failed, user doesnt have shell integration or something');
      });
    });
  });
});
