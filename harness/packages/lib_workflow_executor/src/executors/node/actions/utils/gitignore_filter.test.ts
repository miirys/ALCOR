import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeArchive, parse } from '@gitlab-org/test-utils';
import { testGit, TestGitRepo } from '../test_utils/test_git';
import { findIgnoredPaths, isIgnoredPath } from './gitignore_filter';

describe('gitignore_filter', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // macOS points $TMPDIR at a symlink (/var -> /private/var). git returns the
  // canonical form, so resolve the temp root once so inputs and outputs compare.
  const abs = (...segments: string[]) => path.join(tempDir, ...segments);

  const mkTempRepo = async (prefix: string): Promise<TestGitRepo> => {
    tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), prefix)));
    return testGit(tempDir);
  };

  describe('when inside a git repository', () => {
    beforeEach(async () => {
      await mkTempRepo('gitignore-filter-repo-');
      await writeArchive(
        tempDir,
        parse(`
-- .gitignore --
*.log
-- keep.ts --
keep
-- app.log --
log
`),
      );
    });

    it('reports top-level gitignored files', async () => {
      const ignored = await findIgnoredPaths([abs('app.log'), abs('keep.ts')]);
      expect(ignored).toEqual([abs('app.log')]);
    });

    it('returns an empty array for an empty input', async () => {
      expect(await findIgnoredPaths([])).toEqual([]);
    });
  });

  describe('when a child .gitignore negates a parent rule', () => {
    beforeEach(async () => {
      await mkTempRepo('gitignore-filter-negate-');
      await writeArchive(
        tempDir,
        parse(`
-- .gitignore --
*.log
-- sub/.gitignore --
!keep.log
-- sub/keep.log --
keep
-- sub/other.log --
other
`),
      );
    });

    it('honours a child negation over a parent ignore rule', async () => {
      expect(await isIgnoredPath(abs('sub/keep.log'))).toBe(false);
      expect(await isIgnoredPath(abs('sub/other.log'))).toBe(true);
    });
  });

  describe('when a file is tracked in the index despite matching .gitignore', () => {
    beforeEach(async () => {
      const git = await mkTempRepo('gitignore-filter-tracked-');
      await writeArchive(
        tempDir,
        parse(`
-- .gitignore --
*.log
-- tracked.log --
tracked
-- untracked.log --
untracked
`),
      );
      // Force-add past .gitignore so the file is index-tracked.
      await git.raw(['add', '-f', 'tracked.log']);
      await git.commit('add tracked.log');
    });

    it('does not report an index-tracked file as ignored', async () => {
      expect(await isIgnoredPath(abs('tracked.log'))).toBe(false);
      expect(await isIgnoredPath(abs('untracked.log'))).toBe(true);
    });
  });

  describe('when NOT inside a git repository', () => {
    beforeEach(async () => {
      tempDir = await fs.realpath(
        await fs.mkdtemp(path.join(tmpdir(), 'gitignore-filter-norepo-')),
      );
      await writeArchive(
        tempDir,
        parse(`
-- .gitignore --
*.log
-- app.log --
log
-- keep.ts --
keep
`),
      );
    });

    it('does not treat anything as ignored and does not error (matches ripgrep default)', async () => {
      const ignored = await findIgnoredPaths([abs('app.log'), abs('keep.ts')]);
      expect(ignored).toEqual([]);
      expect(await isIgnoredPath(abs('app.log'))).toBe(false);
    });
  });

  describe('when the workspace folder is a sub-directory of a repository', () => {
    let repoRoot: string;
    let workspace: string;

    beforeEach(async () => {
      repoRoot = await fs.realpath(
        await fs.mkdtemp(path.join(tmpdir(), 'gitignore-filter-ancestor-')),
      );
      await testGit(repoRoot);
      await writeArchive(
        repoRoot,
        parse(`
-- .gitignore --
*.log
-- pkg/app.log --
log
-- pkg/keep.ts --
keep
`),
      );
      workspace = path.join(repoRoot, 'pkg');
    });

    afterEach(async () => {
      await fs.rm(repoRoot, { recursive: true, force: true }).catch(() => {});
    });

    it('honours .gitignore from the ancestor repository root', async () => {
      const ignored = await findIgnoredPaths([
        path.join(workspace, 'app.log'),
        path.join(workspace, 'keep.ts'),
      ]);
      expect(ignored).toEqual([path.join(workspace, 'app.log')]);
    });
  });
});
