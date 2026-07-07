import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import type { WorkflowAction } from '../clients/types';
import {
  commandTimedOutMessage,
  WorkflowCommandService,
} from '../../../api/workflow_command_service';
import { RunShellCommandActionHandler, RunShellCommandAction } from './run_shell_command';
import type { WorkflowActionContext } from './index';

describe('RunShellCommandActionHandler', () => {
  let runShellCommandHandler: RunShellCommandActionHandler;
  let mockLogger: TestLogger;
  const workspaceFolderPath = '/path/to/folder';
  const workflowId = '1234';
  const command = 'echo "hello" && ls -la | grep test';
  const silent = false;
  let workflowActionContext: WorkflowActionContext;
  let mockWorkflowCommandService: WorkflowCommandService;
  let abortController: AbortController;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockWorkflowCommandService = createFakePartial<WorkflowCommandService>({
      runShellCommand: jest.fn(),
    });
    runShellCommandHandler = new RunShellCommandActionHandler(mockLogger, [
      mockWorkflowCommandService,
    ]);

    abortController = new AbortController();

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      workflowId,
      abortSignal: abortController.signal,
    });
  });

  describe('canHandle', () => {
    it('returns true for runShellCommand actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runShellCommand: { command },
      });

      expect(runShellCommandHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(runShellCommandHandler.canHandle(action)).toBe(false);
    });

    it('returns false for runCommand actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runCommand: { program: 'npm', flags: [], arguments: [] },
      });

      expect(runShellCommandHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: RunShellCommandAction;

    beforeEach(() => {
      action = createFakePartial<RunShellCommandAction>({
        runShellCommand: { command },
      });
    });

    it('calls the command service to run the shell command', async () => {
      jest
        .mocked(mockWorkflowCommandService.runShellCommand)
        .mockResolvedValue({ output: 'Success', exitCode: 0 });

      await runShellCommandHandler.execute(action, workflowActionContext);

      expect(mockWorkflowCommandService.runShellCommand).toHaveBeenCalledWith(
        workflowId,
        workspaceFolderPath,
        command,
        silent,
        abortController.signal,
      );
    });

    it('returns a response with exit code prefix when exit code is 0', async () => {
      const output = 'Success';
      jest
        .mocked(mockWorkflowCommandService.runShellCommand)
        .mockResolvedValue({ output, exitCode: 0 });

      const { error, response } = await runShellCommandHandler.execute(
        action,
        workflowActionContext,
      );
      expect(error).toBe('');
      expect(response).toBe('Exit code: 0\nSuccess');
    });

    it('returns response with exit code prefix when exit code > 0', async () => {
      const output = 'Failed';
      const exitCode = 1;
      jest
        .mocked(mockWorkflowCommandService.runShellCommand)
        .mockResolvedValue({ output, exitCode });

      const { error, response } = await runShellCommandHandler.execute(
        action,
        workflowActionContext,
      );

      expect(error).toBe('');
      expect(response).toBe('Exit code: 1\nFailed');
    });

    it('returns response with exit code prefix when exit code is null', async () => {
      const output = 'Failed';
      const exitCode = null;
      jest
        .mocked(mockWorkflowCommandService.runShellCommand)
        .mockResolvedValue({ output, exitCode });

      const { error, response } = await runShellCommandHandler.execute(
        action,
        workflowActionContext,
      );

      expect(error).toBe('');
      expect(response).toBe('Exit code: null\nFailed');
    });

    it('returns an error if the command fails to run', async () => {
      const errorMessage = 'This failed!';
      jest
        .mocked(mockWorkflowCommandService.runShellCommand)
        .mockResolvedValue({ error: errorMessage });

      const { error, response } = await runShellCommandHandler.execute(
        action,
        workflowActionContext,
      );

      expect(response).toBe('');
      expect(error).toBe(errorMessage);
    });

    describe('when timeout is provided', () => {
      it('passes a combined abort signal to the command service', async () => {
        jest
          .mocked(mockWorkflowCommandService.runShellCommand)
          .mockResolvedValue({ output: 'Success', exitCode: 0 });

        const actionWithTimeout = createFakePartial<RunShellCommandAction>({
          runShellCommand: { command, timeout: 30 },
        });

        await runShellCommandHandler.execute(actionWithTimeout, workflowActionContext);

        const passedSignal = jest.mocked(mockWorkflowCommandService.runShellCommand).mock
          .calls[0][4];
        expect(passedSignal).toBeInstanceOf(AbortSignal);
        expect(passedSignal?.aborted).toBe(false);
      });

      it('aborts the command with a timeout reason when the timeout expires', async () => {
        jest.useFakeTimers();

        let capturedSignal: AbortSignal | undefined;
        jest
          .mocked(mockWorkflowCommandService.runShellCommand)
          .mockImplementation((_wid, _wfp, _cmd, _silent, signal) => {
            capturedSignal = signal;
            return new Promise(() => {});
          });

        const actionWithTimeout = createFakePartial<RunShellCommandAction>({
          runShellCommand: { command, timeout: 5 },
        });

        doNotAwait(runShellCommandHandler.execute(actionWithTimeout, workflowActionContext));
        await Promise.resolve(); // let the mock run

        jest.advanceTimersByTime(5000);

        expect(capturedSignal?.aborted).toBe(true);
        expect(capturedSignal?.reason).toBeInstanceOf(Error);
        expect((capturedSignal?.reason as Error).message).toBe(commandTimedOutMessage(5));

        jest.useRealTimers();
      });

      it('clears the timeout after the command completes', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

        jest
          .mocked(mockWorkflowCommandService.runShellCommand)
          .mockResolvedValue({ output: 'done', exitCode: 0 });

        const actionWithTimeout = createFakePartial<RunShellCommandAction>({
          runShellCommand: { command, timeout: 30 },
        });

        await runShellCommandHandler.execute(actionWithTimeout, workflowActionContext);

        expect(clearTimeoutSpy).toHaveBeenCalled();

        clearTimeoutSpy.mockRestore();
      });
    });
  });
});
