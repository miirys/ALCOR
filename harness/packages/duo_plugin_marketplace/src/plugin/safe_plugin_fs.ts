import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { pathExists } from './cache_fs';
import { isWithin } from './path_containment';
import { assertPathSegment } from './path_segment';
import { ACCESSED_MARKER, getPluginStoreRoot } from './plugin_paths';

export interface PlacePluginFilesOptions {
  maxFiles?: number;
  maxBytes?: number;
  maxDepth?: number;
  /**
   * The marketplace root the plugin belongs to. A symlink whose target resolves
   * inside this root but outside the plugin's own directory is dereferenced (its
   * content copied); a symlink resolving outside the marketplace is skipped.
   * Defaults to the plugin directory, so without a marketplace a symlink is only
   * ever preserved (when it stays inside the plugin) or skipped.
   */
  marketplaceRoot?: string;
}

export interface SafePluginFs {
  /**
   * Copies a plugin's files into the shared store, matching Claude Code's install
   * semantics. A symlink is handled by where its target resolves: inside the
   * plugin's own directory it is preserved as a relative symlink; elsewhere in the
   * marketplace it is dereferenced (target content copied); outside the
   * marketplace it is skipped. File/byte/depth caps bound a hostile or runaway
   * tree, and every destination is verified to stay inside the plugin store.
   */
  placePluginFiles(
    sourceRoot: string,
    destRoot: string,
    opts?: PlacePluginFilesOptions,
  ): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  /**
   * Enumerate the real files already present in a cached plugin dir (used when
   * an install reuses a version another consumer materialised). Excludes the
   * `.accessed` marker. The dir must be inside the plugin store.
   */
  listCachedFiles(installDir: string): Promise<string[]>;
  /**
   * Assert a directory resolves to a location inside the plugin store, returning
   * its real path. Used to validate a cached version dir before reusing it,
   * guarding against a symlink that swaps the cache path for somewhere outside
   * the store. Throws otherwise.
   */
  assertWithinStore(dir: string): Promise<string>;
}

export const SafePluginFs = createInterfaceId<SafePluginFs>('PluginMarketplaceSafePluginFs');

interface Limits {
  maxFiles: number;
  maxBytes: number;
  maxDepth: number;
}

interface Counters {
  files: number;
  bytes: number;
}

/**
 * Immutable roots plus the mutable running state threaded through a single copy
 * operation. Built once per `placePluginFiles` so the recursive walk only needs
 * to pass the current source/dest dir and depth.
 */
interface CopyContext {
  pluginRoot: string;
  marketplaceRoot: string;
  stagingRoot: string;
  limits: Limits;
  counters: Counters;
  written: string[];
}

const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 12;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

@Implements(SafePluginFs)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultSafePluginFs implements SafePluginFs {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[SafePluginFs]');
  }

  async placePluginFiles(
    sourceRoot: string,
    destRoot: string,
    opts?: PlacePluginFilesOptions,
  ): Promise<string[]> {
    const limits: Limits = {
      maxFiles: opts?.maxFiles ?? DEFAULT_MAX_FILES,
      maxBytes: opts?.maxBytes ?? DEFAULT_MAX_BYTES,
      maxDepth: opts?.maxDepth ?? DEFAULT_MAX_DEPTH,
    };

    const pluginRoot = await realpath(sourceRoot);
    const marketplaceRoot = opts?.marketplaceRoot
      ? await realpath(opts.marketplaceRoot)
      : pluginRoot;

    // Defense in depth: never trust the caller to have kept the destination
    // inside the plugin store. A malicious version/marketplace/plugin segment
    // that slipped past upstream validation must not let files land elsewhere.
    const storeRoot = resolve(getPluginStoreRoot());
    const resolvedDest = resolve(destRoot);
    if (resolvedDest === storeRoot || !isWithin(storeRoot, resolvedDest)) {
      throw new Error(
        `Refusing to install: destination "${resolvedDest}" escapes the plugin store`,
      );
    }

    // Copy into a sibling staging dir first, then atomically rename into place.
    // A copy that throws part-way (cap exceeded, I/O error) must never leave a
    // half-populated version dir that a later reuse would mistake for complete.
    const parent = dirname(resolvedDest);
    await mkdir(parent, { recursive: true, mode: DIR_MODE });

    // The resolve()-based check above is purely textual and cannot see a
    // symlinked path component that would land the destination outside the
    // store physically. The whole chain exists after the mkdir (the dest is a
    // strict descendant of the store root), so re-check with realpath.
    const realStoreRoot = await realpath(getPluginStoreRoot());
    const realDest = join(await realpath(parent), basename(resolvedDest));
    if (realDest === realStoreRoot || !isWithin(realStoreRoot, realDest)) {
      throw new Error(`Refusing to install: destination "${realDest}" escapes the plugin store`);
    }
    const stagingDir = await mkdtemp(join(parent, `.${basename(resolvedDest)}.tmp-`));
    const realStagingDir = await realpath(stagingDir);

    const ctx: CopyContext = {
      pluginRoot,
      marketplaceRoot,
      stagingRoot: realStagingDir,
      limits,
      counters: { files: 0, bytes: 0 },
      written: [],
    };

    try {
      await this.#copyDir(ctx, pluginRoot, realStagingDir, 0);
      await this.#swapIntoPlace(stagingDir, resolvedDest);
    } catch (e) {
      await rm(stagingDir, { recursive: true, force: true });
      throw e;
    }

    // The walk recorded paths under the staging dir; re-point them at the final
    // dir now that the atomic rename has moved everything into place.
    return ctx.written.map((path) => join(resolvedDest, relative(realStagingDir, path)));
  }

  // Move the freshly-staged tree onto `dest`. A `rename` onto an existing
  // non-empty dir fails (ENOTEMPTY), so when `dest` already exists (e.g. an
  // unversioned plugin being re-copied) move the old copy aside first, then
  // remove it once the new copy is in place. Restore it if the swap fails so a
  // re-copy never destroys a working install.
  async #swapIntoPlace(stagingDir: string, dest: string): Promise<void> {
    if (!(await pathExists(dest))) {
      await rename(stagingDir, dest);
      return;
    }
    const backupDir = `${dest}.old-${process.pid}-${Date.now()}`;
    await rename(dest, backupDir);
    try {
      await rename(stagingDir, dest);
    } catch (e) {
      try {
        await rename(backupDir, dest);
      } catch (restoreError) {
        this.#logger.warn(
          `Failed to restore previous install from ${backupDir}; leaving it there`,
          restoreError instanceof Error ? restoreError : new Error(String(restoreError)),
        );
      }
      throw e;
    }
    await rm(backupDir, { recursive: true, force: true });
  }

  async #copyDir(
    ctx: CopyContext,
    sourceDir: string,
    destDir: string,
    depth: number,
  ): Promise<void> {
    if (depth > ctx.limits.maxDepth) {
      throw new Error(
        `Plugin tree exceeds maximum depth of ${ctx.limits.maxDepth} (at ${sourceDir})`,
      );
    }

    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      assertPathSegment(entry.name, 'plugin file name');
      const sourceEntry = join(sourceDir, entry.name);
      const destEntry = join(destDir, entry.name);

      if (entry.isSymbolicLink()) {
        // eslint-disable-next-line no-await-in-loop -- caps depend on running counters; entries handled sequentially
        await this.#copySymlink(ctx, sourceEntry, destEntry, depth);
      } else if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop -- see above
        await this.#descend(ctx, sourceEntry, destEntry, depth);
      } else if (entry.isFile()) {
        // eslint-disable-next-line no-await-in-loop -- see above
        const fileStat = await lstat(sourceEntry);
        // eslint-disable-next-line no-await-in-loop -- see above
        await this.#copyOneFile(ctx, sourceEntry, destEntry, fileStat.size);
      }
    }
  }

  // Handle a symlink by where its target resolves, mirroring Claude Code:
  // inside the plugin -> preserve as a relative symlink; elsewhere in the
  // marketplace -> dereference (copy the target's content); outside the
  // marketplace -> skip.
  async #copySymlink(
    ctx: CopyContext,
    sourceEntry: string,
    destEntry: string,
    depth: number,
  ): Promise<void> {
    let resolvedTarget: string;
    try {
      resolvedTarget = await realpath(sourceEntry);
    } catch (e) {
      this.#logger.warn(
        `Skipping unresolvable symlink ${sourceEntry}`,
        e instanceof Error ? e : new Error(String(e)),
      );
      return;
    }

    if (!isWithin(ctx.marketplaceRoot, resolvedTarget)) {
      this.#logger.warn(
        `Skipping symlink ${sourceEntry} -> ${resolvedTarget} (escapes marketplace ${ctx.marketplaceRoot})`,
      );
      return;
    }

    if (resolvedTarget === ctx.pluginRoot || isWithin(ctx.pluginRoot, resolvedTarget)) {
      await this.#preserveSymlink(ctx, resolvedTarget, destEntry);
      return;
    }

    // TOCTOU note: the target can be swapped between the realpath above and
    // the stat/copy below. Accepted: winning that race requires same-user
    // write access to the source tree mid-install, which already implies full
    // account compromise — no privilege boundary is crossed.
    const targetStat = await stat(resolvedTarget);
    if (targetStat.isDirectory()) {
      // Guard against symlink cycles (e.g. `a -> .` or `a -> ..`): if the link
      // resolves to an ancestor of (or equals) its own location, descending
      // would re-copy the subtree up to the depth cap. Skip it.
      const linkParent = await realpath(dirname(sourceEntry));
      if (linkParent === resolvedTarget || isWithin(resolvedTarget, linkParent)) {
        this.#logger.warn(`Skipping cyclic directory symlink ${sourceEntry} -> ${resolvedTarget}`);
        return;
      }
      await this.#descendResolved(ctx, resolvedTarget, destEntry, depth);
    } else if (targetStat.isFile()) {
      await this.#copyOneFile(ctx, resolvedTarget, destEntry, targetStat.size);
    }
  }

  // Recreate a symlink whose target lives inside the plugin as a relative link
  // pointing at the target's location within the cache. Normalising to a
  // relative, in-cache path (rather than copying the source link verbatim) keeps
  // the link valid after the staging dir is renamed into place, and collapses
  // chains/absolute links to a single link at the final target.
  async #preserveSymlink(
    ctx: CopyContext,
    resolvedTarget: string,
    destEntry: string,
  ): Promise<void> {
    // eslint-disable-next-line no-param-reassign -- running totals threaded through the walk
    ctx.counters.files += 1;
    if (ctx.counters.files > ctx.limits.maxFiles) {
      throw new Error(`Plugin tree exceeds maximum file count of ${ctx.limits.maxFiles}`);
    }

    const targetInDest = join(ctx.stagingRoot, relative(ctx.pluginRoot, resolvedTarget));
    if (!isWithin(ctx.stagingRoot, resolve(targetInDest))) {
      throw new Error(`Preserved symlink ${destEntry} target escapes the plugin store`);
    }
    // `relative` yields '' when the target is the link's own directory (e.g. a
    // link to the plugin root); '.' is the equivalent POSIX self-reference.
    const linkValue = relative(dirname(destEntry), targetInDest) || '.';

    await mkdir(dirname(destEntry), { recursive: true, mode: DIR_MODE });
    await symlink(linkValue, destEntry);
    ctx.written.push(destEntry);
  }

  async #descend(
    ctx: CopyContext,
    sourceEntry: string,
    destEntry: string,
    depth: number,
  ): Promise<void> {
    // The marketplace is the read boundary, not the plugin: this walk also
    // descends dereferenced in-marketplace symlink targets (see #copySymlink),
    // whose real subdirectories legitimately live outside the plugin root.
    const realSourceEntry = await realpath(sourceEntry);
    if (!isWithin(ctx.marketplaceRoot, realSourceEntry)) {
      throw new Error(
        `Source directory ${realSourceEntry} escapes marketplace root ${ctx.marketplaceRoot}`,
      );
    }
    await this.#descendResolved(ctx, realSourceEntry, destEntry, depth);
  }

  async #descendResolved(
    ctx: CopyContext,
    realSourceDir: string,
    destEntry: string,
    depth: number,
  ): Promise<void> {
    if (!isWithin(ctx.stagingRoot, resolve(destEntry))) {
      throw new Error(`Destination directory ${destEntry} escapes the plugin store`);
    }
    await mkdir(destEntry, { recursive: true, mode: DIR_MODE });
    await this.#copyDir(ctx, realSourceDir, destEntry, depth + 1);
  }

  async #copyOneFile(
    ctx: CopyContext,
    sourceFile: string,
    destFile: string,
    size: number,
  ): Promise<void> {
    // eslint-disable-next-line no-param-reassign -- running totals threaded through the walk
    ctx.counters.files += 1;
    if (ctx.counters.files > ctx.limits.maxFiles) {
      throw new Error(`Plugin tree exceeds maximum file count of ${ctx.limits.maxFiles}`);
    }
    // eslint-disable-next-line no-param-reassign -- see above
    ctx.counters.bytes += size;
    if (ctx.counters.bytes > ctx.limits.maxBytes) {
      throw new Error(`Plugin tree exceeds maximum total size of ${ctx.limits.maxBytes} bytes`);
    }

    const resolvedDest = resolve(destFile);
    if (!isWithin(ctx.stagingRoot, resolvedDest)) {
      throw new Error(`Destination file ${destFile} escapes the plugin store`);
    }

    await mkdir(dirname(resolvedDest), { recursive: true, mode: DIR_MODE });
    await copyFile(sourceFile, resolvedDest);
    await this.#chmodFile(resolvedDest);
    ctx.written.push(resolvedDest);
  }

  async #chmodFile(filePath: string): Promise<void> {
    try {
      await chmod(filePath, FILE_MODE);
    } catch (e) {
      this.#logger.warn(
        `Failed to set file mode on ${filePath}`,
        e instanceof Error ? e : new Error(String(e)),
      );
    }
  }

  async removeFiles(paths: string[]): Promise<void> {
    const storeRoot = resolve(getPluginStoreRoot());

    const parentSets = await Promise.all(
      paths.map(async (filePath) => {
        // resolve(), deliberately not realpath(): removal must target the
        // literal path (unlinking a preserved symlink removes the link, not
        // its target), and the non-recursive rm below never follows a final
        // symlink. resolve() neutralises `..` traversal before the check.
        const resolved = resolve(filePath);
        // The file list is read back from a committable installed_plugins.json,
        // so it is untrusted. Never delete anything outside the plugin store,
        // even if a record claims to have installed it there.
        if (!isWithin(storeRoot, resolved)) {
          this.#logger.warn(`Refusing to remove "${resolved}": outside the plugin store`);
          return [];
        }
        try {
          await rm(resolved, { force: true });
        } catch (e) {
          this.#logger.warn(
            `Failed to remove ${resolved}`,
            e instanceof Error ? e : new Error(String(e)),
          );
        }
        const parents: string[] = [];
        let parent = dirname(resolved);
        while (isWithin(storeRoot, parent) && parent !== storeRoot) {
          parents.push(parent);
          parent = dirname(parent);
        }
        return parents;
      }),
    );

    const prunable = new Set(parentSets.flat());
    const ordered = [...prunable].sort((a, b) => b.length - a.length);
    for (const dir of ordered) {
      // eslint-disable-next-line no-await-in-loop -- prune deepest-first so a parent only checks after its children
      await this.#pruneIfEmpty(dir);
    }
  }

  async #pruneIfEmpty(dir: string): Promise<void> {
    try {
      const remaining = await readdir(dir);
      if (remaining.length === 0) {
        // rmdir, not rm: a non-recursive rm cannot remove a directory (it
        // rejects, and with force set the failure is swallowed), so it would
        // silently leave the empty dir behind.
        await rmdir(dir);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.#logger.warn(
          `Failed to prune directory ${dir}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }
    }
  }

  async assertWithinStore(dir: string): Promise<string> {
    const realDir = await realpath(dir);
    // The candidate is realpath'd, so the root must be too: a config dir
    // reached through a symlink (macOS /tmp, a dotfile-managed ~/.config)
    // would otherwise never compare equal. When the store root does not yet
    // exist, nothing can be inside it — fall back to the textual path so the
    // check below fails with a clear message rather than ENOENT.
    const storeRoot = await realpath(getPluginStoreRoot()).catch(() =>
      resolve(getPluginStoreRoot()),
    );
    if (realDir !== storeRoot && !isWithin(storeRoot, realDir)) {
      throw new Error(`Refusing to use "${realDir}": outside the plugin store`);
    }
    return realDir;
  }

  async listCachedFiles(installDir: string): Promise<string[]> {
    const realDir = await this.assertWithinStore(installDir);
    const found: string[] = [];
    await this.#walkFiles(realDir, found);
    return found.filter((path) => path !== join(realDir, ACCESSED_MARKER));
  }

  async #walkFiles(dir: string, out: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await this.#walkFiles(full, out);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          // Preserved symlinks are plugin content too. They resolve inside the
          // install dir by construction (see #preserveSymlink), so they are
          // surfaced alongside regular files.
          out.push(full);
        }
      }),
    );
  }
}
