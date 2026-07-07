import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { NullLogger } from '@gitlab-org/logging';
import { DefaultSafePluginFs } from './safe_plugin_fs';
import * as paths from './plugin_paths';

jest.mock('./plugin_paths', () => ({
  ...jest.requireActual('./plugin_paths'),
  getPluginStoreRoot: jest.fn(),
}));

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, rename: jest.fn(actual.rename) };
});

const actualFs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');

const mockStoreRoot = paths.getPluginStoreRoot as jest.MockedFunction<
  typeof paths.getPluginStoreRoot
>;
const mockRename = rename as jest.MockedFunction<typeof rename>;

describe('DefaultSafePluginFs', () => {
  let root: string;
  let storeRoot: string;
  let sourceRoot: string;
  let destRoot: string;
  let safeFs: DefaultSafePluginFs;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'safefs-test-'));
    storeRoot = join(root, 'store');
    sourceRoot = join(root, 'source');
    destRoot = join(storeRoot, 'mkt', 'plugin', '1.0.0');
    await mkdir(storeRoot, { recursive: true });
    await mkdir(sourceRoot, { recursive: true });
    mockStoreRoot.mockReturnValue(storeRoot);
    safeFs = new DefaultSafePluginFs(new NullLogger());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('placePluginFiles', () => {
    describe('when the source has real files and dirs', () => {
      it('copies them and chmods files 0600 / dirs 0700', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');
        await mkdir(join(sourceRoot, 'sub'));
        await writeFile(join(sourceRoot, 'sub', 'b.txt'), 'B');

        const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

        expect(written).toHaveLength(2);
        expect(await readFile(join(destRoot, 'a.txt'), 'utf8')).toBe('A');
        expect(await readFile(join(destRoot, 'sub', 'b.txt'), 'utf8')).toBe('B');

        const fileStat = await stat(join(destRoot, 'a.txt'));
        const dirStat = await stat(join(destRoot, 'sub'));
        // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
        expect(fileStat.mode & 0o777).toBe(0o600);
        // eslint-disable-next-line no-bitwise -- masking permission bits is the idiomatic check
        expect(dirStat.mode & 0o777).toBe(0o700);
      });
    });

    describe('symlink handling', () => {
      // Fixture with a marketplace root and a plugin subdir, so the three-way
      // rule (in-plugin / in-marketplace / outside) can be exercised.
      let mktRoot: string;
      let pluginDir: string;

      beforeEach(async () => {
        mktRoot = join(root, 'mkt');
        pluginDir = join(mktRoot, 'plugins', 'p');
        await mkdir(pluginDir, { recursive: true });
      });

      describe('when a within-plugin file symlink is present', () => {
        it('preserves it as a relative link resolving to the real content', async () => {
          await writeFile(join(sourceRoot, 'real.txt'), 'real');
          await symlink('real.txt', join(sourceRoot, 'link.txt'));

          const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

          const linkStat = await lstat(join(destRoot, 'link.txt'));
          expect(linkStat.isSymbolicLink()).toBe(true);
          const target = await readlink(join(destRoot, 'link.txt'));
          expect(isAbsolute(target)).toBe(false);
          expect(target).not.toContain(root);
          expect(await readFile(join(destRoot, 'link.txt'), 'utf8')).toBe('real');
          expect(written).toContain(join(destRoot, 'link.txt'));
        });

        it('preserves a nested within-plugin file symlink as a relative link', async () => {
          await writeFile(join(sourceRoot, 'real.txt'), 'real');
          await mkdir(join(sourceRoot, 'skills', 'greet'), { recursive: true });
          await symlink('../../real.txt', join(sourceRoot, 'skills', 'greet', 'link'));

          const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

          const linkPath = join(destRoot, 'skills', 'greet', 'link');
          const linkStat = await lstat(linkPath);
          expect(linkStat.isSymbolicLink()).toBe(true);
          const target = await readlink(linkPath);
          expect(isAbsolute(target)).toBe(false);
          expect(target).not.toContain(root);
          expect(await readFile(linkPath, 'utf8')).toBe('real');
          expect(written).toContain(linkPath);
        });
      });

      describe('when a within-plugin directory symlink is present', () => {
        it('preserves it as a single link and copies the real dir', async () => {
          await mkdir(join(sourceRoot, 'realdir'));
          await writeFile(join(sourceRoot, 'realdir', 'f.txt'), 'F');
          await symlink('realdir', join(sourceRoot, 'linkdir'));

          await safeFs.placePluginFiles(sourceRoot, destRoot);

          const linkStat = await lstat(join(destRoot, 'linkdir'));
          expect(linkStat.isSymbolicLink()).toBe(true);
          expect(await readFile(join(destRoot, 'realdir', 'f.txt'), 'utf8')).toBe('F');
          expect(await readFile(join(destRoot, 'linkdir', 'f.txt'), 'utf8')).toBe('F');
        });
      });

      describe('when an absolute within-plugin symlink is present', () => {
        it('preserves it, normalised to a relative link', async () => {
          await writeFile(join(sourceRoot, 'real.txt'), 'real');
          await symlink(join(sourceRoot, 'real.txt'), join(sourceRoot, 'link.txt'));

          await safeFs.placePluginFiles(sourceRoot, destRoot);

          const linkStat = await lstat(join(destRoot, 'link.txt'));
          expect(linkStat.isSymbolicLink()).toBe(true);
          const target = await readlink(join(destRoot, 'link.txt'));
          expect(isAbsolute(target)).toBe(false);
          expect(target).not.toContain(root);
          expect(await readFile(join(destRoot, 'link.txt'), 'utf8')).toBe('real');
        });
      });

      describe('when a chained within-plugin symlink a -> b -> real is present', () => {
        it('preserves both, each pointing at the final target', async () => {
          await writeFile(join(sourceRoot, 'real.txt'), 'real');
          await symlink('real.txt', join(sourceRoot, 'b'));
          await symlink('b', join(sourceRoot, 'a'));

          await safeFs.placePluginFiles(sourceRoot, destRoot);

          expect((await lstat(join(destRoot, 'a'))).isSymbolicLink()).toBe(true);
          expect((await lstat(join(destRoot, 'b'))).isSymbolicLink()).toBe(true);
          // Both collapse to the final target, not a->b.
          const aReal = await stat(join(destRoot, 'a'));
          const bReal = await stat(join(destRoot, 'b'));
          const realStat = await stat(join(destRoot, 'real.txt'));
          expect(aReal.ino).toBe(realStat.ino);
          expect(bReal.ino).toBe(realStat.ino);
          expect(await readFile(join(destRoot, 'a'), 'utf8')).toBe('real');
          expect(await readFile(join(destRoot, 'b'), 'utf8')).toBe('real');
        });
      });

      describe('when a link is visited before its target in walk order', () => {
        it('still resolves to the real content after install', async () => {
          await writeFile(join(sourceRoot, 'z-real.txt'), 'real');
          await symlink('z-real.txt', join(sourceRoot, 'a-link.txt'));

          await safeFs.placePluginFiles(sourceRoot, destRoot);

          expect((await lstat(join(destRoot, 'a-link.txt'))).isSymbolicLink()).toBe(true);
          expect(await readFile(join(destRoot, 'a-link.txt'), 'utf8')).toBe('real');
        });
      });

      describe('when a symlink resolves inside the marketplace but outside the plugin', () => {
        it('dereferences it, copying the target as a regular file', async () => {
          await writeFile(join(mktRoot, 'shared.txt'), 'SHARED');
          await symlink('../../shared.txt', join(pluginDir, 'link'));

          await safeFs.placePluginFiles(pluginDir, destRoot, { marketplaceRoot: mktRoot });

          const linkStat = await lstat(join(destRoot, 'link'));
          expect(linkStat.isSymbolicLink()).toBe(false);
          expect(linkStat.isFile()).toBe(true);
          expect(await readFile(join(destRoot, 'link'), 'utf8')).toBe('SHARED');
        });

        it('dereferences a directory target containing nested subdirectories', async () => {
          // A shared-skills layout: the plugin links to a marketplace-level dir
          // whose content includes real subdirectories.
          await mkdir(join(mktRoot, 'shared-skills', 'greet'), { recursive: true });
          await writeFile(join(mktRoot, 'shared-skills', 'greet', 'SKILL.md'), 'G');
          await writeFile(join(pluginDir, 'plugin.json'), '{}');
          await symlink('../../shared-skills', join(pluginDir, 'skills'));

          const written = await safeFs.placePluginFiles(pluginDir, destRoot, {
            marketplaceRoot: mktRoot,
          });

          expect(await readFile(join(destRoot, 'plugin.json'), 'utf8')).toBe('{}');
          expect(await readFile(join(destRoot, 'skills', 'greet', 'SKILL.md'), 'utf8')).toBe('G');
          expect((await lstat(join(destRoot, 'skills'))).isDirectory()).toBe(true);
          expect(written).toContain(join(destRoot, 'skills', 'greet', 'SKILL.md'));
        });
      });

      describe('when a symlink resolves outside the marketplace', () => {
        it('skips an absolute link to a secret outside the marketplace', async () => {
          const secret = join(root, 'secret.txt');
          await writeFile(secret, 'TOP SECRET');
          await symlink(secret, join(pluginDir, 'escape'));

          const written = await safeFs.placePluginFiles(pluginDir, destRoot, {
            marketplaceRoot: mktRoot,
          });

          expect(written).toHaveLength(0);
          await expect(stat(join(destRoot, 'escape'))).rejects.toThrow();
          await expect(readFile(join(destRoot, 'escape'), 'utf8')).rejects.toThrow();
        });

        it('skips a relative climb-out link to a secret outside the marketplace', async () => {
          const secret = join(root, 'secret.txt');
          await writeFile(secret, 'TOP SECRET');
          await symlink('../../../../secret.txt', join(pluginDir, 'escape'));

          const written = await safeFs.placePluginFiles(pluginDir, destRoot, {
            marketplaceRoot: mktRoot,
          });

          expect(written).toHaveLength(0);
          await expect(stat(join(destRoot, 'escape'))).rejects.toThrow();
        });
      });

      describe('when a symlink is dangling', () => {
        it('skips it', async () => {
          await symlink('does-not-exist.txt', join(sourceRoot, 'dangling'));

          const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

          expect(written).toHaveLength(0);
          await expect(stat(join(destRoot, 'dangling'))).rejects.toThrow();
        });
      });

      describe('when a symlink targets the plugin root itself', () => {
        it('preserves it as a single link without recursing', async () => {
          await writeFile(join(sourceRoot, 'a.txt'), 'A');
          await symlink(sourceRoot, join(sourceRoot, 'self'));

          await safeFs.placePluginFiles(sourceRoot, destRoot);

          const linkStat = await lstat(join(destRoot, 'self'));
          expect(linkStat.isSymbolicLink()).toBe(true);
          // A single self-link pointing at its own directory ('.'), not a
          // re-copied subtree. `self/self` is the same link (loops), so the
          // entry it exposes is itself a symlink, never a materialised dir.
          expect(await readlink(join(destRoot, 'self'))).toBe('.');
          expect((await lstat(join(destRoot, 'self', 'self'))).isSymbolicLink()).toBe(true);
        });
      });

      describe('when preserved links exceed the file count cap', () => {
        it('throws', async () => {
          await writeFile(join(sourceRoot, 'real.txt'), 'real');
          await symlink('real.txt', join(sourceRoot, 'l1'));
          await symlink('real.txt', join(sourceRoot, 'l2'));

          await expect(
            safeFs.placePluginFiles(sourceRoot, destRoot, { maxFiles: 1 }),
          ).rejects.toThrow(/maximum file count/);
        });
      });
    });

    describe('when the source contains an out-of-tree symlink', () => {
      it('skips it, copying 0 of it', async () => {
        const secret = join(root, 'secret.txt');
        await writeFile(secret, 'TOP SECRET');
        await symlink(secret, join(sourceRoot, 'escape.txt'));

        const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

        expect(written).toHaveLength(0);
        await expect(readFile(join(destRoot, 'escape.txt'), 'utf8')).rejects.toThrow();
      });
    });

    describe('when the source contains a cyclic directory symlink', () => {
      it('skips it', async () => {
        // A dir symlink on the dereference path (inside the marketplace but
        // outside the plugin) that points at an ancestor of its own location
        // would re-copy the subtree; it must be skipped.
        const mktRoot = join(root, 'mkt-cyclic');
        const pluginDir = join(mktRoot, 'plugins', 'p');
        await mkdir(pluginDir, { recursive: true });
        await mkdir(join(mktRoot, 'shared'), { recursive: true });
        await writeFile(join(pluginDir, 'a.txt'), 'A');
        // shared/self -> shared (a self-referential dir inside the marketplace),
        // linked into the plugin so the dereference path is taken.
        await symlink('.', join(mktRoot, 'shared', 'self'));
        await symlink('../../shared', join(pluginDir, 'shared'));

        const written = await safeFs.placePluginFiles(pluginDir, destRoot, {
          marketplaceRoot: mktRoot,
        });

        expect(written).toHaveLength(1);
      });
    });

    describe('when the file count cap is exceeded', () => {
      it('throws', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');
        await writeFile(join(sourceRoot, 'b.txt'), 'B');

        await expect(
          safeFs.placePluginFiles(sourceRoot, destRoot, { maxFiles: 1 }),
        ).rejects.toThrow(/maximum file count/);
      });
    });

    describe('when the byte cap is exceeded', () => {
      it('throws', async () => {
        await writeFile(join(sourceRoot, 'big.txt'), 'X'.repeat(100));

        await expect(
          safeFs.placePluginFiles(sourceRoot, destRoot, { maxBytes: 10 }),
        ).rejects.toThrow(/maximum total size/);
      });
    });

    describe('when the depth cap is exceeded', () => {
      it('throws', async () => {
        await mkdir(join(sourceRoot, 'a', 'b', 'c'), { recursive: true });
        await writeFile(join(sourceRoot, 'a', 'b', 'c', 'deep.txt'), 'deep');

        await expect(
          safeFs.placePluginFiles(sourceRoot, destRoot, { maxDepth: 1 }),
        ).rejects.toThrow(/maximum depth/);
      });
    });

    describe('when the destination escapes the plugin store', () => {
      it('throws', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');
        const outside = join(root, 'outside');
        await expect(safeFs.placePluginFiles(sourceRoot, outside)).rejects.toThrow(
          /escapes the plugin store/,
        );
      });
    });

    describe('when a copy fails mid-way', () => {
      it('leaves no partial destination dir', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');
        await writeFile(join(sourceRoot, 'b.txt'), 'B');

        await expect(
          safeFs.placePluginFiles(sourceRoot, destRoot, { maxFiles: 1 }),
        ).rejects.toThrow();

        // The atomic stage-then-rename means a failed copy never materialises the
        // version dir, so a later reuse cannot mistake a truncated copy for done.
        await expect(stat(destRoot)).rejects.toThrow();
        const leftovers = await readdir(join(storeRoot, 'mkt', 'plugin'));
        expect(leftovers).toEqual([]);
      });
    });

    describe('when the copy succeeds', () => {
      it('returns written paths pointing at the final dir, not the staging dir', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');

        const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

        expect(written).toEqual([join(destRoot, 'a.txt')]);
      });
    });

    describe('when the destination already exists', () => {
      it('replaces it with a fresh copy, dropping stale files', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'first');
        await safeFs.placePluginFiles(sourceRoot, destRoot);
        // A stale file from the previous copy that no longer exists in source.
        await writeFile(join(destRoot, 'stale.txt'), 'old');

        await writeFile(join(sourceRoot, 'a.txt'), 'second');
        await safeFs.placePluginFiles(sourceRoot, destRoot);

        expect(await readFile(join(destRoot, 'a.txt'), 'utf8')).toBe('second');
        await expect(stat(join(destRoot, 'stale.txt'))).rejects.toThrow();
      });
    });

    describe('when the swap rename over an existing destination fails', () => {
      const failSwap: typeof rename = async (src, dst) => {
        if (String(dst) === destRoot && String(src).includes('.tmp-')) {
          throw new Error('swap failed');
        }
        return actualFs.rename(src, dst);
      };

      afterEach(() => {
        mockRename.mockImplementation(actualFs.rename);
      });

      it('restores the previous install and rethrows the swap error', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'first');
        await safeFs.placePluginFiles(sourceRoot, destRoot);

        await writeFile(join(sourceRoot, 'a.txt'), 'second');
        mockRename.mockImplementation(failSwap);

        await expect(safeFs.placePluginFiles(sourceRoot, destRoot)).rejects.toThrow('swap failed');
        expect(await readFile(join(destRoot, 'a.txt'), 'utf8')).toBe('first');
      });

      it('rethrows the swap error when the restore also fails, keeping the backup', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'first');
        await safeFs.placePluginFiles(sourceRoot, destRoot);

        await writeFile(join(sourceRoot, 'a.txt'), 'second');
        mockRename.mockImplementation(async (src, dst) => {
          if (String(src).includes('.old-')) {
            throw new Error('restore failed');
          }
          return failSwap(src, dst);
        });

        await expect(safeFs.placePluginFiles(sourceRoot, destRoot)).rejects.toThrow('swap failed');
        const leftovers = await readdir(join(storeRoot, 'mkt', 'plugin'));
        expect(leftovers.some((name) => name.includes('.old-'))).toBe(true);
      });
    });

    describe('when a destination path component is a symlink escaping the store', () => {
      it('throws and installs nothing at the symlink target', async () => {
        await writeFile(join(sourceRoot, 'a.txt'), 'A');
        const outside = join(root, 'outside');
        await mkdir(outside);
        await symlink(outside, join(storeRoot, 'mkt-link'));
        const dest = join(storeRoot, 'mkt-link', 'plugin', '1.0.0');

        await expect(safeFs.placePluginFiles(sourceRoot, dest)).rejects.toThrow(
          /escapes the plugin store/,
        );
        await expect(stat(join(outside, 'plugin', '1.0.0'))).rejects.toThrow();
      });
    });

    describe('when the plugin store root does not exist yet', () => {
      it('creates it and installs', async () => {
        await rm(storeRoot, { recursive: true, force: true });
        await writeFile(join(sourceRoot, 'a.txt'), 'A');

        const written = await safeFs.placePluginFiles(sourceRoot, destRoot);

        expect(written).toEqual([join(destRoot, 'a.txt')]);
        expect(await readFile(join(destRoot, 'a.txt'), 'utf8')).toBe('A');
      });
    });
  });

  describe('assertWithinStore', () => {
    describe('when the dir is inside the plugin store', () => {
      it('returns its real path', async () => {
        await mkdir(destRoot, { recursive: true });

        expect(await safeFs.assertWithinStore(destRoot)).toBe(destRoot);
      });
    });

    describe('when the dir is outside the plugin store', () => {
      it('throws', async () => {
        await expect(safeFs.assertWithinStore(sourceRoot)).rejects.toThrow(
          /outside the plugin store/,
        );
      });
    });

    describe('when the store root is reached through a symlink', () => {
      it('accepts a cached dir under the symlinked root', async () => {
        const linkedRoot = join(root, 'store-link');
        await symlink(storeRoot, linkedRoot);
        mockStoreRoot.mockReturnValue(linkedRoot);
        const dir = join(linkedRoot, 'mkt', 'plugin', '1.0.0');
        await mkdir(dir, { recursive: true });

        expect(await safeFs.assertWithinStore(dir)).toBe(join(storeRoot, 'mkt', 'plugin', '1.0.0'));
      });
    });

    describe('when the store root does not exist', () => {
      it('throws the containment error, not ENOENT', async () => {
        mockStoreRoot.mockReturnValue(join(root, 'missing-store'));
        await mkdir(destRoot, { recursive: true });

        await expect(safeFs.assertWithinStore(destRoot)).rejects.toThrow(
          /outside the plugin store/,
        );
      });
    });
  });

  describe('listCachedFiles', () => {
    describe('when the dir is inside the plugin store', () => {
      it('lists real files but not the .accessed marker', async () => {
        await mkdir(destRoot, { recursive: true });
        await writeFile(join(destRoot, 'a.txt'), 'A');
        await writeFile(join(destRoot, '.accessed'), '');

        const listed = await safeFs.listCachedFiles(destRoot);
        expect(listed).toEqual([join(destRoot, 'a.txt')]);
      });
    });

    describe('when the dir contains a preserved symlink', () => {
      it('lists the symlink alongside real files but not the .accessed marker', async () => {
        await mkdir(destRoot, { recursive: true });
        await writeFile(join(destRoot, 'real.txt'), 'real');
        await symlink('real.txt', join(destRoot, 'link.txt'));
        await writeFile(join(destRoot, '.accessed'), '');

        const listed = await safeFs.listCachedFiles(destRoot);
        expect([...listed].sort()).toEqual(
          [join(destRoot, 'real.txt'), join(destRoot, 'link.txt')].sort(),
        );
      });
    });

    describe('when the dir is outside the plugin store', () => {
      it('refuses to list it', async () => {
        await expect(safeFs.listCachedFiles(sourceRoot)).rejects.toThrow(
          /outside the plugin store/,
        );
      });
    });
  });

  describe('removeFiles', () => {
    describe('when the path is outside the plugin store', () => {
      it('refuses to remove it', async () => {
        const secret = join(root, 'secret.txt');
        await writeFile(secret, 'keep me');
        await safeFs.removeFiles([secret]);
        expect(await readFile(secret, 'utf8')).toBe('keep me');
      });
    });

    describe('when the file is inside the store', () => {
      it('removes it and prunes empty parents', async () => {
        await mkdir(destRoot, { recursive: true });
        const file = join(destRoot, 'a.txt');
        await writeFile(file, 'A');
        await safeFs.removeFiles([file]);
        await expect(readFile(file, 'utf8')).rejects.toThrow();
      });
    });

    describe('when given a real directory path', () => {
      it('refuses it with a warning, leaving its content intact', async () => {
        const logger = new NullLogger();
        const warnSpy = jest.spyOn(logger, 'warn');
        const warningFs = new DefaultSafePluginFs(logger);
        const dir = join(destRoot, 'sub');
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'keep.txt'), 'K');

        await warningFs.removeFiles([dir]);

        expect(await readFile(join(dir, 'keep.txt'), 'utf8')).toBe('K');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to remove'),
          expect.any(Error),
        );
      });
    });
  });

  // removeFiles uses a non-recursive rm, which can only unlink non-directory
  // entries (a real directory path would be refused with a warning and its
  // content left behind). These tests pin the invariant that both path
  // producers only ever emit non-directory paths, and that a produced list is
  // fully removable, so a future change to the walk/bookkeeping that starts
  // emitting directory paths fails here rather than silently breaking removal.
  describe('path producer / removeFiles contract', () => {
    let logger: NullLogger;
    let warnSpy: jest.SpyInstance;
    let contractFs: DefaultSafePluginFs;
    let mktRoot: string;
    let pluginDir: string;

    beforeEach(async () => {
      logger = new NullLogger();
      warnSpy = jest.spyOn(logger, 'warn');
      contractFs = new DefaultSafePluginFs(logger);
      // A tree exercising every kind of written entry: nested real dirs and
      // files, a preserved file symlink, and a preserved directory symlink.
      mktRoot = join(root, 'mkt-contract');
      pluginDir = join(mktRoot, 'plugins', 'p');
      await mkdir(join(pluginDir, 'skills', 'greet'), { recursive: true });
      await writeFile(join(pluginDir, 'plugin.json'), '{}');
      await writeFile(join(pluginDir, 'skills', 'greet', 'SKILL.md'), 'G');
      await symlink('skills/greet/SKILL.md', join(pluginDir, 'link.md'));
      await symlink('skills', join(pluginDir, 'linkdir'));
    });

    it('placePluginFiles and listCachedFiles only emit non-directory paths', async () => {
      const written = await contractFs.placePluginFiles(pluginDir, destRoot, {
        marketplaceRoot: mktRoot,
      });
      const listed = await contractFs.listCachedFiles(destRoot);

      expect(written.length).toBeGreaterThan(0);
      expect([...written].sort()).toEqual([...listed].sort());
      await Promise.all(
        [...written, ...listed].map(async (path) => {
          expect((await lstat(path)).isDirectory()).toBe(false);
        }),
      );
    });

    it('removeFiles fully removes a written list and empties the store, with no warnings', async () => {
      const written = await contractFs.placePluginFiles(pluginDir, destRoot, {
        marketplaceRoot: mktRoot,
      });

      await contractFs.removeFiles(written);

      await expect(stat(destRoot)).rejects.toThrow();
      expect(await readdir(storeRoot)).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
