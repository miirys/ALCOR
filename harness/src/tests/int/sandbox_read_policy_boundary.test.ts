// @gitlab-org/sandbox transitively imports ESM-only SRT that Jest can't load; we exercise it via the CLI subprocess below.
jest.mock('@anthropic-ai/sandbox-runtime', () => ({}));

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ConfigService } from '@gitlab-org/config';
import { DesktopSandboxConfigService } from '@gitlab-org/sandbox';

let SRT_CLI = '';
try {
  SRT_CLI = join(
    dirname(require.resolve('@anthropic-ai/sandbox-runtime/package.json')),
    'dist',
    'cli.js',
  );
} catch {
  // Package not installed; beforeAll will throw with a descriptive message.
}

const SPAWN_TIMEOUT_MS = 20_000; // 20s
const TEST_TIMEOUT_MS = SPAWN_TIMEOUT_MS + 5_000; // 25s

// macOS-only: Linux runners give capability-stripped userns that SRT's bwrap rejects, so CI runs this on a macOS runner.
const suite = process.platform === 'darwin' ? describe : describe.skip;

// Topmost not-yet-existing ancestor, so teardown's rmSync of it restores $HOME.
function topmostMissingAncestor(target: string): string {
  let cur = target;
  while (!existsSync(dirname(cur)) && dirname(cur) !== cur) cur = dirname(cur);
  return cur;
}

suite('Sandbox read-policy boundary', () => {
  let workspacePath: string;
  let settingsPath: string;
  const credentialFixtureDir = join(homedir(), '.aws', `sandbox-boundary-test-${process.pid}`);
  const carveOutFixtureDir = join(
    homedir(),
    '.config',
    'git',
    `sandbox-boundary-test-${process.pid}`,
  );
  const createdRoots: string[] = [];

  function buildRuntimeConfig(workspace: string) {
    const logger = new TestLogger();
    const mockConfig = createFakePartial<ConfigService>({
      get: jest
        .fn()
        .mockImplementation((key?: string) =>
          key === 'baseUrl' ? 'https://gitlab.example.com/' : undefined,
        ),
      onConfigChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });
    const service = new DesktopSandboxConfigService(mockConfig, logger);
    const config = service.getEffectiveWorkspaceConfig(workspace);
    // SRT needs deniedDomains or safeParse fails and it runs unsandboxed (denial tests would silently pass).
    return {
      network: {
        allowedDomains: config.network.allowedDomains,
        deniedDomains: [],
      },
      filesystem: {
        allowRead: config.filesystem.allowRead ?? [],
        denyRead: config.filesystem.denyRead,
        allowWrite: config.filesystem.allowWrite,
        denyWrite: config.filesystem.denyWrite,
      },
    };
  }

  // Never log result.stdout/stderr; child output can contain real ~/.gitconfig credentials.
  function runSandboxed(command: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, [SRT_CLI, '-s', settingsPath, '-c', command], {
      cwd: workspacePath,
      encoding: 'utf-8',
      timeout: SPAWN_TIMEOUT_MS,
    });
  }

  beforeAll(() => {
    if (!existsSync(SRT_CLI)) {
      throw new Error(
        `SRT CLI not found at ${SRT_CLI}. ` +
          `This suite must run against a real sandbox provider; ` +
          `verify @anthropic-ai/sandbox-runtime is installed before running.`,
      );
    }
    workspacePath = mkdtempSync(join(homedir(), '.gitlab-lsp-sandbox-boundary-'));
    settingsPath = join(workspacePath, 'srt-settings.json');
    writeFileSync(settingsPath, JSON.stringify(buildRuntimeConfig(workspacePath)));
  });

  afterAll(() => {
    // Tolerate cleanup failures so they don't mask the real test result.
    for (const path of [credentialFixtureDir, carveOutFixtureDir, ...createdRoots, workspacePath]) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it(
    'allows a Node child to bootstrap under the shipping policy',
    () => {
      // Catches over-restrictive deny regressions (e.g. workspace path dropped from allowRead).
      const result = runSandboxed(`${JSON.stringify(process.execPath)} -e "process.exit(0)"`);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'allows reads of a file inside the workspace',
    () => {
      const fixture = join(workspacePath, 'workspace-fixture.txt');
      writeFileSync(fixture, 'workspace-allowed');
      const result = runSandboxed(`cat ${JSON.stringify(fixture)}`);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('workspace-allowed');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'allows reads of a carved-out path within the broad deny',
    () => {
      // Deny-with-allow-back: ~/.config/ denied, ~/.config/git/ re-allowed (a workspace fixture wouldn't hit this path).
      createdRoots.push(topmostMissingAncestor(carveOutFixtureDir));
      mkdirSync(carveOutFixtureDir, { recursive: true });
      const fixture = join(carveOutFixtureDir, 'allowed-config');
      writeFileSync(fixture, 'carve-out-allowed');
      const result = runSandboxed(`cat ${JSON.stringify(fixture)}`);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('carve-out-allowed');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'denies reads of a file under a deny-listed credential path',
    () => {
      createdRoots.push(topmostMissingAncestor(credentialFixtureDir));
      mkdirSync(credentialFixtureDir, { recursive: true });
      const fixture = join(credentialFixtureDir, 'fake-credentials');
      writeFileSync(fixture, 'should-not-be-readable');
      const result = runSandboxed(`cat ${JSON.stringify(fixture)}`);
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain('should-not-be-readable');
    },
    TEST_TIMEOUT_MS,
  );

  // macOS-bun isn't covered: its carve-out bugs repro only against the compiled binary, not the interpreter. See #2407.
});
