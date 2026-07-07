import { createFakePartial } from '@gitlab-org/test-utils';
import { Logger } from '@gitlab-org/logging';
import { PlainTextResponse } from '@gitlab-org/duo-workflow-service';
import { DirectActionExecutor } from './direct_action_executor';
import { WorkflowActionHandler, WorkflowActionContext } from './node/actions';
import { WorkflowAction } from './node/clients/types';

function mockCanHandle(returnValue: boolean): (action: WorkflowAction) => action is WorkflowAction {
  return jest.fn().mockReturnValue(returnValue) as unknown as (
    action: WorkflowAction,
  ) => action is WorkflowAction;
}

describe('DirectActionExecutor', () => {
  let mockLogger: Logger;
  let mockHandlers: WorkflowActionHandler[];
  let mockContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = createFakePartial<Logger>({
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    });

    mockContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: '/home/alex/project',
      workflowId: 'test-workflow',
      abortSignal: new AbortController().signal,
    });
  });

  describe('#execute', () => {
    it('dispatches to the matching handler', async () => {
      const expectedResult: PlainTextResponse = { response: 'file content', error: '' };
      const handler = createFakePartial<WorkflowActionHandler>({
        name: 'readFile',
        canHandle: mockCanHandle(true),
        execute: jest.fn().mockResolvedValue(expectedResult),
      });
      mockHandlers = [handler];

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runReadFile: { filepath: 'test.txt' } } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(handler.execute).toHaveBeenCalledWith(action, mockContext);
      expect(result).toEqual(expectedResult);
    });

    it('returns "action not supported" when no handler matches', async () => {
      const handler = createFakePartial<WorkflowActionHandler>({
        name: 'readFile',
        canHandle: mockCanHandle(false),
        execute: jest.fn(),
      });
      mockHandlers = [handler];

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { unknownAction: {} } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(result).toEqual({ error: 'action not supported', response: '' });
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it('selects the first matching handler when multiple match', async () => {
      const firstResult: PlainTextResponse = { response: 'first', error: '' };
      const firstHandler = createFakePartial<WorkflowActionHandler>({
        name: 'first',
        canHandle: mockCanHandle(true),
        execute: jest.fn().mockResolvedValue(firstResult),
      });
      const secondHandler = createFakePartial<WorkflowActionHandler>({
        name: 'second',
        canHandle: mockCanHandle(true),
        execute: jest.fn(),
      });
      mockHandlers = [firstHandler, secondHandler];

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runReadFile: { filepath: 'test.txt' } } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(result).toEqual(firstResult);
      expect(secondHandler.execute).not.toHaveBeenCalled();
    });

    it('handles empty handler list', async () => {
      mockHandlers = [];

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runReadFile: { filepath: 'test.txt' } } as unknown as WorkflowAction;
      const result = await executor.execute(action, mockContext);

      expect(result).toEqual({ error: 'action not supported', response: '' });
    });

    it('rejects handler with supportsVirtualWorkspace=false on virtual URI', async () => {
      const handler = createFakePartial<WorkflowActionHandler>({
        name: 'run_git_command',
        supportsVirtualWorkspace: false,
        canHandle: mockCanHandle(true),
        execute: jest.fn(),
      });
      mockHandlers = [handler];

      const virtualContext = createFakePartial<WorkflowActionContext>({
        ...mockContext,
        workspaceFolderUri: 'adt://server/sap/bc/adt/packages/zmy_package',
      });

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runGitCommand: {} } as unknown as WorkflowAction;
      const result = await executor.execute(action, virtualContext);

      expect(result).toEqual({
        error: 'run_git_command is not available for virtual filesystem workspaces.',
        response: '',
      });
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it('allows handler with supportsVirtualWorkspace=false on file:// URI', async () => {
      const expectedResult: PlainTextResponse = { response: 'ok', error: '' };
      const handler = createFakePartial<WorkflowActionHandler>({
        name: 'run_git_command',
        supportsVirtualWorkspace: false,
        canHandle: mockCanHandle(true),
        execute: jest.fn().mockResolvedValue(expectedResult),
      });
      mockHandlers = [handler];

      const fileContext = createFakePartial<WorkflowActionContext>({
        ...mockContext,
        workspaceFolderUri: 'file:///home/alex/project',
      });

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runGitCommand: {} } as unknown as WorkflowAction;
      const result = await executor.execute(action, fileContext);

      expect(result).toEqual(expectedResult);
      expect(handler.execute).toHaveBeenCalled();
    });

    it('allows handler without supportsVirtualWorkspace on virtual URI', async () => {
      const expectedResult: PlainTextResponse = { response: 'content', error: '' };
      const handler = createFakePartial<WorkflowActionHandler>({
        name: 'read_file',
        canHandle: mockCanHandle(true),
        execute: jest.fn().mockResolvedValue(expectedResult),
      });
      mockHandlers = [handler];

      const virtualContext = createFakePartial<WorkflowActionContext>({
        ...mockContext,
        workspaceFolderUri: 'adt://server/sap/bc/adt/packages/zmy_package',
      });

      const executor = new DirectActionExecutor(mockHandlers, mockLogger);
      const action = { runReadFile: { filepath: 'test.txt' } } as unknown as WorkflowAction;
      const result = await executor.execute(action, virtualContext);

      expect(result).toEqual(expectedResult);
      expect(handler.execute).toHaveBeenCalled();
    });
  });

  describe('#dispose', () => {
    it('does not throw', () => {
      const executor = new DirectActionExecutor([], mockLogger);
      expect(() => executor.dispose()).not.toThrow();
    });
  });
});
