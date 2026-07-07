import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import type { WorkflowAction } from '../clients/types';
import {
  commandTimedOutMessage,
  WorkflowCommandService,
} from '../../../api/workflow_command_service';
import { RunCommandActionHandler, RunCommandAction } from './run_command';
import type { WorkflowActionContext } from './index';

describe('RunCommandActionHandler', () => {
  let runCommandHandler: RunCommandActionHandler;
  let mockLogger: TestLogger;
  const workspaceFolderPath = '/path/to/folder';
  const workflowId = '1234';
  const program = 'npm';
  const flags = ['--no-warnings'];
  const args = ['run', 'build'];
  const silent = false;
  let workflowActionContext: WorkflowActionContext;
  let mockWorkflowCommandService: WorkflowCommandService;
  let abortController: AbortController;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockWorkflowCommandService = createFakePartial<WorkflowCommandService>({
      runCommand: jest.fn(),
    });
    runCommandHandler = new RunCommandActionHandler(mockLogger, [mockWorkflowCommandService]);

    abortController = new AbortController();

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      workflowId,
      abortSignal: abortController.signal,
    });
  });

  describe('canHandle', () => {
    it('returns true for runCommand actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runCommand: { program, flags, arguments: args },
      });

      expect(runCommandHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(runCommandHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: RunCommandAction;

    beforeEach(() => {
      action = createFakePartial<RunCommandAction>({
        runCommand: { program, flags, arguments: args },
      });
    });

    it('calls the command service to run the command', async () => {
      jest
        .mocked(mockWorkflowCommandService.runCommand)
        .mockResolvedValue({ output: 'Success', exitCode: 0 });

      await runCommandHandler.execute(action, workflowActionContext);

      expect(mockWorkflowCommandService.runCommand).toHaveBeenCalledWith(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        [...flags, ...args],
        abortController.signal,
      );
    });

    describe('when timeout is provided', () => {
      it('passes a combined abort signal to the command service', async () => {
        jest
          .mocked(mockWorkflowCommandService.runCommand)
          .mockResolvedValue({ output: 'Success', exitCode: 0 });

        const actionWithTimeout = createFakePartial<RunCommandAction>({
          runCommand: { program, flags, arguments: args, timeout: 30 },
        });

        await runCommandHandler.execute(actionWithTimeout, workflowActionContext);

        const passedSignal = jest.mocked(mockWorkflowCommandService.runCommand).mock.calls[0][5];
        expect(passedSignal).toBeInstanceOf(AbortSignal);
        expect(passedSignal?.aborted).toBe(false);
      });

      it('aborts the command with a COMMAND_TIMED_OUT reason when the timeout expires', async () => {
        jest.useFakeTimers();

        let capturedSignal: AbortSignal | undefined;
        jest
          .mocked(mockWorkflowCommandService.runCommand)
          .mockImplementation((_wid, _wfp, _prog, _silent, _cmdArgs, signal) => {
            capturedSignal = signal;
            return new Promise(() => {});
          });

        const actionWithTimeout = createFakePartial<RunCommandAction>({
          runCommand: { program, flags, arguments: args, timeout: 5 },
        });

        doNotAwait(runCommandHandler.execute(actionWithTimeout, workflowActionContext));
        await Promise.resolve(); // let the mock run and capture the signal

        await jest.advanceTimersByTimeAsync(5000);

        expect(capturedSignal?.aborted).toBe(true);
        expect(capturedSignal?.reason).toBeInstanceOf(Error);
        expect((capturedSignal?.reason as Error).message).toBe(commandTimedOutMessage(5));

        jest.useRealTimers();
      });
    });

    it('returns a response with exit code prefix when exit code is 0', async () => {
      const output = 'Success';
      jest.mocked(mockWorkflowCommandService.runCommand).mockResolvedValue({ output, exitCode: 0 });

      const { error, response } = await runCommandHandler.execute(action, workflowActionContext);

      expect(error).toBe('');
      expect(response).toBe('Exit code: 0\nSuccess');
    });

    it('returns response with exit code prefix when exit code > 0', async () => {
      const output = 'Failed';
      const exitCode = 1;
      jest.mocked(mockWorkflowCommandService.runCommand).mockResolvedValue({ output, exitCode });

      const { error, response } = await runCommandHandler.execute(action, workflowActionContext);

      expect(error).toBe('');
      expect(response).toBe('Exit code: 1\nFailed');
    });

    it('returns response with exit code prefix when exit code is null', async () => {
      const output = 'Failed';
      const exitCode = null;
      jest.mocked(mockWorkflowCommandService.runCommand).mockResolvedValue({ output, exitCode });

      const { error, response } = await runCommandHandler.execute(action, workflowActionContext);

      expect(error).toBe('');
      expect(response).toBe('Exit code: null\nFailed');
    });

    it('returns an error if the command fails to run', async () => {
      const errorMessage = 'This failed!';
      jest.mocked(mockWorkflowCommandService.runCommand).mockResolvedValue({ error: errorMessage });

      const { error, response } = await runCommandHandler.execute(action, workflowActionContext);

      expect(response).toBe('');
      expect(error).toBe(errorMessage);
    });
  });
});
