import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

/**
 * Path to the compiled CLI binary. Prefers `duo-native`
 * (local dev), falls back to the platform-specific CI name.
 */
export function getCompiledBinaryPath(): string {
  const root = process.cwd();
  const candidates = process.platform === 'win32' ? ['bin/duo-native.exe'] : ['bin/duo-native'];
  const { platform } = process;
  const { arch } = process;
  if (platform === 'linux') {
    candidates.push(arch === 'arm64' ? 'bin/duo-linux-arm64' : 'bin/duo-linux-x64');
  } else if (platform === 'darwin') {
    candidates.push(arch === 'arm64' ? 'bin/duo-darwin-arm64' : 'bin/duo-darwin-x64-baseline');
  } else if (platform === 'win32') {
    if (arch === 'arm64') {
      candidates.push('bin/duo-windows-arm64.exe');
    } else {
      candidates.push('bin/duo-windows-x64-modern.exe', 'bin/duo-windows-x64-baseline.exe');
    }
  }
  for (const c of candidates) {
    const p = resolve(root, c);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `No compiled CLI binary found. Tried: ${candidates.join(', ')}. ` +
      `Build with: bun run --filter @gitlab/duo-cli build:dev-binary`,
  );
}

let dumpCounter = 0;

/**
 * Dump the most recent CLI log file to stderr for debugging.
 * Runs `node <cli> log tail -200` to show the last 200 lines.
 * Output is wrapped in a GitLab CI collapsible section (collapsed by default).
 */
export function dumpCliLogs(): void {
  const logDir = join(tmpdir(), 'gitlab-duo-cli');
  if (!existsSync(logDir)) {
    // eslint-disable-next-line no-console
    console.warn('No CLI log directory found — CLI has not run yet, nothing to dump.');
    return;
  }

  const sectionName = `cli_logs_${++dumpCounter}`;
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    const output = execFileSync(getCompiledBinaryPath(), ['log', 'tail', '-200'], {
      encoding: 'utf-8',
      timeout: 5000,
      killSignal: 'SIGKILL',
    });
    // eslint-disable-next-line no-console
    console.error(
      `\n\x1b[0Ksection_start:${timestamp}:${sectionName}[collapsed=true]\r\x1b[0KCLI LOGS (last 200 lines)`,
    );
    // eslint-disable-next-line no-console
    console.error(output);
    // eslint-disable-next-line no-console
    console.error(`\x1b[0Ksection_end:${timestamp}:${sectionName}\r\x1b[0K`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      'Failed to retrieve CLI logs:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export const INPUT_PLACEHOLDER = /Type your message here/;

export function assertTestToken(): void {
  if (!process.env.GITLAB_TEST_TOKEN && !process.env.GITLAB_TOKEN) {
    throw new Error('GITLAB_TEST_TOKEN (or GITLAB_TOKEN) not set');
  }
}

export function getTestToken(): string {
  assertTestToken();
  return (process.env.GITLAB_TEST_TOKEN ?? process.env.GITLAB_TOKEN) as string;
}

/**
 * Build environment overrides for e2e test processes.
 *
 * These are **overrides**, not a replacement env. The tmux session inherits
 * the full environment from the tmux server; only the keys returned here
 * are changed. This means tools installed via mise, homebrew, etc. remain
 * available without explicitly adding them to PATH.
 *
 * Set a key to `''` (empty string) to **unset** it — {@link buildEnvCommand}
 * converts these to `env -u KEY`.
 * See `.agents/skills/cli-development/references/cli-e2e-environment-constraints.md`.
 */
export function createTestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    // Ink (React terminal renderer) uses `is-ci` → `ci-info` to detect CI
    // environments. `ci-info` checks dozens of env vars (CI, CI_BUILD_ID,
    // BUILD_NUMBER, etc.) and switches Ink to non-interactive rendering.
    // Setting CI='false' triggers ci-info's explicit bypass.
    CI: 'false',
    DUO_WORKFLOW_TELEMETRY_ENABLED: '0',
    ...overrides,
  };
}

/**
 * Convert an env overrides map into a command array for tmux's initial
 * command. Uses `env` to set/unset variables, then launches `bash`.
 *
 * - Non-empty values → `K=V` arguments (set/override).
 * - Empty-string values → `-u K` arguments (true unset via `env -u`).
 *
 * The resulting command is passed as separate process arguments to tmux
 * (no shell escaping needed), and env vars never appear in scrollback.
 *
 * `-u` flags are placed before `K=V` assignments because `env` stops
 * processing options at the first `NAME=VALUE` argument.
 */
export function buildEnvCommand(env: Record<string, string>): string[] {
  const unsetArgs = Object.entries(env)
    .filter(([, v]) => v === '')
    .flatMap(([k]) => ['-u', k]);
  const setArgs = Object.entries(env)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`);
  return ['env', ...unsetArgs, ...setArgs, 'bash'];
}
