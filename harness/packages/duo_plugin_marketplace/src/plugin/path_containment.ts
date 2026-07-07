import { relative, sep } from 'node:path';

/**
 * True when `candidate` is `root` itself or a descendant of it.
 *
 * This is a pure string comparison and never touches the filesystem. Callers
 * are responsible for resolving both paths first: use `realpath` for paths that
 * exist (e.g. a source tree) and `resolve` for paths that do not yet exist
 * (e.g. a copy destination, where `realpath` would throw ENOENT). When you need
 * resolve-then-contain for an existing path, use `SafePluginFs.assertWithinStore`
 * rather than resolving by hand.
 *
 * This is the security-critical containment primitive shared by the copy engine
 * and the source resolver, so it lives in one place to keep the two in sync.
 */
export function isWithin(root: string, candidate: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rel = relative(root, candidate);
  return rel.length > 0 && rel !== '..' && !rel.startsWith(`..${sep}`);
}
