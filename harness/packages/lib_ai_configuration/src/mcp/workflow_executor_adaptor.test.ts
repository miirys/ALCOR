import { Logger } from '@gitlab-org/logging';
import { McpManagerWorkflowExecutorAdaptor } from './workflow_executor_adaptor';
import { McpManager } from './manager';

describe('McpManagerWorkflowExecutorAdaptor', () => {
  let adaptor: McpManagerWorkflowExecutorAdaptor;
  let mockLogger: jest.Mocked<Logger>;
  let mockManager: jest.Mocked<McpManager>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    mockManager = {
      reloadAllServers: jest.fn().mockResolvedValue(undefined),
      waitForAllServersSettled: jest.fn().mockResolvedValue(undefined),
      getTools: jest.fn().mockResolvedValue([{ name: 'test-tool', serverName: 'test-server' }]),
      executeTool: jest.fn().mockResolvedValue('result'),
    } as unknown as jest.Mocked<McpManager>;

    adaptor = new McpManagerWorkflowExecutorAdaptor(mockLogger, mockManager);
  });

  describe('reload', () => {
    it('returns empty array and logs warning on error', async () => {
      mockManager.reloadAllServers.mockRejectedValue(new Error('Connection failed'));

      const tools = await adaptor.reload('/workspace');

      expect(tools).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[MCP] Error during reload: Error: Connection failed',
      );
    });
  });

  describe('preWarm', () => {
    it('calls reloadAllServers with the workspace path', () => {
      adaptor.preWarm('/workspace');

      expect(mockManager.reloadAllServers).toHaveBeenCalledWith('/workspace');
    });

    it('does not await — returns synchronously', () => {
      // reloadAllServers never resolves in this test; preWarm must still return immediately
      mockManager.reloadAllServers.mockReturnValue(new Promise(() => {}));

      expect(() => adaptor.preWarm('/workspace')).not.toThrow();
    });

    it('logs a warning when reloadAllServers rejects', async () => {
      mockManager.reloadAllServers.mockRejectedValue(new Error('boom'));

      adaptor.preWarm('/workspace');

      // flush the microtask queue so the .catch() handler runs
      await Promise.resolve();

      expect(mockLogger.warn).toHaveBeenCalledWith('[MCP] Pre-warm failed: Error: boom');
    });
  });

  describe('execute', () => {
    it('executes tool with parsed arguments', async () => {
      mockManager.executeTool.mockResolvedValue('execution result');

      const result = await adaptor.execute('test-tool', '{"arg1": "value1"}');

      expect(result).toBe('execution result');
      expect(mockManager.executeTool).toHaveBeenCalledWith('test-tool', { arg1: 'value1' });
    });

    it('returns error message on execution failure', async () => {
      mockManager.executeTool.mockRejectedValue(new Error('Tool failed'));

      const result = await adaptor.execute('test-tool', '{}');

      expect(result).toBe('The tool cannot be executed: Error: Tool failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('returns error message on invalid JSON', async () => {
      const result = await adaptor.execute('test-tool', 'invalid json');

      expect(result).toContain('The tool cannot be executed:');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
