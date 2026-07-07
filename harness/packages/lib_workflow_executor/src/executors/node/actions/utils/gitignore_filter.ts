import { dirname, normalize } from 'node:path';
import { DefaultStatelessRepository, findGitRepoRoot } from '@gitlab-org/repositories/node';

/**
 * `.gitignore` evaluation for the node-only file tools, delegated to
 * `git check-ignore` (the ground truth) rather than reimplemented, since a
 * hand-rolled matcher would silently diverge from git. git is only ever spawned
 * inside a repo (guarded by a cheap fs `.git`-walk); outside a repo nothing is
 * reported ignored, matching ripgrep's `--require-git` default.
 */

/**
 * Filters absolute target paths to those that are `.gitignored`, exactly as git
 * would report them. Returns the subset of `absoluteTargets` that are ignored
 * (always empty when not inside a git repository — see the module docstring).
 *
 * Precondition: all `absoluteTargets` must reside within a single git repository
 * (the one discovered from the first target's directory). Only the first
 * target's repo is consulted, so paths spanning different repositories, or paths
 * outside that repo root, are unsupported.
 *
 * @param absoluteTargets Absolute, realpath-resolved target paths. Callers
 *   enforce workspace containment separately.
 */
export async function findIgnoredPaths(absoluteTargets: string[]): Promise<string[]> {
  if (absoluteTargets.length === 0) {
    return [];
  }

  const [firstTarget] = absoluteTargets;
  const repoRoot = await findGitRepoRoot(dirname(firstTarget));
  if (repoRoot === undefined) {
    return [];
  }

  // `git check-ignore` echoes back each ignored path in the form it was given
  // (absolute in → absolute out), and simple-git resolves with `[]` (not a
  // rejection) on exit code 1 ("none of the paths are ignored").
  // No catch on purpose: unexpected git errors propagate (fail closed).
  const ignored = await new DefaultStatelessRepository(repoRoot).checkIgnore(absoluteTargets);

  // git normalises paths, so match on the normalised form, not raw equality.
  const ignoredSet = new Set(ignored.map((p) => normalize(p)));
  return absoluteTargets.filter((target) => ignoredSet.has(normalize(target)));
}

/**
 * Convenience wrapper for a single path. Returns true when the target is
 * `.gitignored` (and a git repo applies).
 */
export async function isIgnoredPath(absoluteTarget: string): Promise<boolean> {
  return (await findIgnoredPaths([absoluteTarget])).length > 0;
}
