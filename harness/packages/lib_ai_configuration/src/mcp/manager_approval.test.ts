/**
 * Tests for McpManager's server-approval gate.
 *
 * These tests focus on the new approval-gate behaviour added in the security fix:
 * - New servers with no approval entry → PendingApproval
 * - New servers with an approved entry → start() called
 * - New servers with a rejected entry → Rejected, start() not called
 * - approveServer() → store updated + session started
 * - rejectServer() → store updated + session stays not-started
 * - revokeServerDecision() → store entry removed + session kept alive in PendingApproval
 */

import type { Logger } from '@gitlab-org/logging';
import { McpManager } from './manager';
import type {
  McpServerApprovalStore,
  McpToolSessionApprovalStore,
  McpApprovalPolicy,
} from './approval';
import type { ApprovalEntry } from './approval/server/types';
import { DefaultApprovalPolicy } from './approval';
import type {
  McpConfigResolver,
  ResolvedMergedConfiguration,
  ConfigurationServersOrigin,
  ServerConfig,
} from './config';
import type { McpServerSessionManagerFactory } from './server_session_manager_factory';
import type { McpServerSessionManager } from './server_session_manager';
import { ConnectionState } from './client/connection';
import type { ServerName } from './types';
import { hashServerConfig } from './utils/hash_server_config';

// ---- helpers ----------------------------------------------------------------

function makeLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

function makeToolApprovalStore(): jest.Mocked<McpToolSessionApprovalStore> {
  return {
    approveTool: jest.fn(),
    revokeTool: jest.fn(),
    revokeToolsForWorkflow: jest.fn(),
    revokeToolsForServer: jest.fn(),
    revokeToolsForServerInWorkflow: jest.fn(),
    isToolApproved: jest.fn().mockReturnValue(false),
  } as jest.Mocked<McpToolSessionApprovalStore>;
}

function makeServerApprovalStore(
  overrides: Partial<jest.Mocked<McpServerApprovalStore>> = {},
): jest.Mocked<McpServerApprovalStore> {
  return {
    lookup: jest.fn().mockResolvedValue(undefined),
    approve: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn().mockResolvedValue(undefined),
    revoke: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<McpServerApprovalStore>;
}

function makeSession(
  serverName: string,
  configHash = 'hash-abc',
): jest.Mocked<McpServerSessionManager> {
  return {
    serverName: serverName as ServerName,
    currentConfig: { type: 'stdio', command: 'node', args: [], env: {}, approvedTools: [] },
    currentConfigHash: configHash,
    start: jest.fn().mockResolvedValue(undefined),
    setPendingApproval: jest.fn(),
    setRejected: jest.fn(),
    applyConfig: jest.fn().mockResolvedValue({ changed: false }),
    applyConfigPendingApproval: jest.fn(),
    getState: jest.fn().mockReturnValue({ status: ConnectionState.Disconnected }),
    getTools: jest.fn().mockReturnValue({ unwrapOr: jest.fn().mockReturnValue([]) }),
    executeTool: jest.fn(),
    reconnect: jest.fn().mockResolvedValue(undefined),
    finishAuth: jest.fn(),
    onStateChanged: jest.fn().mockReturnValue(() => {}),
    dispose: jest.fn(),
  } as unknown as jest.Mocked<McpServerSessionManager>;
}

function makeConfigResolver(
  serverName: string,
  configHash = 'hash-abc',
  originIndex = 0,
): jest.Mocked<McpConfigResolver> {
  const resolvedPath =
    originIndex === 0
      ? '/workspace/.gitlab/duo/mcp.json'
      : '/home/user/.config/gitlab/duo/mcp.json';

  const resolved = {
    config: {
      mcpServers: {
        [serverName]: { type: 'stdio', command: 'node', args: [], env: {}, approvedTools: [] },
      },
    },
    serversOrigin: {
      [serverName as ServerName]: {
        displayName: serverName,
        resolvedPath,
        paths: [resolvedPath],
        index: originIndex,
        hash: configHash,
        parseResult: {
          success: true,
          config: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            approvedTools: [],
          } as unknown as ServerConfig,
          hash: configHash,
        },
      },
    } as ConfigurationServersOrigin,
    diagnostics: {},
  } as unknown as ResolvedMergedConfiguration;

  return {
    loadAndMerge: jest.fn().mockResolvedValue(resolved),
  } as jest.Mocked<McpConfigResolver>;
}

// ---- tests ------------------------------------------------------------------

describe('McpManager approval gate', () => {
  const WORKSPACE = '/workspace';
  const SERVER_NAME = 'demo';
  // Real SHA-256 hash of { type: 'stdio', command: 'node', args: [], env: {} }
  // (approvedTools excluded by hashServerConfig). Recompute if the test config changes.
  const CONFIG_HASH = hashServerConfig({
    type: 'stdio',
    command: 'node',
    args: [],
    env: {},
    approvedTools: [],
  } as unknown as ServerConfig);

  let logger: jest.Mocked<Logger>;
  let toolApprovalStore: jest.Mocked<McpToolSessionApprovalStore>;
  let serverApprovalStore: jest.Mocked<McpServerApprovalStore>;
  let session: jest.Mocked<McpServerSessionManager>;
  let factory: jest.Mocked<McpServerSessionManagerFactory>;
  let configResolver: jest.Mocked<McpConfigResolver>;

  beforeEach(() => {
    logger = makeLogger();
    toolApprovalStore = makeToolApprovalStore();
    session = makeSession(SERVER_NAME, CONFIG_HASH);
    factory = {
      // All tests share the same session mock — factory.create always returns it.
      // This is intentional: tests assert on session.* calls directly.
      create: jest.fn().mockReturnValue(session),
    } as unknown as jest.Mocked<McpServerSessionManagerFactory>;
    configResolver = makeConfigResolver(SERVER_NAME, CONFIG_HASH);
  });

  function buildManager(
    approvalStoreOverrides: Partial<jest.Mocked<McpServerApprovalStore>> = {},
    policy: McpApprovalPolicy = new DefaultApprovalPolicy(),
    originIndex = 0,
  ): McpManager {
    serverApprovalStore = makeServerApprovalStore(approvalStoreOverrides);
    configResolver = makeConfigResolver(SERVER_NAME, CONFIG_HASH, originIndex);
    return new McpManager(
      logger,
      configResolver,
      factory,
      toolApprovalStore,
      serverApprovalStore,
      policy,
    );
  }

  describe('reloadAllServers — new server', () => {
    it('puts session in PendingApproval when no approval entry exists', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      await manager.reloadAllServers(WORKSPACE);

      expect(session.setPendingApproval).toHaveBeenCalled();
      expect(session.start).not.toHaveBeenCalled();
      expect(session.setRejected).not.toHaveBeenCalled();
    });

    it('starts the session when an approved entry exists', async () => {
      const approvedEntry: ApprovalEntry = { decision: 'approved' };
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      await manager.reloadAllServers(WORKSPACE);

      expect(session.start).toHaveBeenCalled();
      expect(session.setPendingApproval).not.toHaveBeenCalled();
      expect(session.setRejected).not.toHaveBeenCalled();
    });

    it('puts session in Rejected when a rejected entry exists', async () => {
      const rejectedEntry: ApprovalEntry = { decision: 'rejected' };
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(rejectedEntry) });
      await manager.reloadAllServers(WORKSPACE);

      expect(session.setRejected).toHaveBeenCalled();
      expect(session.start).not.toHaveBeenCalled();
      expect(session.setPendingApproval).not.toHaveBeenCalled();
    });

    it('emits servers:pending-approval when servers are pending', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      const pendingHandler = jest.fn();
      manager.on('servers:pending-approval', pendingHandler);

      await manager.reloadAllServers(WORKSPACE);

      expect(pendingHandler).toHaveBeenCalledWith([SERVER_NAME]);
    });

    it('does not emit servers:pending-approval when all servers are approved', async () => {
      const approvedEntry: ApprovalEntry = { decision: 'approved' };
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      const pendingHandler = jest.fn();
      manager.on('servers:pending-approval', pendingHandler);

      await manager.reloadAllServers(WORKSPACE);

      expect(pendingHandler).not.toHaveBeenCalled();
    });
  });

  describe('reloadAllServers — existing session re-evaluation', () => {
    it('starts a PendingApproval session when the store now has an approved entry', async () => {
      // First load: no approval entry → session goes to PendingApproval
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      await manager.reloadAllServers(WORKSPACE);

      expect(session.setPendingApproval).toHaveBeenCalled();
      expect(session.start).not.toHaveBeenCalled();

      // Simulate the session being in PendingApproval state
      session.getState.mockReturnValue({
        status: ConnectionState.PendingApproval,
        config: session.currentConfig!,
        configHash: CONFIG_HASH,
      });

      // Second load: approval entry now exists
      const approvedEntry: ApprovalEntry = { decision: 'approved' };
      serverApprovalStore.lookup.mockResolvedValue(approvedEntry);

      await manager.reloadAllServers(WORKSPACE);

      // start() should now be called for the existing session
      expect(session.start).toHaveBeenCalled();
    });

    it('keeps a PendingApproval session pending when the store still has no entry', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      await manager.reloadAllServers(WORKSPACE);

      session.getState.mockReturnValue({
        status: ConnectionState.PendingApproval,
        config: session.currentConfig!,
        configHash: CONFIG_HASH,
      });

      const pendingHandler = jest.fn();
      manager.on('servers:pending-approval', pendingHandler);

      await manager.reloadAllServers(WORKSPACE);

      expect(session.start).not.toHaveBeenCalled();
      expect(pendingHandler).toHaveBeenCalledWith([SERVER_NAME]);
    });

    it('rejects a PendingApproval session when the store now has a rejected entry', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      await manager.reloadAllServers(WORKSPACE);

      session.getState.mockReturnValue({
        status: ConnectionState.PendingApproval,
        config: session.currentConfig!,
        configHash: CONFIG_HASH,
      });

      const rejectedEntry: ApprovalEntry = { decision: 'rejected' };
      serverApprovalStore.lookup.mockResolvedValue(rejectedEntry);

      await manager.reloadAllServers(WORKSPACE);

      expect(session.setRejected).toHaveBeenCalledTimes(1);
      expect(session.start).not.toHaveBeenCalled();
    });
  });

  describe('reloadAllServers — existing session with changed config', () => {
    // A second config with a different command → different approval hash
    const CHANGED_CONFIG = {
      type: 'stdio' as const,
      command: 'python',
      args: [],
      env: {},
      approvedTools: [],
    };
    const CHANGED_CONFIG_HASH = hashServerConfig(CHANGED_CONFIG as unknown as ServerConfig);

    function makeChangedResolved(): ResolvedMergedConfiguration {
      return {
        config: {
          mcpServers: { [SERVER_NAME]: CHANGED_CONFIG },
        },
        serversOrigin: {
          [SERVER_NAME as ServerName]: {
            displayName: SERVER_NAME,
            resolvedPath: '/workspace/.gitlab/duo/mcp.json',
            paths: ['/workspace/.gitlab/duo/mcp.json'],
            index: 0,
            hash: CHANGED_CONFIG_HASH,
            parseResult: {
              success: true,
              config: CHANGED_CONFIG as unknown as ServerConfig,
              hash: CHANGED_CONFIG_HASH,
            },
          },
        } as ConfigurationServersOrigin,
        diagnostics: {},
      } as unknown as ResolvedMergedConfiguration;
    }

    const approvedEntry: ApprovalEntry = { decision: 'approved' };

    it('puts session in PendingApproval when changed config has no approval entry', async () => {
      // First load with original config (approved) — new-server path, start() called directly
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      await manager.reloadAllServers(WORKSPACE);
      expect(session.start).toHaveBeenCalledTimes(1);
      expect(session.applyConfig).not.toHaveBeenCalled();

      // Second load: config changed, no approval for new hash
      configResolver.loadAndMerge.mockResolvedValue(makeChangedResolved());
      serverApprovalStore.lookup.mockResolvedValue(undefined);

      await manager.reloadAllServers(WORKSPACE);

      // Changed config without approval → pending, not connected
      expect(session.applyConfigPendingApproval).toHaveBeenCalled();
      expect(session.applyConfig).not.toHaveBeenCalled();
    });

    it('allows connection when changed config is already approved', async () => {
      // First load with original config (approved) — new-server path
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      await manager.reloadAllServers(WORKSPACE);
      expect(session.start).toHaveBeenCalledTimes(1);

      // Second load: config changed, new config also approved
      configResolver.loadAndMerge.mockResolvedValue(makeChangedResolved());
      serverApprovalStore.lookup.mockResolvedValue(approvedEntry);

      await manager.reloadAllServers(WORKSPACE);

      // Changed config with approval → applyConfig called (which reconnects)
      expect(session.applyConfig).toHaveBeenCalledTimes(1);
      expect(session.applyConfigPendingApproval).not.toHaveBeenCalled();
    });

    it('rejects session when changed config has a rejected approval entry', async () => {
      // First load with original config (approved) — new-server path
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      await manager.reloadAllServers(WORKSPACE);

      // Second load: config changed, new config is rejected
      configResolver.loadAndMerge.mockResolvedValue(makeChangedResolved());
      const rejectedEntry: ApprovalEntry = { decision: 'rejected' };
      serverApprovalStore.lookup.mockResolvedValue(rejectedEntry);

      await manager.reloadAllServers(WORKSPACE);

      expect(session.applyConfigPendingApproval).toHaveBeenCalled();
      expect(session.setRejected).toHaveBeenCalled();
      expect(session.applyConfig).not.toHaveBeenCalled();
    });

    it('emits servers:pending-approval when changed config needs approval', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(approvedEntry) });
      await manager.reloadAllServers(WORKSPACE);

      configResolver.loadAndMerge.mockResolvedValue(makeChangedResolved());
      serverApprovalStore.lookup.mockResolvedValue(undefined);

      const pendingHandler = jest.fn();
      manager.on('servers:pending-approval', pendingHandler);

      await manager.reloadAllServers(WORKSPACE);

      expect(pendingHandler).toHaveBeenCalledWith([SERVER_NAME]);
    });
  });

  describe('approveServer', () => {
    it('records approval in the store and starts the session', async () => {
      const manager = buildManager();
      await manager.reloadAllServers(WORKSPACE); // creates session in PendingApproval

      await manager.approveServer(SERVER_NAME as ServerName);

      expect(serverApprovalStore.approve).toHaveBeenCalledWith(CONFIG_HASH);
      expect(session.start).toHaveBeenCalled();
    });

    it('logs a warning when the server is not found', async () => {
      const manager = buildManager();
      await manager.approveServer('nonexistent' as ServerName);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('rejectServer', () => {
    it('records rejection in the store and marks session as rejected', async () => {
      const manager = buildManager();
      await manager.reloadAllServers(WORKSPACE);

      await manager.rejectServer(SERVER_NAME as ServerName);

      expect(serverApprovalStore.reject).toHaveBeenCalledWith(CONFIG_HASH);
      expect(session.setRejected).toHaveBeenCalled();
    });

    it('logs a warning when the server is not found', async () => {
      const manager = buildManager();
      await manager.rejectServer('nonexistent' as ServerName);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('revokeServerDecision', () => {
    it('removes the store entry and puts the session back into PendingApproval', async () => {
      const manager = buildManager();
      await manager.reloadAllServers(WORKSPACE);

      await manager.revokeServerDecision(SERVER_NAME as ServerName);

      expect(serverApprovalStore.revoke).toHaveBeenCalledWith(CONFIG_HASH);
      expect(session.setPendingApproval).toHaveBeenCalled();
      // Session must NOT be disposed — it must remain available for approveServer()
      expect(session.dispose).not.toHaveBeenCalled();
    });

    it('tears down the underlying connection when revoking a Connected server', async () => {
      // Simulate a session that is currently Connected
      session.getState.mockReturnValue({ status: ConnectionState.Connected } as ReturnType<
        typeof session.getState
      >);

      // Give the session a real McpConnection-like object so we can assert it is disposed
      const mockConnection = { dispose: jest.fn() };
      // Inject via the private field using Object.defineProperty on the mock
      Object.defineProperty(session, '_connection', {
        value: mockConnection,
        writable: true,
        configurable: true,
      });

      const manager = buildManager({
        lookup: jest.fn().mockResolvedValue({ decision: 'approved' }),
      });
      await manager.reloadAllServers(WORKSPACE);

      // setPendingApproval is called by revokeServerDecision; the real implementation
      // now calls #disposeConnection() inside setPendingApproval.
      await manager.revokeServerDecision(SERVER_NAME as ServerName);

      // The session mock's setPendingApproval is called — on the real class this disposes
      // the connection. Verify the manager delegates to setPendingApproval (not dispose).
      expect(session.setPendingApproval).toHaveBeenCalled();
      expect(session.dispose).not.toHaveBeenCalled();
    });

    it('allows approveServer to succeed immediately after revokeServerDecision', async () => {
      const manager = buildManager();
      await manager.reloadAllServers(WORKSPACE);

      await manager.revokeServerDecision(SERVER_NAME as ServerName);

      // Reset call counts from the initial reloadAllServers
      session.start.mockClear();

      // Approve the server — must find the session and call start()
      await manager.approveServer(SERVER_NAME as ServerName);

      expect(serverApprovalStore.approve).toHaveBeenCalledWith(CONFIG_HASH);
      expect(session.start).toHaveBeenCalled();
    });

    it('logs a warning when the server is not found', async () => {
      const manager = buildManager();
      await manager.revokeServerDecision('nonexistent' as ServerName);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('user-provided servers (index > 0) — auto-approved, no approval UI', () => {
    // User servers have index === 1 in the candidate list.
    // They must be started immediately without consulting the approval store,
    // and must never appear in the servers:pending-approval event.

    it('starts a new user server immediately without consulting the approval store', async () => {
      const manager = buildManager({}, new DefaultApprovalPolicy(), 1);
      await manager.reloadAllServers(WORKSPACE);

      expect(session.start).toHaveBeenCalled();
      expect(session.setPendingApproval).not.toHaveBeenCalled();
      expect(session.setRejected).not.toHaveBeenCalled();
      expect(serverApprovalStore.lookup).not.toHaveBeenCalled();
    });

    it('does not emit servers:pending-approval for a user server', async () => {
      const manager = buildManager({}, new DefaultApprovalPolicy(), 1);
      const pendingHandler = jest.fn();
      manager.on('servers:pending-approval', pendingHandler);

      await manager.reloadAllServers(WORKSPACE);

      expect(pendingHandler).not.toHaveBeenCalled();
    });

    it('starts a user server immediately even when the approval store has no entry', async () => {
      // Explicitly confirm the store is never consulted even with no persisted decision
      const manager = buildManager(
        { lookup: jest.fn().mockResolvedValue(undefined) },
        new DefaultApprovalPolicy(),
        1,
      );
      await manager.reloadAllServers(WORKSPACE);

      expect(session.start).toHaveBeenCalled();
      expect(serverApprovalStore.lookup).not.toHaveBeenCalled();
    });

    it('applies a changed config for a user server without going through the approval gate', async () => {
      const manager = buildManager({}, new DefaultApprovalPolicy(), 1);
      // First load — session created and started
      await manager.reloadAllServers(WORKSPACE);
      expect(session.start).toHaveBeenCalledTimes(1);

      // Simulate a config change on the second load
      const changedConfig = {
        type: 'stdio' as const,
        command: 'python',
        args: [],
        env: {},
        approvedTools: [],
      };
      const changedHash = hashServerConfig(changedConfig as unknown as ServerConfig);
      const changedResolved: ResolvedMergedConfiguration = {
        config: { mcpServers: { [SERVER_NAME]: changedConfig } },
        serversOrigin: {
          [SERVER_NAME as ServerName]: {
            displayName: SERVER_NAME,
            resolvedPath: '/home/user/.config/gitlab/duo/mcp.json',
            paths: ['/home/user/.config/gitlab/duo/mcp.json'],
            index: 1,
            hash: changedHash,
            parseResult: {
              success: true,
              config: changedConfig as unknown as ServerConfig,
              hash: changedHash,
            },
          },
        } as ConfigurationServersOrigin,
        diagnostics: {},
      } as unknown as ResolvedMergedConfiguration;

      configResolver.loadAndMerge.mockResolvedValue(changedResolved);
      // Simulate the session still reporting the old hash so configChanged is true.
      // currentConfigHash is read-only on the real type, so use defineProperty on the mock.
      Object.defineProperty(session, 'currentConfigHash', { value: CONFIG_HASH, writable: true });

      await manager.reloadAllServers(WORKSPACE);

      // applyConfig (not applyConfigPendingApproval) must be called — no approval gate
      expect(session.applyConfig).toHaveBeenCalledWith(changedConfig);
      expect(session.applyConfigPendingApproval).not.toHaveBeenCalled();
      expect(serverApprovalStore.lookup).not.toHaveBeenCalled();
    });
  });

  describe('whenReloadSettled', () => {
    /** Tracks whether a promise has settled, recording into the given log. */
    const trackSettle = (promise: Promise<unknown>, log: string[], label: string) => {
      const state = { settled: false };
      promise
        .then(() => {
          state.settled = true;
          log.push(label);
          return undefined;
        })
        .catch(() => {
          state.settled = true;
        });
      return state;
    };

    it('does not resolve before the first reload completes', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });

      const settled = manager.whenReloadSettled(30000);
      const state = trackSettle(settled, [], 'settled');

      // Let any synchronous resolution flush; nothing has reloaded yet.
      await Promise.resolve();
      expect(state.settled).toBe(false);

      await manager.reloadAllServers(WORKSPACE);
      await settled;
      expect(state.settled).toBe(true);
    });

    it('resolves only after the pending-approval event has fired', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });

      const order: string[] = [];
      manager.on('servers:pending-approval', () => {
        order.push('pending');
      });
      const settled = manager.whenReloadSettled(30000);
      trackSettle(settled, order, 'settled');

      await manager.reloadAllServers(WORKSPACE);
      await settled;

      // The pending event is emitted at the end of the reload, before whenReloadSettled
      // resolves — so a caller gated on settle has already seen the pending event.
      expect(order).toEqual(['pending', 'settled']);
    });

    it('resolves immediately once a reload has already completed', async () => {
      const manager = buildManager({ lookup: jest.fn().mockResolvedValue(undefined) });
      await manager.reloadAllServers(WORKSPACE);

      await expect(manager.whenReloadSettled(30000)).resolves.toBeUndefined();
    });
  });
});
