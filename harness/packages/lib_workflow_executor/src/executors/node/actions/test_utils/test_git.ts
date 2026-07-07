import { execFileSync } from 'node:child_process';

/**
 * A minimal git handle for tests, backed by the git CLI. Every command runs
 * against a single repository directory with isolated config so tests never
 * touch the system or global git config.
 */
export interface TestGitRepo {
  /** `git add <paths...>` */
  add(paths: string | string[]): Promise<void>;
  /** `git commit -m <message>` */
  commit(message: string): Promise<void>;
  /** `git <args...>` */
  raw(args: string[]): Promise<void>;
}

/**
 * Initializes `dir` as a git repository with isolated, local-only config so
 * tests don't interfere with (or depend on) system or global git config.
 *
 * @param dir - The directory to initialize as a git repository
 * @returns A handle exposing `add`, `commit`, and `raw` against that repository
 */
export async function testGit(dir: string): Promise<TestGitRepo> {
  const run = (args: string[]): void => {
    execFileSync('git', args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_NOGLOBAL: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: 'pipe',
    });
  };

  run(['init']);
  run(['config', 'user.name', 'Test User']);
  run(['config', 'user.email', 'test@example.com']);

  return {
    async add(paths: string | string[]): Promise<void> {
      run(['add', ...(Array.isArray(paths) ? paths : [paths])]);
    },
    async commit(message: string): Promise<void> {
      run(['commit', '-m', message]);
    },
    async raw(args: string[]): Promise<void> {
      run(args);
    },
  };
}
