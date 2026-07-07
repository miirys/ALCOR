import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');

execSync(
  [
    'rimraf',
    './packages/*/dist',
    './webviews/*/dist',
    './.turbo',
    './packages/*/.turbo',
    './webviews/*/.turbo',
    './src/node/.turbo',
    './src/common/.turbo',
    './src/common/dist',
    './src/browser/.turbo',
    './src/browser/dist',
    './src/node/dist',
    './out',
    './bin',
    './tmp',
    './node_modules/.cache/turbo',
  ].join(' '),
  { cwd: ROOT, stdio: 'inherit' },
);
console.log(`Removed build outputs and inline turbo caches`);

// Turbo shares cache across git worktrees. The shared cache lives outside
// this repo, so rimraf globs above won't reach it.
try {
  const gitCommonDir = execSync('git rev-parse --git-common-dir', {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim();

  const resolvedCommonDir = resolve(ROOT, gitCommonDir);
  const sharedCacheDir = resolve(dirname(resolvedCommonDir), '.turbo', 'cache');

  if (existsSync(sharedCacheDir)) {
    rmSync(sharedCacheDir, { recursive: true, force: true });
    console.log(`Removed shared git worktree turbo cache: ${sharedCacheDir}`);
  }
} catch {
  // not a git worktree or git not available — nothing to clean
}
