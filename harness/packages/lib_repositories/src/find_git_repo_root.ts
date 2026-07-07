import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Find the git repository root for `startDir`: the nearest ancestor (inclusive)
 * that contains a `.git` entry. A `.git` FILE (git worktree / submodule pointer)
 * counts as a hit, not just a `.git` directory.
 *
 * This is a pure filesystem walk (a `stat` per ancestor) — it never spawns a
 * git subprocess.
 *
 * @returns the directory containing `.git`, or `undefined` when no `.git` entry
 *   exists anywhere up the tree.
 */
export async function findGitRepoRoot(startDir: string): Promise<string | undefined> {
  let current = startDir;
  while (true) {
    // eslint-disable-next-line no-await-in-loop -- ancestor walk is inherently sequential
    if (await pathExists(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
