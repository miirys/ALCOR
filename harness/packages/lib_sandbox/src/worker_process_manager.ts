import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { createInterfaceId, Disposable, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { SandboxAvailabilityService } from './sandbox_availability_service';
import { SandboxConfigService } from './sandbox_config_service';
import type { SandboxConfig } from './sandbox_config_types';
import { SandboxProvider } from './providers/sandbox_provider';
import { shellQuote } from './shell_quote';
import { WorkerReadyNotification, WorkerShutdownNotification } from './worker_rpc';

// worker_main sets this flag on globalThis as a side effect of import; read here
// without importing worker_main so consumers shipping a separate sandbox_worker.js
// bundle don't accidentally opt into single-binary re-exec.
const EMBEDDED_WORKER_FLAG = Symbol.for('gitlab.lsp.embedded-sandbox-worker');
function isEmbeddedWorkerAvailable(): boolean {
  return (globalThis as Record<symbol, unknown>)[EMBEDDED_WORKER_FLAG] === true;
}

const CRASH_RESET_MS = 60_000; // 60s
const MAX_CRASH_COUNT = 3;
const WORKER_READY_TIMEOUT_MS = 30_000; // 30s

export interface WorkerProcessManager extends Disposable {
  ensureRunning(workspacePath: string): Promise<MessageConnection>;
  shutdown(): void;
  isRunning(): boolean;
  getSandboxedCommand(): string | null;
}

export const WorkerProcessManager = createInterfaceId<WorkerProcessManager>('WorkerProcessManager');

@Injectable(WorkerProcessManager, [
  Logger,
  SandboxAvailabilityService,
  SandboxConfigService,
  SecretRedactor,
  SandboxProvider,
])
export class DefaultWorkerProcessManager implements WorkerProcessManager {
  #logger: Logger;

  #sandboxAvailability: SandboxAvailabilityService;

  #sandboxConfig: SandboxConfigService;

  #secretRedactor: SecretRedactor;

  #provider: SandboxProvider;

  #process: ChildProcess | null = null;

  #connection: MessageConnection | null = null;

  #readyPromise: Promise<void> | null = null;

  #currentWorkspacePath: string | null = null;

  #sandboxedCommand: string | null = null;

  #crashCount = 0;

  #lastCrashTime = 0;

  constructor(
    logger: Logger,
    sandboxAvailability: SandboxAvailabilityService,
    sandboxConfig: SandboxConfigService,
    secretRedactor: SecretRedactor,
    provider: SandboxProvider,
  ) {
    this.#logger = withPrefix(logger, '[WorkerProcessManager]');
    this.#sandboxAvailability = sandboxAvailability;
    this.#sandboxConfig = sandboxConfig;
    this.#secretRedactor = secretRedactor;
    this.#provider = provider;
  }

  // TODO: #readyPromise is not workspace-scoped. Concurrent ensureRunning calls
  // with different workspaces could await readiness for the wrong workspace.
  // See https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/work_items/2172
  async ensureRunning(workspacePath: string): Promise<MessageConnection> {
    if (this.#connection && this.isRunning() && this.#currentWorkspacePath === workspacePath) {
      return this.#connection;
    }

    if (this.isRunning() && this.#currentWorkspacePath !== workspacePath) {
      this.#logger.info('Workspace changed, respawning worker');
      this.shutdown();
    }

    if (this.#readyPromise) {
      await this.#readyPromise;
      if (!this.#connection) {
        throw new Error('Worker failed to initialize');
      }
      return this.#connection;
    }

    this.#currentWorkspacePath = workspacePath;
    this.#readyPromise = this.#spawnWorker(workspacePath);
    try {
      await this.#readyPromise;
    } catch (error) {
      this.#readyPromise = null;
      throw error;
    }
    if (!this.#connection) {
      throw new Error('Worker failed to initialize');
    }
    return this.#connection;
  }

  shutdown(): void {
    if (this.#connection) {
      try {
        this.#connection.sendNotification(WorkerShutdownNotification.methodName).catch((error) => {
          this.#logger.debug('Failed to send shutdown notification', error);
        });
        this.#connection.dispose();
      } catch (error) {
        this.#logger.debug('Shutdown cleanup failed', error);
      }
    }
    if (this.#process && !this.#process.killed) {
      this.#process.kill('SIGTERM');
    }
    this.#connection = null;
    this.#process = null;
    this.#readyPromise = null;
    this.#currentWorkspacePath = null;
    this.#sandboxedCommand = null;
  }

  dispose(): void {
    this.shutdown();
  }

  isRunning(): boolean {
    return this.#process !== null && this.#process.exitCode === null;
  }

  getSandboxedCommand(): string | null {
    return this.#sandboxedCommand;
  }

  async #spawnWorker(workspacePath: string): Promise<void> {
    this.#checkCrashThreshold();

    const { command: baseCommand, args: baseArgs } = this.#resolveWorkerScript();
    const sandboxStatus = this.#sandboxAvailability.getStatus();

    let command: string;
    let args: string[];
    let useShell: boolean;

    if (sandboxStatus.available) {
      const config = this.#sandboxConfig.getEffectiveWorkspaceConfig(workspacePath);
      // Worker reads its own bundle (outside the workspace), so carve those dirs into allowRead.
      // Skip dirname()'s '.' (slash-less names) and '/' (top-level) to avoid overly broad entries.
      const workerScriptDirs = [baseCommand, ...baseArgs]
        .map(dirname)
        .filter((d) => d !== '' && d !== '.' && d !== '/');
      const policy: SandboxConfig = {
        ...config,
        filesystem: {
          ...config.filesystem,
          allowRead: [...(config.filesystem.allowRead ?? []), ...workerScriptDirs],
        },
      };

      const invocation = await this.#provider.wrapCommand(baseCommand, baseArgs, policy);
      // Diagnostic record of the worker command handed to the sandbox (read by getSandboxedCommand()).
      this.#sandboxedCommand = [baseCommand, ...baseArgs].map(shellQuote).join(' ');
      this.#logger.info('Spawning sandboxed worker');

      if (invocation.kind === 'shell') {
        command = invocation.command;
        args = [];
        useShell = true;
      } else {
        command = invocation.command;
        args = invocation.args;
        useShell = false;
      }
    } else {
      this.#logger.info(`Spawning unsandboxed worker (reason: ${sandboxStatus.reason})`);
      command = baseCommand;
      args = baseArgs;
      useShell = false;
    }

    const workerProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workspacePath,
      shell: useShell,
      env: { ...process.env, GITLAB_SANDBOX_WORKER: 'true' },
    });

    this.#process = workerProcess;

    if (!workerProcess.stdout || !workerProcess.stdin) {
      throw new Error('Failed to create worker process stdio');
    }

    // Capture stderr and forward to logger instead of inheriting the
    // parent's stderr, which would clobber the CLI's TUI rendering.
    // See: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2488
    const maxStderrLines = 200;
    const maxStderrBuffer = 1024 * 1024; // 1MB
    let stderrBuffer = '';
    workerProcess.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      if (stderrBuffer.length > maxStderrBuffer) {
        const allLines = stderrBuffer.split('\n');
        const truncated = allLines.slice(-maxStderrLines);
        this.#logger.warn(
          `[worker stderr] Buffer exceeded ${maxStderrBuffer} bytes, keeping last ${truncated.length} lines`,
        );
        for (const line of truncated) {
          if (line.trim()) {
            this.#logger.warn(
              `[worker stderr] ${this.#secretRedactor.redactSecrets(line, 'worker-stderr')}`,
            );
          }
        }
        stderrBuffer = '';
        return;
      }
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          this.#logger.warn(
            `[worker stderr] ${this.#secretRedactor.redactSecrets(line, 'worker-stderr')}`,
          );
        }
      }
    });
    workerProcess.on('exit', () => {
      if (stderrBuffer.trim()) {
        this.#logger.warn(
          `[worker stderr] ${this.#secretRedactor.redactSecrets(stderrBuffer, 'worker-stderr')}`,
        );
      }
    });

    const connection = createMessageConnection(
      new StreamMessageReader(workerProcess.stdout),
      new StreamMessageWriter(workerProcess.stdin),
    );

    this.#connection = connection;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.shutdown();
        reject(new Error('Worker failed to signal ready within timeout'));
      }, WORKER_READY_TIMEOUT_MS);

      const cleanup = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.shutdown();
        reject(error);
      };

      connection.onNotification(WorkerReadyNotification.methodName, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#logger.info('Worker ready');
        resolve();
      });

      workerProcess.on('error', (error) => {
        this.#logger.error('Worker process error', error);
        cleanup(error);
      });

      workerProcess.on('exit', (code, signal) => {
        this.#logger.info(`Worker exited: code=${code}, signal=${signal}`);
        this.#handleExit(code, signal);
        if (!settled) {
          cleanup(new Error(`Worker exited before ready: code=${code}, signal=${signal}`));
        }
      });

      connection.listen();
    });
  }

  #resolveWorkerScript(): { command: string; args: string[] } {
    // 1) Sibling JS bundle next to main script (npm / IDE-extension layout).
    //    Preferred over mode 2: Node/Electron re-exec'd with no args opens a REPL.
    const mainScript = require.main?.filename ?? process.argv[1];
    if (mainScript) {
      const bundledJs = join(dirname(mainScript), 'sandbox_worker.js');
      if (existsSync(bundledJs)) {
        return { command: process.execPath, args: [bundledJs] };
      }
    }

    // 2) Single-binary re-exec: GITLAB_SANDBOX_WORKER routes the child into
    //    worker_main before main() runs. Only safe for bun-compiled binaries
    //    (gated by the embedded-worker flag).
    if (isEmbeddedWorkerAvailable()) {
      return { command: process.execPath, args: [] };
    }

    // 3) Source resolution (tests / `tsx`-based dev runs). Built dynamically
    //    to prevent `bun build --compile` from trying to resolve it statically.
    const workerModule = ['./worker', 'worker_main'].join('/');
    return { command: process.execPath, args: [require.resolve(workerModule)] };
  }

  #handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    try {
      this.#connection?.dispose();
    } catch {
      // Connection may already be disposed.
    }
    this.#connection = null;
    this.#process = null;
    this.#readyPromise = null;
    this.#sandboxedCommand = null;

    if (code !== 0 && signal !== 'SIGTERM') {
      this.#recordCrash();
    }
  }

  #recordCrash(): void {
    const now = Date.now();
    if (now - this.#lastCrashTime > CRASH_RESET_MS) {
      this.#crashCount = 0;
    }
    this.#crashCount++;
    this.#lastCrashTime = now;
    this.#logger.warn(`Worker crash recorded (${this.#crashCount}/${MAX_CRASH_COUNT})`);
  }

  #checkCrashThreshold(): void {
    if (this.#crashCount >= MAX_CRASH_COUNT) {
      throw new Error(
        `Worker crashed ${MAX_CRASH_COUNT} times within ${CRASH_RESET_MS}ms. Refusing to restart.`,
      );
    }
  }
}
