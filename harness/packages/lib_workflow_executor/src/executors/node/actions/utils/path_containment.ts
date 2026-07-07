import { isAbsolute, relative } from 'node:path';

/**
 * Security boundary check: true when `path` is `dir` itself or nested within it.
 * Both arguments should already be resolved/real paths so symlinks and `..`
 * segments cannot escape the directory.
 */
export function isPathContainedIn(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}
