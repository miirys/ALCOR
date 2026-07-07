import { spawn } from 'child_process';
import {
  createInterfaceId,
  Disposable,
  Implements,
  Service,
  ServiceLifetime,
} from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { HookResult } from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
const SIGKILL_DELAY_MS = 5_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB per stream

// Sensitive variables that should not leak to hook processes
const EXCLUDED_ENV_VARS = [
  'CI_JOB_TOKEN',
  'GITLAB_OAUTH_TOKEN',
  'GITLAB_TOKEN',
  'DUO_WORKFLOW_SERVICE_TOKEN',
];

export interface HookExecutor {
  executeHook(
    command: string,
    stdinJson: string,
    envVars: Record<string, string>,
    timeout: number | undefined,
    cwd: string,
  ): Promise<HookResult>;
}

export const HookExecutor = createInterfaceId<HookExecutor>('HookExecutor');

@Implements(HookExecutor)
@Service({ dependencies: [Logger], lifetime: ServiceLifetime.Singleton })
export class DefaultHookExecutor implements HookExecutor, Disposable {
  #logger: Logger;

  #activeProcessGroups = new Set<number>();

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[HookExecutor]');
  }

  dispose(): void {
    for (const pid of this.#activeProcessGroups) {
      this.#killProcessGroup(pid);
    }
    this.#activeProcessGroups.clear();
  }

  async executeHook(
    command: string,
    stdinJson: string,
    envVars: Record<string, string>,
    timeout: number | undefined,
    cwd: string,
  ): Promise<HookResult> {
    const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

    return new Promise<HookResult>((resolve) => {
      let timedOut = false;
      let stdoutData = '';
      let stderrData = '';

      try {
        const child = spawn(command, [], {
          env: { ...this.#createFilteredEnv(), ...envVars },
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd,
          shell: true,
          detached: true,
        });

        if (child.pid !== undefined) {
          this.#activeProcessGroups.add(child.pid);
        }

        const timer = setTimeout(() => {
          timedOut = true;
          this.#logger.warn(`Hook timed out after ${timeoutMs / 1000}s: ${command}`);
          this.#killProcessGroup(child.pid);
          const killTimer = setTimeout(() => {
            this.#killProcessGroup(child.pid, 'SIGKILL');
          }, SIGKILL_DELAY_MS);
          killTimer.unref();
        }, timeoutMs);

        child.stdout?.on('data', (data: Buffer) => {
          if (stdoutData.length < MAX_OUTPUT_BYTES) {
            stdoutData += data.toString();
          }
        });

        child.stderr?.on('data', (data: Buffer) => {
          if (stderrData.length < MAX_OUTPUT_BYTES) {
            stderrData += data.toString();
          }
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          this.#logger.warn(`Hook process error: ${err.message}`);
          resolve({
            exitCode: 1,
            stdout: stdoutData,
            stderr: stderrData || err.message,
            parsedOutput: null,
            timedOut: false,
          });
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (child.pid !== undefined) {
            this.#activeProcessGroups.delete(child.pid);
          }
          const exitCode = code ?? 1;
          const parsedOutput = this.#parseStdout(stdoutData);

          resolve({
            exitCode,
            stdout: stdoutData,
            stderr: stderrData,
            parsedOutput,
            timedOut,
          });
        });

        // Write stdin and close
        if (child.stdin) {
          child.stdin.on('error', (err) => {
            this.#logger.warn(`stdin write error (child may have exited early): ${err.message}`);
          });
          child.stdin.write(stdinJson);
          child.stdin.end();
        }
      } catch (err) {
        this.#logger.warn(
          `Failed to spawn hook process: ${err instanceof Error ? err.message : String(err)}`,
        );
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          parsedOutput: null,
          timedOut: false,
        });
      }
    });
  }

  #createFilteredEnv(): NodeJS.ProcessEnv {
    const filtered: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!EXCLUDED_ENV_VARS.includes(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  #killProcessGroup(pid: number | undefined, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (pid === undefined) return;
    try {
      process.kill(-pid, signal);
    } catch {
      // Process group may already be dead
    }
  }

  #parseStdout(stdout: string): Record<string, unknown> | null {
    const trimmed = stdout.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.#logger.warn(`Hook stdout is not valid JSON: ${trimmed.substring(0, 200)}`);
      return null;
    }
  }
}
