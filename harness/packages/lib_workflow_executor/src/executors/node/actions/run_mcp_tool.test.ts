import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { McpManagerWorkflowExecutorAdaptor as McpManager } from '@gitlab-org/ai-configuration';
import type { SandboxViolations } from '../../../violations/public';
import type { WorkflowAction } from '../clients/types';
import { RunMcpToolActionHandler, RunMcpToolAction } from './run_mcp_tool';
import type { WorkflowActionContext } from './index';

describe('RunMcpToolActionHandler', () => {
  let runMcpToolHandler: RunMcpToolActionHandler;
  let mockLogger: TestLogger;
  let mockMcpManager: jest.Mocked<McpManager>;
  let mockSandboxViolations: SandboxViolations;
  let workflowActionContext: WorkflowActionContext;
  let abortController: AbortController;
  const toolName = 'get_file';
  const toolArgs = '{"filename": "index.ts"}';

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockMcpManager = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<McpManager>;
    mockSandboxViolations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([]),
    });

    runMcpToolHandler = new RunMcpToolActionHandler(
      mockLogger,
      mockMcpManager,
      mockSandboxViolations,
    );

    abortController = new AbortController();

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: '/path/to/folder',
      abortSignal: abortController.signal,
    });
  });

  describe('canHandle', () => {
    it('returns true for runMCPTool actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      expect(runMcpToolHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(runMcpToolHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    it('calls mcpManager.execute with the correct arguments', async () => {
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      mockMcpManager.execute.mockResolvedValue('Tool execution result');

      const { response } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(response).toBe('Tool execution result');
      expect(mockMcpManager.execute).toHaveBeenCalledWith(toolName, toolArgs);
    });

    it('resolves with the result from mcpManager when execution succeeds', async () => {
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      const expectedOutput = 'Successful tool output';
      mockMcpManager.execute.mockResolvedValue(expectedOutput);

      const { response } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(response).toBe(expectedOutput);
    });

    it('rejects with error when mcpManager.execute fails', async () => {
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      const err = new Error('Tool execution failed');
      mockMcpManager.execute.mockRejectedValue(err);

      const { error } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(error).toBe(err.message);
    });

    it('rewrites the resolved tool-failure response as a sandbox violation when one lands in the window', async () => {
      // mcpManager.execute resolves with this prefix on tool failure, so the catch never fires.
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      mockMcpManager.execute.mockResolvedValue('The tool cannot be executed: EACCES 1.2.3.4:443');
      jest.mocked(mockSandboxViolations.getSince).mockReturnValue([
        {
          description: 'network deny tcp-connect 1.2.3.4:443',
          timestamp: new Date(),
        },
      ]);

      const { error, response } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(error).toBe('Operation is blocked by sandbox.');
      expect(response).toBe('');
      expect(mockSandboxViolations.getSince).toHaveBeenCalledWith(expect.any(Number));
    });

    it('uses the most recent violation when multiple land in the tool call window', async () => {
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      mockMcpManager.execute.mockResolvedValue('The tool cannot be executed: EACCES /tmp/late');
      jest.mocked(mockSandboxViolations.getSince).mockReturnValue([
        { description: 'file-read-data /tmp/early', timestamp: new Date(0) },
        { description: 'file-read-data /tmp/late', timestamp: new Date(1000) },
      ]);

      const { error } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(error).toBe('Operation is blocked by sandbox.');
    });

    it('passes a tool-failure response through when no violation landed', async () => {
      // Non-sandbox failures still surface as the original adapter-formatted string in response.
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      mockMcpManager.execute.mockResolvedValue('The tool cannot be executed: upstream timeout');
      jest.mocked(mockSandboxViolations.getSince).mockReturnValue([]);

      const { error, response } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(response).toBe('The tool cannot be executed: upstream timeout');
      expect(error).toBe('');
    });

    it('does not rewrite a successful tool response even if a violation incidentally landed', async () => {
      // Incidental violations during a successful call must not overwrite the real result.
      const action = createFakePartial<RunMcpToolAction>({
        runMCPTool: { name: toolName, args: toolArgs },
      });

      mockMcpManager.execute.mockResolvedValue('tool output');
      jest
        .mocked(mockSandboxViolations.getSince)
        .mockReturnValue([
          { description: 'file-read-data /private/var/select/sh', timestamp: new Date() },
        ]);

      const { response, error } = await runMcpToolHandler.execute(action, workflowActionContext);

      expect(response).toBe('tool output');
      expect(error).toBe('');
    });

    describe('when abortSignal is aborted', () => {
      it('throws and stops execution before calling mcpManager', async () => {
        const action = createFakePartial<RunMcpToolAction>({
          runMCPTool: { name: toolName, args: toolArgs },
        });

        abortController.abort();

        const { error, response } = await runMcpToolHandler.execute(action, workflowActionContext);

        expect(error).toBe('AbortError: This operation was aborted');
        expect(response).toBe('');
        expect(mockMcpManager.execute).not.toHaveBeenCalled();
      });
    });
  });
});
