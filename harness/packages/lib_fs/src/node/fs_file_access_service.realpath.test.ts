import { mkdtemp, mkdir, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { FsFileAccessService } from './fs_file_access_service';

/**
 * Real-filesystem tests for {@link FsFileAccessService.realPath}. A separate file
 * because the sibling `fs_file_access_service.test.ts` mocks `node:fs`, so it
 * cannot exercise the real symlink resolution these cases need.
 */

/**
 * Copy of `isPathContainedIn` from the workflow executor's path_containment util,
 * to keep `lib_fs` free of a dependency on `lib_workflow_executor`.
 */
function isPathContainedIn(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

describe('FsFileAccessService.realPath (real filesystem)', () => {
  let service: FsFileAccessService;
  let workspace: string;
  let outside: string;

  beforeEach(async () => {
    service = new FsFileAccessService();
    // `realpath` the temp roots so macOS `/var` -> `/private/var` symlinking
    // does not make otherwise-correct results look "outside" the workspace.
    workspace = await realpath(await mkdtemp(join(tmpdir(), 'lsp-fs-ws-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'lsp-fs-out-')));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('resolves a relative in-workspace symlink to the correct absolute path (regression)', async () => {
    const realDir = join(workspace, 'realdir');
    await mkdir(realDir);
    const link = join(workspace, 'inside-link');
    await symlink('./realdir', link);

    const resolved = await service.realPath(link);

    expect(resolved).toBe(realDir);
    expect(isPathContainedIn(workspace, resolved)).toBe(true);
  });

  it('resolves an absolute in-workspace symlink correctly (unchanged behavior)', async () => {
    const realDir = join(workspace, 'realdir');
    await mkdir(realDir);
    const link = join(workspace, 'abs-link');
    await symlink(realDir, link);

    const resolved = await service.realPath(link);

    expect(resolved).toBe(realDir);
    expect(isPathContainedIn(workspace, resolved)).toBe(true);
  });

  it('resolves a relative escaping symlink to an outside path that the guard rejects (security)', async () => {
    const target = join(outside, 'secret');
    await mkdir(target);
    const link = join(workspace, 'escape-link');
    const relToOutside = relative(workspace, target);
    await symlink(relToOutside, link);

    const resolved = await service.realPath(link);

    expect(resolved).toBe(target);
    expect(isPathContainedIn(workspace, resolved)).toBe(false);
  });

  it('returns the best-resolved path for a non-existent leaf inside the workspace (write/mkdir target)', async () => {
    // Parent exists, leaf does not: ENOENT must still yield a path for new-file callers.
    const newFile = join(workspace, 'does-not-exist.txt');

    const resolved = await service.realPath(newFile);

    expect(resolved).toBe(newFile);
    expect(isPathContainedIn(workspace, resolved)).toBe(true);
  });

  it('returns the best-resolved (outside) path for a dangling relative symlink so the caller rejects', async () => {
    const link = join(workspace, 'dangling-link');
    await symlink('../nonexistent-target', link);

    const resolved = await service.realPath(link);

    // ENOENT yields the best-resolved (dangling, outside) path, which the guard rejects.
    expect(resolved).not.toBe('');
    expect(isPathContainedIn(workspace, resolved)).toBe(false);
  });

  it('terminates on a relative symlink loop and yields a rejectable result (no infinite recursion)', async () => {
    const a = join(workspace, 'a');
    const b = join(workspace, 'b');
    // a -> b -> a: the cycle must be broken, not recursed forever.
    await symlink('./b', a);
    await symlink('./a', b);

    const resolved = await service.realPath(a);

    // ELOOP is not ENOENT/ENOTDIR, so realPath returns '' -> caller rejects.
    expect(resolved).toBe('');
  });
});
