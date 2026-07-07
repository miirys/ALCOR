import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { PlainTextResponse, HttpResponse } from '@gitlab-org/duo-workflow-service';
import { type WorkflowAction, WorkflowActionContext } from '@gitlab-org/workflow-executor/node';
import type { MessageConnection } from '@gitlab-org/rpc-client';
import type { SandboxViolations } from '@gitlab-org/workflow-executor/violations';
import { WorkerProcessManager } from './worker_process_manager';
import { SandboxedActionExecutor } from './sandboxed_action_executor';
import { ExecuteActionRequest, CancelActionNotification } from './worker_rpc';

describe('SandboxedActionExecutor', () => {
  let mockWorkerManager: WorkerProcessManager;
  let mockConnection: MessageConnection;
  let mockSandboxViolations: SandboxViolations;
  let logger: TestLogger;
  let executor: SandboxedActionExecutor;
  let mockContext: WorkflowActionContext;

  beforeEach(() => {
    logger = new TestLogger();
    mockConnection = createFakePartial<MessageConnection>({
      sendRequest: jest.fn(),
      sendNotification: jest.fn().mockResolvedValue(undefined),
    });
    mockWorkerManager = createFakePartial<WorkerProcessManager>({
      ensureRunning: jest.fn().mockResolvedValue(mockConnection),
      shutdown: jest.fn(),
      getSandboxedCommand: jest.fn().mockReturnValue('worker-cmd'),
    });
    mockSandboxViolations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([]),
      getForCommandSince: jest.fn().mockReturnValue([]),
    });
    mockContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: '/workspace',
      workflowId: 'test-workflow',
      workflowToken: {
        gitlab_rails: {
          base_url: 'https://gitlab.example.com',
          token: 'test-token',
        },
      },
      abortSignal: new AbortController().signal,
    });

    executor = new SandboxedActionExecutor(mockWorkerManager, mockSandboxViolations, logger);
  });

  describe('#execute', () => {
    it('sends action to worker via RPC and returns PlainTextResponse', async () => {
      const response = { response: 'file content', error: '' };
      jest.mocked(mockConnection.sendRequest).mockResolvedValue(response);

      const action = {
        requestID: 'r1',
        runReadFile: { filepath: 'test.txt' },
      } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(mockWorkerManager.ensureRunning).toHaveBeenCalledWith('/workspace');
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        ExecuteActionRequest.methodName,
        expect.objectContaining({
          action: expect.objectContaining({ runReadFile: { filepath: 'test.txt' } }),
          context: expect.objectContaining({
            workspaceFolderPath: '/workspace',
            gitlabBaseUrl: 'https://gitlab.example.com',
            gitlabToken: 'test-token',
          }),
        }),
      );
      expect(result).toEqual(response);
    });

    it('sends action to worker and returns HttpResponse', async () => {
      const response: HttpResponse = {
        headers: { 'content-type': 'application/json' },
        statusCode: 200,
        body: '{"ok":true}',
        error: '',
      };
      jest.mocked(mockConnection.sendRequest).mockResolvedValue(response);

      const action = {
        requestID: 'r2',
        runHTTPRequest: { method: 'GET', path: '/api' },
      } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(result).toEqual(response);
    });

    it('returns error response when worker fails', async () => {
      jest.mocked(mockWorkerManager.ensureRunning).mockRejectedValue(new Error('Worker crashed'));

      const action = {
        requestID: 'r3',
        runReadFile: { filepath: 'test.txt' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Worker crashed');
      expect(result.response).toBe('');
    });

    it('rewrites a resolved-response error as a sandbox violation when one lands in the window', async () => {
      // Worker handlers catch their own errors; sender.send resolves with { error }, never rejects.
      jest.mocked(mockConnection.sendRequest).mockResolvedValue({
        response: '',
        error: 'Error reading file: EACCES /Users/karlj/.ssh/id_rsa',
      });
      jest.mocked(mockSandboxViolations.getForCommandSince).mockReturnValue([
        {
          description: 'file-read-data /Users/karlj/.ssh/id_rsa',
          timestamp: new Date(),
        },
      ]);

      const action = {
        requestID: 'r5',
        runReadFile: { filepath: '/Users/karlj/.ssh/id_rsa' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Operation is blocked by sandbox.');
      expect(mockSandboxViolations.getForCommandSince).toHaveBeenCalledTimes(1);
      expect(mockSandboxViolations.getForCommandSince).toHaveBeenCalledWith(
        'worker-cmd',
        expect.any(Number),
      );
    });

    it('does not rewrite when the violation resource is not referenced in the error', async () => {
      // Regression: incidental ambient violation (e.g., worker subprocess hitting sysctl-read)
      // landed in the window but the action's error is about something else.
      jest.mocked(mockConnection.sendRequest).mockResolvedValue({
        response: '',
        error: 'File not found: "~/Downloads/anything.txt"',
      });
      jest.mocked(mockSandboxViolations.getForCommandSince).mockReturnValue([
        {
          description: 'git(26369) deny(1) sysctl-read kern.iossupportversion',
          timestamp: new Date(),
        },
      ]);

      const action = {
        requestID: 'rAmbient',
        runReadFile: { filepath: '~/Downloads/anything.txt' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('File not found: "~/Downloads/anything.txt"');
    });

    it('preserves the HttpResponse shape (headers, statusCode, body) when rewriting', async () => {
      const httpResponse: HttpResponse = {
        headers: { 'content-type': 'application/json' },
        statusCode: 502,
        body: '',
        error: 'connect EACCES 1.2.3.4:443',
      };
      jest.mocked(mockConnection.sendRequest).mockResolvedValue(httpResponse);
      jest
        .mocked(mockSandboxViolations.getForCommandSince)
        .mockReturnValue([
          { description: 'network deny tcp-connect 1.2.3.4:443', timestamp: new Date() },
        ]);

      const action = {
        requestID: 'rH',
        runHTTPRequest: { method: 'GET', path: '/api' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as HttpResponse;

      expect(result.error).toBe('Operation is blocked by sandbox.');
      expect(result.statusCode).toBe(502);
      expect(result.headers).toEqual({ 'content-type': 'application/json' });
      expect(result.body).toBe('');
    });

    it('uses the most recent violation when multiple land in the action window', async () => {
      jest.mocked(mockConnection.sendRequest).mockResolvedValue({
        response: '',
        error: 'Error reading file: EACCES /tmp/late',
      });
      jest.mocked(mockSandboxViolations.getForCommandSince).mockReturnValue([
        { description: 'file-read-data /tmp/early', timestamp: new Date(0) },
        { description: 'file-read-data /tmp/late', timestamp: new Date(1000) },
      ]);

      const action = {
        requestID: 'r6',
        runReadFile: { filepath: '/tmp/late' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Operation is blocked by sandbox.');
    });

    it('passes resolved responses through unchanged when no violation landed', async () => {
      jest.mocked(mockConnection.sendRequest).mockResolvedValue({
        response: '',
        error: 'Some unrelated error',
      });
      jest.mocked(mockSandboxViolations.getForCommandSince).mockReturnValue([]);

      const action = {
        requestID: 'r7',
        runReadFile: { filepath: 'test.txt' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Some unrelated error');
    });

    it('falls back to unscoped query when the worker has no sandboxed command', async () => {
      jest.mocked(mockWorkerManager.getSandboxedCommand).mockReturnValue(null);
      jest.mocked(mockConnection.sendRequest).mockResolvedValue({
        response: '',
        error: 'Error reading file: EACCES /tmp/x',
      });
      jest
        .mocked(mockSandboxViolations.getSince)
        .mockReturnValue([{ description: 'file-read-data /tmp/x', timestamp: new Date() }]);

      const action = {
        requestID: 'rNoCmd',
        runReadFile: { filepath: '/tmp/x' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Operation is blocked by sandbox.');
      expect(mockSandboxViolations.getSince).toHaveBeenCalledWith(expect.any(Number));
      expect(mockSandboxViolations.getForCommandSince).not.toHaveBeenCalled();
    });

    it('falls through to the original transport error without consulting violations', async () => {
      // Worker spawn / RPC failures aren't sandbox-deny semantics. Attribution would risk
      // mis-blaming an in-flight action for startup-time violations.
      jest.mocked(mockWorkerManager.ensureRunning).mockRejectedValue(new Error('Worker crashed'));
      jest
        .mocked(mockSandboxViolations.getForCommandSince)
        .mockReturnValue([
          { description: 'process-exec /usr/local/bin/git', timestamp: new Date() },
        ]);

      const action = {
        requestID: 'r8',
        runReadFile: { filepath: 'test.txt' },
      } as unknown as WorkflowAction;
      const result = (await executor.execute(action, mockContext)) as PlainTextResponse;

      expect(result.error).toBe('Worker crashed');
      expect(mockSandboxViolations.getForCommandSince).not.toHaveBeenCalled();
    });

    it('sends cancel notification when abort signal fires', async () => {
      const abortController = new AbortController();
      mockContext = createFakePartial<WorkflowActionContext>({
        ...mockContext,
        abortSignal: abortController.signal,
      });

      // Make the execute request hang until we abort
      jest.mocked(mockConnection.sendRequest).mockImplementation(
        (method: string) =>
          new Promise((resolve) => {
            if (method === ExecuteActionRequest.methodName) {
              // Abort mid-flight
              abortController.abort();
              resolve({ response: 'done', error: '' });
            }
          }),
      );

      const action = {
        requestID: 'r4',
        runReadFile: { filepath: 'test.txt' },
      } as unknown as WorkflowAction;
      await executor.execute(action, mockContext);

      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        CancelActionNotification.methodName,
        { requestID: 'r4' },
      );
    });
  });

  describe('#dispose', () => {
    it('shuts down the worker manager', () => {
      executor.dispose();
      expect(mockWorkerManager.shutdown).toHaveBeenCalled();
    });
  });
});
