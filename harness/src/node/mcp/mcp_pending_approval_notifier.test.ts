import { createFakePartial } from '@gitlab-org/test-utils';
import type { Logger } from '@gitlab-org/logging';
import { LsConnection } from '@gitlab-org/core';
import {
  McpManager,
  ConnectionState,
  type McpServerState,
  type ServerName,
} from '@gitlab-org/ai-configuration';
import { McpPendingApprovalNotifier } from './mcp_pending_approval_notifier';

// ---- helpers ----------------------------------------------------------------

type McpEventHandler = (...args: unknown[]) => void;

function makeLogger() {
  return createFakePartial<Logger>({ debug: jest.fn() });
}

function makeConnection() {
  return createFakePartial<LsConnection>({
    sendNotification: jest.fn().mockResolvedValue(undefined),
  });
}

function makeMcpManager(servers: McpServerState[] = []) {
  const handlers: Record<string, McpEventHandler[]> = {};

  const manager = createFakePartial<McpManager>({
    on: jest.fn().mockImplementation((event: string, handler: McpEventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    off: jest.fn().mockImplementation((event: string, handler: McpEventHandler) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    }),
    getServers: jest.fn().mockResolvedValue(servers),
  });

  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of handlers[event] ?? []) {
      handler(...args);
    }
  };

  const handlerCount = (event: string) => (handlers[event] ?? []).length;

  return { manager, emit, handlerCount };
}

function makeServerState(name: string, connectionState: ConnectionState): McpServerState {
  return createFakePartial<McpServerState>({
    name: name as ServerName,
    connectionState,
  });
}

// ---- tests ------------------------------------------------------------------

describe('McpPendingApprovalNotifier', () => {
  describe('servers:pending-approval', () => {
    let connection: ReturnType<typeof makeConnection>;
    let emit: ReturnType<typeof makeMcpManager>['emit'];

    beforeEach(() => {
      connection = makeConnection();
      const setup = makeMcpManager();
      emit = setup.emit;
      // eslint-disable-next-line no-new
      new McpPendingApprovalNotifier(makeLogger(), connection, setup.manager);
    });

    it('sends an LSP notification when servers are pending', async () => {
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(1);
      expect(connection.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ method: expect.stringContaining('mcp') }),
        expect.objectContaining({ count: 1, serverNames: ['serverA'] }),
      );
    });

    it('suppresses a duplicate notification for the same pending set', async () => {
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('sends a new notification when the pending set changes', async () => {
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      emit('servers:pending-approval', ['serverA', 'serverB'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('treats server names containing commas as distinct from split names', async () => {
      // ["a", "b,c"] and ["a,b", "c"] must NOT produce the same key
      emit('servers:pending-approval', ['a', 'b,c'] as ServerName[]);
      emit('servers:pending-approval', ['a,b', 'c'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('debounce reset via server:state-changed', () => {
    it('re-notifies for the same pending set after all servers leave PendingApproval', async () => {
      // After serverA is approved the pending set becomes empty.
      // On the next reload serverA needs approval again — the notification must fire.
      const connection = makeConnection();
      const { manager, emit } = makeMcpManager([
        makeServerState('serverA', ConnectionState.Connected),
      ]);
      // eslint-disable-next-line no-new
      new McpPendingApprovalNotifier(makeLogger(), connection, manager);

      // First pending notification
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();
      expect(connection.sendNotification).toHaveBeenCalledTimes(1);

      // serverA transitions to Connected — no pending servers remain
      emit('server:state-changed', 'serverA' as ServerName);
      // Wait for the async getServers() call inside #handleStateChanged
      await Promise.resolve();
      await Promise.resolve();

      // serverA needs approval again (e.g. config changed)
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();

      // Must fire a second time — debounce was reset
      expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('does not reset the debounce key while servers are still pending', async () => {
      const connection = makeConnection();
      const { manager, emit } = makeMcpManager([
        makeServerState('serverA', ConnectionState.PendingApproval),
        makeServerState('serverB', ConnectionState.Connected),
      ]);
      // eslint-disable-next-line no-new
      new McpPendingApprovalNotifier(makeLogger(), connection, manager);

      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();
      expect(connection.sendNotification).toHaveBeenCalledTimes(1);

      // serverB changes state but serverA is still pending
      emit('server:state-changed', 'serverB' as ServerName);
      await Promise.resolve();
      await Promise.resolve();

      // Same pending set — must still be suppressed
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('unsubscribes from both manager events', () => {
      const { manager, handlerCount } = makeMcpManager();
      const notifier = new McpPendingApprovalNotifier(makeLogger(), makeConnection(), manager);

      expect(handlerCount('servers:pending-approval')).toBe(1);
      expect(handlerCount('server:state-changed')).toBe(1);

      notifier.dispose();

      expect(handlerCount('servers:pending-approval')).toBe(0);
      expect(handlerCount('server:state-changed')).toBe(0);
    });
  });

  describe('sendNotification error handling', () => {
    it('logs at debug level when sendNotification rejects', async () => {
      const logger = makeLogger();
      const connection = createFakePartial<LsConnection>({
        sendNotification: jest.fn().mockRejectedValue(new Error('transport closed')),
      });
      const { manager, emit } = makeMcpManager();
      // eslint-disable-next-line no-new
      new McpPendingApprovalNotifier(logger, connection, manager);

      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send pending-approval notification'),
        expect.any(Error),
      );
    });

    it('retries for the same pending set after a failed send', async () => {
      const connection = createFakePartial<LsConnection>({
        sendNotification: jest
          .fn()
          .mockRejectedValueOnce(new Error('transport closed'))
          .mockResolvedValueOnce(undefined),
      });
      const { manager, emit } = makeMcpManager();
      // eslint-disable-next-line no-new
      new McpPendingApprovalNotifier(makeLogger(), connection, manager);

      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();
      await Promise.resolve();

      // Same pending set re-emitted: because the first send failed, the
      // debounce key was reset and the notification should be retried.
      emit('servers:pending-approval', ['serverA'] as ServerName[]);
      await Promise.resolve();

      expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    });
  });
});
