import { spawn } from 'node:child_process';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { TestLogger } from '@gitlab-org/logging';
import { AbortError } from '@gitlab-org/resiliency';
import { MockChildProcess } from '@gitlab-org/test-utils';
import { commandTimedOutMessage, USER_INTERRUPTED_COMMAND } from '@gitlab-org/workflow-executor';
import { RunCommandAsProcess } from './run_command_as_process';

jest.mock('node:child_process');

jest.useFakeTimers();

describe('RunCommandAsProcess', () => {
  let runCommandAsProcess: RunCommandAsProcess;
  let mockLogger: TestLogger;
  let configService: ConfigService;
  let mockChildProcess: MockChildProcess;
  const workflowId = '1234';
  const workspaceFolderPath = '/path/to/folder';
  const program = 'npm';
  const silent = true;
  const args = ['--no-warnings', 'run', 'build'];

  beforeEach(() => {
    mockLogger = new TestLogger();
    configService = new DefaultConfigService();
    runCommandAsProcess = new RunCommandAsProcess(mockLogger, configService);
    mockChildProcess = new MockChildProcess();
    jest.mocked(spawn).mockReturnValue(mockChildProcess as unknown as ReturnType<typeof spawn>);
  });

  describe('runCommand', () => {
    it('spawns the process with the correct arguments and working directory', async () => {
      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      // Simulate successful command execution
      mockChildProcess.stdout.emit('data', 'Command output');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual({ output: 'Command output', exitCode: 0 });
      expect(spawn).toHaveBeenCalledWith(program, args, {
        cwd: workspaceFolderPath,
        env: expect.any(Object),
        shell: false,
      });
    });

    it('returns with combined output when command completes successfully', async () => {
      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      // Simulate multiple data events
      mockChildProcess.stdout.emit('data', 'First part of output');
      mockChildProcess.stderr.emit('data', ', and second part');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;

      expect(result).toMatchObject({ output: 'First part of output, and second part' });
    });

    it('returns with error when command execution fails', async () => {
      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const err = new Error('Command not found');
      mockChildProcess.emit('error', err);

      const result = await executePromise;

      expect(result).toEqual({ error: err.message });
    });

    it('returns with error when command exits with non-zero code', async () => {
      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      mockChildProcess.stdout.emit('data', 'It started working\n');
      mockChildProcess.stderr.emit('data', 'Error: something went wrong');
      mockChildProcess.emit('close', 1);

      const result = await executePromise;

      expect(result).toEqual({
        output: 'It started working\nError: something went wrong',
        exitCode: 1,
      });
    });

    it('excludes sensitive environment variables when spawning process', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        CI_JOB_TOKEN: 'secret-token',
        GITLAB_OAUTH_TOKEN: 'oauth-secret',
        DUO_WORKFLOW_SERVICE_TOKEN: 'workflow-secret',
      };

      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.CI_JOB_TOKEN).toBeUndefined();
      expect(envArg!.GITLAB_OAUTH_TOKEN).toBeUndefined();
      expect(envArg!.DUO_WORKFLOW_SERVICE_TOKEN).toBeUndefined();

      mockChildProcess.stdout.emit('data', 'Command output');
      mockChildProcess.emit('close', 0);
      await executePromise;

      // Restore original env
      process.env = originalEnv;
    });

    describe('AbortController functionality', () => {
      it('does not pass abort signal to spawned process (handled manually)', async () => {
        const abortController = new AbortController();

        const executePromise = runCommandAsProcess.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();

        expect(spawn).toHaveBeenCalledWith(
          program,
          args,
          expect.not.objectContaining({
            signal: expect.anything(),
          }),
        );

        mockChildProcess.stdout.emit('data', 'Command output');
        mockChildProcess.emit('close', 0);
        await executePromise;
      });

      it('returns abort error when signal is aborted', async () => {
        const abortController = new AbortController();

        const resultPromise = runCommandAsProcess.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort(new AbortError('Workflow cancelled'));
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: 'Operation was aborted because the workflow was cancelled or stopped',
        });
      });

      it('returns user interrupt error with partial output when interrupted by user', async () => {
        const abortController = new AbortController();

        const resultPromise = runCommandAsProcess.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        mockChildProcess.stdout.emit('data', 'partial output so far');
        abortController.abort(new Error(USER_INTERRUPTED_COMMAND));
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: `${USER_INTERRUPTED_COMMAND}\nPartial output:\npartial output so far`,
        });
      });

      it('handles pre-aborted signal by immediately killing the process', async () => {
        const abortController = new AbortController();
        abortController.abort(new Error(USER_INTERRUPTED_COMMAND));

        const resultPromise = runCommandAsProcess.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: USER_INTERRUPTED_COMMAND,
        });
      });

      it('returns user interrupt error without partial output when no output collected', async () => {
        const abortController = new AbortController();

        const resultPromise = runCommandAsProcess.runCommand(
          workflowId,
          workspaceFolderPath,
          program,
          silent,
          args,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort(new Error(USER_INTERRUPTED_COMMAND));
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: USER_INTERRUPTED_COMMAND,
        });
      });

      describe('when the command times out', () => {
        it('returns a timeout error with partial output when output was collected', async () => {
          const abortController = new AbortController();
          const timeoutMessage = commandTimedOutMessage(5);

          const resultPromise = runCommandAsProcess.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          mockChildProcess.stdout.emit('data', 'partial output so far');
          abortController.abort(new Error(timeoutMessage));
          await jest.advanceTimersToNextTimerAsync();

          const result = await resultPromise;

          expect(result).toEqual({
            error: `${timeoutMessage}\nPartial output:\npartial output so far`,
          });
        });

        it('returns a timeout error without partial output when no output was collected', async () => {
          const abortController = new AbortController();
          const timeoutMessage = commandTimedOutMessage(5);

          const resultPromise = runCommandAsProcess.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          abortController.abort(new Error(timeoutMessage));
          await jest.advanceTimersToNextTimerAsync();

          const result = await resultPromise;

          expect(result).toEqual({ error: timeoutMessage });
        });

        it('kills the child process on timeout', async () => {
          const abortController = new AbortController();
          const timeoutMessage = commandTimedOutMessage(10);

          const resultPromise = runCommandAsProcess.runCommand(
            workflowId,
            workspaceFolderPath,
            program,
            silent,
            args,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          abortController.abort(new Error(timeoutMessage));
          await jest.advanceTimersToNextTimerAsync();

          await resultPromise;

          expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });
      });
    });
  });

  describe('runShellCommand', () => {
    const shellCommand = 'echo "hello" && ls -la | grep test';

    it('spawns the process with shell: true and empty args', async () => {
      const executePromise = runCommandAsProcess.runShellCommand(
        workflowId,
        workspaceFolderPath,
        shellCommand,
        silent,
      );

      await jest.advanceTimersToNextTimerAsync();

      mockChildProcess.stdout.emit('data', 'Command output');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual({ output: 'Command output', exitCode: 0 });
      expect(spawn).toHaveBeenCalledWith(shellCommand, [], {
        cwd: workspaceFolderPath,
        env: expect.any(Object),
        shell: true,
      });
    });

    it('returns with combined output when shell command completes successfully', async () => {
      const executePromise = runCommandAsProcess.runShellCommand(
        workflowId,
        workspaceFolderPath,
        shellCommand,
        silent,
      );

      await jest.advanceTimersToNextTimerAsync();

      mockChildProcess.stdout.emit('data', 'First part of output');
      mockChildProcess.stderr.emit('data', ', and second part');
      mockChildProcess.emit('close', 0);

      const result = await executePromise;

      expect(result).toMatchObject({ output: 'First part of output, and second part' });
    });

    it('returns with error when shell command execution fails', async () => {
      const executePromise = runCommandAsProcess.runShellCommand(
        workflowId,
        workspaceFolderPath,
        shellCommand,
        silent,
      );

      await jest.advanceTimersToNextTimerAsync();

      const err = new Error('Command not found');
      mockChildProcess.emit('error', err);

      const result = await executePromise;

      expect(result).toEqual({ error: err.message });
    });

    it('returns with error when shell command exits with non-zero code', async () => {
      const executePromise = runCommandAsProcess.runShellCommand(
        workflowId,
        workspaceFolderPath,
        shellCommand,
        silent,
      );

      await jest.advanceTimersToNextTimerAsync();

      mockChildProcess.stdout.emit('data', 'It started working\n');
      mockChildProcess.stderr.emit('data', 'Error: something went wrong');
      mockChildProcess.emit('close', 1);

      const result = await executePromise;

      expect(result).toEqual({
        output: 'It started working\nError: something went wrong',
        exitCode: 1,
      });
    });

    it('excludes sensitive environment variables when spawning shell process', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        CI_JOB_TOKEN: 'secret-token',
        GITLAB_OAUTH_TOKEN: 'oauth-secret',
        DUO_WORKFLOW_SERVICE_TOKEN: 'workflow-secret',
      };

      const executePromise = runCommandAsProcess.runShellCommand(
        workflowId,
        workspaceFolderPath,
        shellCommand,
        silent,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.CI_JOB_TOKEN).toBeUndefined();
      expect(envArg!.GITLAB_OAUTH_TOKEN).toBeUndefined();
      expect(envArg!.DUO_WORKFLOW_SERVICE_TOKEN).toBeUndefined();

      mockChildProcess.stdout.emit('data', 'Command output');
      mockChildProcess.emit('close', 0);
      await executePromise;

      process.env = originalEnv;
    });

    describe('AbortController functionality', () => {
      it('does not pass abort signal to spawned shell process (handled manually)', async () => {
        const abortController = new AbortController();

        const executePromise = runCommandAsProcess.runShellCommand(
          workflowId,
          workspaceFolderPath,
          shellCommand,
          silent,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();

        expect(spawn).toHaveBeenCalledWith(
          shellCommand,
          [],
          expect.not.objectContaining({
            signal: expect.anything(),
          }),
        );

        mockChildProcess.stdout.emit('data', 'Command output');
        mockChildProcess.emit('close', 0);
        await executePromise;
      });

      it('returns abort error when signal is aborted', async () => {
        const abortController = new AbortController();

        const resultPromise = runCommandAsProcess.runShellCommand(
          workflowId,
          workspaceFolderPath,
          shellCommand,
          silent,
          abortController.signal,
        );

        await jest.advanceTimersToNextTimerAsync();
        abortController.abort(new AbortError('Workflow cancelled'));
        await jest.advanceTimersToNextTimerAsync();

        const result = await resultPromise;

        expect(result).toEqual({
          error: 'Operation was aborted because the workflow was cancelled or stopped',
        });
      });

      describe('when the shell command times out', () => {
        it('returns a timeout error with partial output when output was collected', async () => {
          const abortController = new AbortController();
          const timeoutMessage = commandTimedOutMessage(3);

          const resultPromise = runCommandAsProcess.runShellCommand(
            workflowId,
            workspaceFolderPath,
            shellCommand,
            silent,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          mockChildProcess.stdout.emit('data', 'some partial output');
          abortController.abort(new Error(timeoutMessage));
          await jest.advanceTimersToNextTimerAsync();

          const result = await resultPromise;

          expect(result).toEqual({
            error: `${timeoutMessage}\nPartial output:\nsome partial output`,
          });
        });

        it('returns a timeout error without partial output when no output was collected', async () => {
          const abortController = new AbortController();
          const timeoutMessage = commandTimedOutMessage(3);

          const resultPromise = runCommandAsProcess.runShellCommand(
            workflowId,
            workspaceFolderPath,
            shellCommand,
            silent,
            abortController.signal,
          );

          await jest.advanceTimersToNextTimerAsync();
          abortController.abort(new Error(timeoutMessage));
          await jest.advanceTimersToNextTimerAsync();

          const result = await resultPromise;

          expect(result).toEqual({ error: timeoutMessage });
        });
      });
    });
  });

  describe('AI_AGENT environment variable', () => {
    const lsVersion = getLanguageServerVersion();

    it('sets AI_AGENT with client name when clientInfo is configured', async () => {
      configService.set('clientInfo', { name: 'Visual Studio Code', version: '1.85.0' });

      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.AI_AGENT).toBe(`gitlab-lsp_${lsVersion}__visual-studio-code`);

      mockChildProcess.emit('close', 0);
      await executePromise;
    });

    it('sanitizes client name for Duo CLI', async () => {
      configService.set('clientInfo', { name: 'Duo CLI', version: '8.94' });

      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.AI_AGENT).toBe(`gitlab-lsp_${lsVersion}__duo-cli`);

      mockChildProcess.emit('close', 0);
      await executePromise;
    });

    it('sets AI_AGENT without client suffix when clientInfo is not configured', async () => {
      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.AI_AGENT).toBe(`gitlab-lsp_${lsVersion}`);

      mockChildProcess.emit('close', 0);
      await executePromise;
    });

    it('does not overwrite AI_AGENT if already set in process.env', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, AI_AGENT: 'custom-agent/1.0' };

      configService.set('clientInfo', { name: 'Visual Studio Code', version: '1.85.0' });

      const executePromise = runCommandAsProcess.runCommand(
        workflowId,
        workspaceFolderPath,
        program,
        silent,
        args,
      );

      await jest.advanceTimersToNextTimerAsync();

      const spawnCall = jest.mocked(spawn).mock.calls[0];
      const envArg = spawnCall[2]?.env;
      expect(envArg!.AI_AGENT).toBe('custom-agent/1.0');

      mockChildProcess.emit('close', 0);
      await executePromise;

      process.env = originalEnv;
    });
  });
});
