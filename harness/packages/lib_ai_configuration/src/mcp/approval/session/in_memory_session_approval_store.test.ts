import type { ServerName, WorkflowId } from '../../types';
import { InMemoryMcpToolSessionApprovalStore } from './in_memory_session_approval_store';

describe('InMemoryMcpToolSessionApprovalStore', () => {
  const wfA = 'wf-A' as WorkflowId;
  const wfB = 'wf-B' as WorkflowId;
  const srv1 = 'server-1' as ServerName;
  const srv2 = 'server-2' as ServerName;

  const addr = (serverName: ServerName, toolName: string) => ({ serverName, toolName });

  let store: InMemoryMcpToolSessionApprovalStore;

  beforeEach(() => {
    store = new InMemoryMcpToolSessionApprovalStore();
  });

  describe('approveTool', () => {
    it('adds a tool approval for the workflow/server', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      expect(store.isToolApproved(wfA, addr(srv1, 't1'))).toBe(true);
    });

    it('keeps workflow approvals isolated', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      expect(store.isToolApproved(wfB, addr(srv1, 't1'))).toBe(false);
    });
  });

  describe('isToolApproved', () => {
    it('returns false when workflow/server/tool is missing', () => {
      expect(store.isToolApproved(wfA, addr(srv1, 'missing'))).toBe(false);
    });
  });

  describe('revokeTool', () => {
    it('removes a single tool approval', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      await store.revokeTool(wfA, addr(srv1, 't1'));
      expect(store.isToolApproved(wfA, addr(srv1, 't1'))).toBe(false);
    });

    it('cleans up empty server and workflow maps', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      await store.revokeTool(wfA, addr(srv1, 't1'));

      // Re-approve elsewhere to ensure internal maps are still valid
      await store.approveTool(wfA, addr(srv2, 'tX'));
      expect(store.isToolApproved(wfA, addr(srv2, 'tX'))).toBe(true);
    });

    it('is idempotent for non-existent approvals', async () => {
      await expect(store.revokeTool(wfA, addr(srv1, 'nope'))).resolves.toBeUndefined();
    });
  });

  describe('revokeToolsForWorkflow', () => {
    it('clears only the targeted workflow', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      await store.approveTool(wfB, addr(srv1, 't1'));

      await store.revokeToolsForWorkflow(wfA);

      expect(store.isToolApproved(wfA, addr(srv1, 't1'))).toBe(false);
      expect(store.isToolApproved(wfB, addr(srv1, 't1'))).toBe(true);
    });
  });

  describe('revokeToolsForServer', () => {
    it('clears the server across all workflows', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      await store.approveTool(wfB, addr(srv1, 't2'));
      await store.approveTool(wfB, addr(srv2, 't3'));

      await store.revokeToolsForServer(srv1);

      expect(store.isToolApproved(wfA, addr(srv1, 't1'))).toBe(false);
      expect(store.isToolApproved(wfB, addr(srv1, 't2'))).toBe(false);
      expect(store.isToolApproved(wfB, addr(srv2, 't3'))).toBe(true); // untouched
    });
  });

  describe('revokeToolsForServerInWorkflow', () => {
    it('clears the server only in the targeted workflow', async () => {
      await store.approveTool(wfA, addr(srv1, 't1'));
      await store.approveTool(wfA, addr(srv2, 't2'));
      await store.approveTool(wfB, addr(srv1, 't3'));

      await store.revokeToolsForServerInWorkflow(wfA, srv1);

      expect(store.isToolApproved(wfA, addr(srv1, 't1'))).toBe(false); // revoked
      expect(store.isToolApproved(wfA, addr(srv2, 't2'))).toBe(true); // untouched
      expect(store.isToolApproved(wfB, addr(srv1, 't3'))).toBe(true); // untouched
    });

    it('is idempotent for missing workflow/server', async () => {
      await expect(store.revokeToolsForServerInWorkflow(wfA, srv1)).resolves.toBeUndefined();
    });
  });
});
