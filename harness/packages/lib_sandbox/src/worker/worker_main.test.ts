import { createFakePartial } from '@gitlab-org/test-utils';
import { DirectActionExecutor } from '@gitlab-org/workflow-executor';
import type { MessageConnection } from 'vscode-jsonrpc/node';
import {
  ExecuteActionRequest,
  CancelActionNotification,
  WorkerReadyNotification,
  WorkerShutdownNotification,
  type WorkerActionRequest,
} from '../worker_rpc';
import { setupWorkerRpc } from './worker_main';

describe('setupWorkerRpc', () => {
  let mockConnection: MessageConnection;
  let requestHandlers: Map<string, Function>;
  let notificationHandlers: Map<string, Function>;

  beforeEach(() => {
    requestHandlers = new Map();
    notificationHandlers = new Map();

    mockConnection = createFakePartial<MessageConnection>({
      onRequest: jest.fn().mockImplementation((method: string, handler: Function) => {
        requestHandlers.set(method, handler);
      }),
      onNotification: jest.fn().mockImplementation((method: string, handler: Function) => {
        notificationHandlers.set(method, handler);
      }),
      sendNotification: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn(),
      dispose: jest.fn(),
    });
  });

  it('sends WorkerReadyNotification after setup', () => {
    setupWorkerRpc(mockConnection);

    expect(mockConnection.sendNotification).toHaveBeenCalledWith(
      WorkerReadyNotification.methodName,
    );
  });

  it('registers ExecuteActionRequest handler', () => {
    setupWorkerRpc(mockConnection);
    expect(requestHandlers.has(ExecuteActionRequest.methodName)).toBe(true);
  });

  it('registers CancelActionNotification handler', () => {
    setupWorkerRpc(mockConnection);
    expect(notificationHandlers.has(CancelActionNotification.methodName)).toBe(true);
  });

  it('registers WorkerShutdownNotification handler', () => {
    setupWorkerRpc(mockConnection);
    expect(notificationHandlers.has(WorkerShutdownNotification.methodName)).toBe(true);
  });

  it('calls listen before sending ready notification', () => {
    setupWorkerRpc(mockConnection);

    // listen should be called before sendNotification
    const listenOrder = (mockConnection.listen as jest.Mock).mock.invocationCallOrder[0];
    const sendOrder = (mockConnection.sendNotification as jest.Mock).mock.invocationCallOrder[0];
    expect(listenOrder).toBeLessThan(sendOrder);
  });

  describe('ExecuteActionRequest handler', () => {
    it('dispatches action and returns result', async () => {
      setupWorkerRpc(mockConnection);

      const handler = requestHandlers.get(ExecuteActionRequest.methodName)!;
      const request: WorkerActionRequest = {
        action: {
          requestID: 'r1',
          runReadFile: { filepath: 'test.txt' },
        } as unknown as Record<string, unknown>,
        context: {
          workspaceFolderPath: '/workspace',
          workflowId: 'wf-1',
          gitlabBaseUrl: 'https://gitlab.example.com',
          gitlabToken: 'token-123',
        },
      };

      const result = await handler(request);
      // The handler should return an object with error property
      // (the actual result depends on handler execution — in test env,
      // the ReadFileActionHandler will fail to read the file, but it
      // should return gracefully with an error message)
      expect(result).toHaveProperty('error');
    });

    it('derives workspaceFolderUri from workspaceFolderPath in the action context', async () => {
      const executeSpy = jest
        .spyOn(DirectActionExecutor.prototype, 'execute')
        .mockResolvedValueOnce({ response: 'ok', error: '' });

      setupWorkerRpc(mockConnection);
      const handler = requestHandlers.get(ExecuteActionRequest.methodName)!;

      const request: WorkerActionRequest = {
        action: {
          requestID: 'r-uri',
          runReadFile: { filepath: 'test.txt' },
        } as unknown as Record<string, unknown>,
        context: {
          workspaceFolderPath: '/Users/test/projects/LSP',
          workflowId: 'wf-1',
          gitlabBaseUrl: 'https://gitlab.example.com',
          gitlabToken: 'token-123',
        },
      };

      await handler(request);

      expect(executeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workspaceFolderPath: '/Users/test/projects/LSP',
          workspaceFolderUri: 'file:///Users/test/projects/LSP',
        }),
      );
    });

    it('returns error response when execution fails', async () => {
      setupWorkerRpc(mockConnection);

      const handler = requestHandlers.get(ExecuteActionRequest.methodName)!;
      // Action with no matching handler key
      const request: WorkerActionRequest = {
        action: {
          requestID: 'r2',
        } as unknown as Record<string, unknown>,
        context: {
          workspaceFolderPath: '/workspace',
          workflowId: 'wf-1',
          gitlabBaseUrl: 'https://gitlab.example.com',
          gitlabToken: 'token-123',
        },
      };

      const result = await handler(request);
      expect(result).toEqual(expect.objectContaining({ error: expect.any(String), response: '' }));
    });
  });

  describe('CancelActionNotification', () => {
    it('aborts in-flight action by requestID', async () => {
      setupWorkerRpc(mockConnection);

      const executeHandler = requestHandlers.get(ExecuteActionRequest.methodName)!;
      const cancelHandler = notificationHandlers.get(CancelActionNotification.methodName)!;

      // Start a long-running action
      const request: WorkerActionRequest = {
        action: {
          requestID: 'r-cancel',
          runCommand: { program: 'sleep', flags: [], arguments: ['60'] },
        } as unknown as Record<string, unknown>,
        context: {
          workspaceFolderPath: '/tmp',
          workflowId: 'wf-1',
          gitlabBaseUrl: 'https://gitlab.example.com',
          gitlabToken: 'token-123',
        },
      };

      const executePromise = executeHandler(request);

      // Give a moment for command to start, then cancel
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
      cancelHandler({ requestID: 'r-cancel' });

      const result = await executePromise;
      expect(result).toBeDefined();
    }, 10000);
  });
});
