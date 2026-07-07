import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createMessageConnection } from 'vscode-jsonrpc/node';
import { Logger } from '@gitlab-org/logging';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import { SandboxAvailabilityService } from './sandbox_availability_service';
import { SandboxConfigService } from './sandbox_config_service';
import { WorkerReadyNotification, WorkerShutdownNotification } from './worker_rpc';
import { DefaultWorkerProcessManager } from './worker_process_manager';
import type { SandboxProvider } from './providers/sandbox_provider';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('vscode-jsonrpc/node', () => ({
  createMessageConnection: jest.fn(),
  StreamMessageReader: jest.fn(),
  StreamMessageWriter: jest.fn(),
}));

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    wrapWithSandbox: jest.fn().mockImplementation((cmd: string) => Promise.resolve(cmd)),
  },
}));

const mockSpawn = jest.mocked(spawn);
const mockCreateMessageConnection = jest.mocked(createMessageConnection);

function createMockProcess(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: jest.Mock };
  killed: boolean;
  exitCode: number | null;
  kill: jest.Mock;
} {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: jest.fn() },
    killed: false,
    exitCode: null as number | null,
    kill: jest.fn().mockImplementation(function (this: { killed: boolean }) {
      this.killed = true;
    }),
  });
  return proc;
}

function createMockConnection() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    notificationHandlers: handlers,
    onNotification: jest.fn().mockImplementation((method: string, handler: () => void) => {
      handlers.set(method, handler);
    }),
    sendNotification: jest.fn().mockResolvedValue(undefined),
    listen: jest.fn(),
    dispose: jest.fn(),
  };
}

const EMBEDDED_WORKER_FLAG = Symbol.for('gitlab.lsp.embedded-sandbox-worker');

describe('DefaultWorkerProcessManager', () => {
  let mockLogger: Logger;
  let mockSandboxAvailability: SandboxAvailabilityService;
  let mockSandboxConfig: SandboxConfigService;
  let mockSecretRedactor: SecretRedactor;
  let mockProvider: { id: string; wrapCommand: jest.Mock };
  let mockProcess: ReturnType<typeof createMockProcess>;
  let mockConnection: ReturnType<typeof createMockConnection>;

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[EMBEDDED_WORKER_FLAG];
  });

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    mockSandboxAvailability = {
      getStatus: jest.fn().mockReturnValue({
        available: true,
        platform: 'macos',
        provider: 'anthropic-sandbox-runtime',
        providerVersion: '0.0.39',
      }),
      refresh: jest.fn(),
      onStatusChanged: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    };

    mockSandboxConfig = {
      getEffectiveWorkspaceConfig: jest.fn().mockReturnValue({
        provider: 'anthropic-sandbox-runtime',
        filesystem: {
          allowRead: ['/preexisting'],
          denyRead: ['~/.ssh/'],
          allowWrite: ['.', '/tmp'],
          denyWrite: ['.git/hooks/'],
        },
        network: {
          allowedDomains: ['gitlab.example.com'],
          deniedDomains: [],
        },
      }),
      getMcpServerConfig: jest.fn(),
      refresh: jest.fn(),
      dispose: jest.fn(),
    };

    mockSecretRedactor = {
      redactSecrets: jest.fn().mockImplementation((raw: string) => raw),
      redactSecretsWithRanges: jest.fn(),
      transform: jest.fn(),
    } as unknown as SecretRedactor;

    mockProvider = {
      id: 'anthropic-sandbox-runtime',
      wrapCommand: jest.fn().mockResolvedValue({ kind: 'shell', command: 'wrapped-cmd' }),
    };

    mockProcess = createMockProcess();
    mockConnection = createMockConnection();

    mockSpawn.mockReturnValue(mockProcess as never);
    mockCreateMessageConnection.mockReturnValue(mockConnection as never);
  });

  function createManager(): DefaultWorkerProcessManager {
    return new DefaultWorkerProcessManager(
      mockLogger,
      mockSandboxAvailability,
      mockSandboxConfig,
      mockSecretRedactor,
      mockProvider as unknown as SandboxProvider,
    );
  }

  /** Simulate worker signalling ready after spawn. */
  function signalWorkerReady(): void {
    setImmediate(() => {
      const handler = mockConnection.notificationHandlers.get(WorkerReadyNotification.methodName);
      handler?.();
    });
  }

  describe('constructor', () => {
    it('creates without throwing', () => {
      expect(() => createManager()).not.toThrow();
    });
  });

  describe('#isRunning', () => {
    it('returns false before any spawn', () => {
      expect(createManager().isRunning()).toBe(false);
    });
  });

  describe('#shutdown', () => {
    it('does not throw when no worker is running', () => {
      expect(() => createManager().shutdown()).not.toThrow();
    });

    it('sends shutdown notification, disposes connection, and kills the process', async () => {
      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      manager.shutdown();

      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        WorkerShutdownNotification.methodName,
      );
      expect(mockConnection.dispose).toHaveBeenCalled();
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('#dispose', () => {
    it('calls shutdown', async () => {
      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      manager.dispose();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('#ensureRunning', () => {
    it('spawns a worker and returns a connection after ready signal', async () => {
      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      const connection = await promise;

      expect(mockSpawn).toHaveBeenCalled();
      expect(connection).toBe(mockConnection);
      expect(manager.isRunning()).toBe(true);
    });

    it('wraps via the provider and spawns a shell invocation when sandboxed', async () => {
      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      // Worker-script dirs are added on top of pre-existing allowRead before reaching the provider.
      const policyArg = mockProvider.wrapCommand.mock.calls[0][2];
      expect(policyArg.filesystem.allowRead).toContain('/preexisting');
      expect(policyArg.filesystem.allowRead.length).toBeGreaterThan(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        'wrapped-cmd',
        [],
        expect.objectContaining({ shell: true }),
      );
      // getSandboxedCommand() records the quoted worker command for diagnostics.
      const sandboxed = manager.getSandboxedCommand();
      expect(sandboxed).toContain(process.execPath);
      expect(sandboxed).toMatch(/^'/);
    });

    it('spawns an argv invocation without a shell', async () => {
      mockProvider.wrapCommand.mockResolvedValue({
        kind: 'argv',
        command: 'nono',
        args: ['run', '--', 'cmd'],
      });

      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'nono',
        ['run', '--', 'cmd'],
        expect.objectContaining({ shell: false }),
      );
    });

    it('returns the same connection on subsequent calls with the same workspace', async () => {
      const manager = createManager();
      const promise1 = manager.ensureRunning('/workspace');
      signalWorkerReady();
      const conn1 = await promise1;
      const conn2 = await manager.ensureRunning('/workspace');

      expect(conn1).toBe(conn2);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('respawns when workspace changes', async () => {
      const manager = createManager();
      const promise1 = manager.ensureRunning('/workspace-a');
      signalWorkerReady();
      await promise1;

      // Reset mocks for the second spawn
      mockProcess = createMockProcess();
      mockConnection = createMockConnection();
      mockSpawn.mockReturnValue(mockProcess as never);
      mockCreateMessageConnection.mockReturnValue(mockConnection as never);

      const promise2 = manager.ensureRunning('/workspace-b');
      signalWorkerReady();
      await promise2;

      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('spawns unsandboxed when sandbox is unavailable', async () => {
      jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue({
        available: false,
        platform: 'linux',
        reason: 'missing_dependencies',
        missingDependencies: [],
      });

      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining([expect.any(String)]),
        expect.objectContaining({ shell: false }),
      );
    });
  });

  describe('worker script resolution', () => {
    it('re-execs process.execPath with no script arg when embedded worker flag is set', async () => {
      (globalThis as Record<symbol, unknown>)[EMBEDDED_WORKER_FLAG] = true;
      jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue({
        available: false,
        platform: 'linux',
        reason: 'missing_dependencies',
        missingDependencies: [],
      });

      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        [],
        expect.objectContaining({ shell: false }),
      );
    });

    it('passes worker_main path as arg when embedded worker flag is not set', async () => {
      jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue({
        available: false,
        platform: 'linux',
        reason: 'missing_dependencies',
        missingDependencies: [],
      });

      const manager = createManager();
      const promise = manager.ensureRunning('/workspace');
      signalWorkerReady();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining([expect.stringContaining('worker_main')]),
        expect.objectContaining({ shell: false }),
      );
    });
  });

  describe('crash tracking', () => {
    it('refuses to restart after reaching max crash count', async () => {
      const manager = createManager();

      for (let i = 0; i < 3; i++) {
        mockProcess = createMockProcess();
        mockConnection = createMockConnection();
        mockSpawn.mockReturnValue(mockProcess as never);
        mockCreateMessageConnection.mockReturnValue(mockConnection as never);

        const promise = manager.ensureRunning('/workspace');
        signalWorkerReady();
        // eslint-disable-next-line no-await-in-loop
        await promise;

        // Simulate crash (non-zero exit, not SIGTERM)
        mockProcess.emit('exit', 1, null);
      }

      // Fourth attempt should throw
      await expect(manager.ensureRunning('/workspace')).rejects.toThrow(/crashed 3 times/);
    });
  });
});
