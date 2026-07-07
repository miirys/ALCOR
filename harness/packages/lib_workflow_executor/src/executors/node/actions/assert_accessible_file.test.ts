import { promises as fs, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial, writeArchive, parse } from '@gitlab-org/test-utils';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { FallbackFileAccessService } from '../fallback_file_access_service';
import { testGit } from './test_utils/test_git';
import { assertAccessibleFile } from './assert_accessible_file';

describe('assertAccessibleFile', () => {
  let mockLogger: Logger;
  let mockFileAccessService: FallbackFileAccessService;

  // Resolve symlinks the way the production FileAccessService does, so /tmp on
  // macOS (a symlink to /private/tmp) does not spuriously fail containment.
  const realPath = (p: string): Promise<string> => {
    try {
      return Promise.resolve(realpathSync(p));
    } catch {
      return Promise.resolve(p);
    }
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FallbackFileAccessService>({
      realPath: jest.fn().mockImplementation(realPath),
    });
  });

  describe('virtual workspaces', () => {
    it('skips all validation for a virtual workspace URI', async () => {
      const uri = 'adt://server/sap/bc/adt/packages/zmy_package';
      await expect(
        assertAccessibleFile('file.ts', '/some/workspace', mockFileAccessService, mockLogger, uri),
      ).resolves.toBe(path.join('/some/workspace', 'file.ts'));
      expect(mockFileAccessService.realPath).not.toHaveBeenCalled();
    });
  });

  describe('with a real filesystem workspace', () => {
    let tempDir: string;

    afterEach(async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    describe('in a directory that is NOT a git repository', () => {
      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'accessible-no-repo-'));
        await writeArchive(
          tempDir,
          parse(`
-- keep.ts --
keep
-- .gitignore --
keep.ts
`),
        );
      });

      it('allows a contained file even when .gitignore matches it (no repo, no in-repo requirement)', async () => {
        await expect(
          assertAccessibleFile('keep.ts', tempDir, mockFileAccessService, mockLogger),
        ).resolves.toBe(await realPath(path.join(tempDir, 'keep.ts')));
      });
    });

    describe('in a git repository', () => {
      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'accessible-repo-'));
        await testGit(tempDir);
        await writeArchive(
          tempDir,
          parse(`
-- secret.ts --
secret
-- .gitignore --
secret.ts
`),
        );
      });

      it('rejects a .gitignored file', async () => {
        await expect(
          assertAccessibleFile('secret.ts', tempDir, mockFileAccessService, mockLogger),
        ).rejects.toThrow(/excluded by \.gitignore/);
      });
    });

    describe('path containment', () => {
      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'accessible-contain-'));
        await writeArchive(
          tempDir,
          parse(`
-- inside.ts --
inside
`),
        );
      });

      it('rejects a path escaping with ../', async () => {
        await expect(
          assertAccessibleFile('../escape.ts', tempDir, mockFileAccessService, mockLogger),
        ).rejects.toThrow(/outside the workspace folder/);
      });

      it('rejects a symlink that points outside the workspace', async () => {
        const outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'accessible-outside-'));
        try {
          await fs.writeFile(path.join(outsideDir, 'target.ts'), 'target');
          await fs.symlink(
            path.join(outsideDir, 'target.ts'),
            path.join(tempDir, 'link.ts'),
            'file',
          );

          await expect(
            assertAccessibleFile('link.ts', tempDir, mockFileAccessService, mockLogger),
          ).rejects.toThrow(/outside the workspace folder/);
        } finally {
          await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
        }
      });
    });

    it('throws when the workspace folder cannot be resolved', async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), 'accessible-unresolved-'));
      jest.mocked(mockFileAccessService.realPath).mockImplementation(async (p: string) => {
        if (p === tempDir) return '';
        return realPath(p);
      });

      await expect(
        assertAccessibleFile('file.ts', tempDir, mockFileAccessService, mockLogger),
      ).rejects.toThrow(/Workspace folder path could not be resolved/);
    });

    // New-file targets (leaf does NOT exist yet), against the REAL
    // FsFileAccessService so genuine ENOENT symlink resolution is exercised.
    describe('new (not-yet-existing) targets with the real FsFileAccessService', () => {
      let realFileAccessService: FallbackFileAccessService;

      beforeEach(async () => {
        realFileAccessService = new FsFileAccessService();
        tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'accessible-new-')));
      });

      it('allows a nonexistent target inside the workspace and resolves it within', async () => {
        const resolved = await assertAccessibleFile(
          'new/file.txt',
          tempDir,
          realFileAccessService,
          mockLogger,
        );
        expect(resolved === tempDir || resolved.startsWith(tempDir + path.sep)).toBe(true);
      });

      it('rejects a nonexistent target under a parent symlinked out of the workspace', async () => {
        const outsideDir = await fs.realpath(
          await fs.mkdtemp(path.join(tmpdir(), 'accessible-new-outside-')),
        );
        try {
          await fs.symlink(outsideDir, path.join(tempDir, 'link-dir'), 'dir');

          await expect(
            assertAccessibleFile(
              'link-dir/newfile.txt',
              tempDir,
              realFileAccessService,
              mockLogger,
            ),
          ).rejects.toThrow(/outside the workspace folder/);
        } finally {
          await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
        }
      });
    });
  });
});
