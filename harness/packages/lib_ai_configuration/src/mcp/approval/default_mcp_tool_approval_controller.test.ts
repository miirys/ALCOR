import { McpToolName, ServerName, WorkflowId } from '../types';
import { DefaultMcpToolApprovalController } from './default_mcp_tool_approval_controller';
import type { McpToolSessionApprovalStore } from './session';

describe('DefaultMcpToolApprovalController', () => {
  let store: jest.Mocked<McpToolSessionApprovalStore>;

  beforeEach(() => {
    store = {
      approveTool: jest.fn(async () => {}),
      revokeTool: jest.fn(),
      revokeToolsForWorkflow: jest.fn(),
      revokeToolsForServer: jest.fn(),
      revokeToolsForServerInWorkflow: jest.fn(),
      isToolApproved: jest.fn(() => false),
    } as unknown as jest.Mocked<McpToolSessionApprovalStore>;
  });

  describe('approveToolForSession', () => {
    it('parses McpToolName using the last underscore and delegates to store', async () => {
      const ctrl = new DefaultMcpToolApprovalController(store);
      const toolName = McpToolName.create({
        serverName: 'library_docs' as ServerName,
        toolName: 'tool2',
      });
      const wf = 'wf-123' as WorkflowId;

      await ctrl.approveToolForSession(wf, toolName);

      expect(store.approveTool).toHaveBeenCalledTimes(1);
      const [workflowId, address] = store.approveTool.mock.calls[0];
      expect(workflowId).toBe(wf);
      expect(address.serverName).toBe('library_docs' as ServerName);
      expect(address.toolName).toBe('tool2');
    });
  });
});
