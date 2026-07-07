import { promises as fs, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { createFakePartial, writeArchive, parse } from '@gitlab-org/test-utils';
import { WorkflowAction } from '../clients/types';
import {
  ListDirectoryAction,
  ListDirectoryActionHandler,
  ListDirectoryFormatter,
} from './list_directory';
import { testGit } from './test_utils/test_git';
import { WorkflowActionContext } from './index';

describe('ListDirectoryActionHandler', () => {
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;

  // realpath both args so containment checks behave the same as production
  // (macOS resolves /tmp -> /private/tmp).
  const realPathFor = (p: string): Promise<string> => {
    try {
      return Promise.resolve(realpathSync(p));
    } catch {
      return Promise.resolve(p);
    }
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      priority: 1,
      realPath: jest.fn().mockImplementation(realPathFor),
    });
  });

  const createHandler = () => new ListDirectoryActionHandler(mockLogger, [mockFileAccessService]);

  describe('canHandle', () => {
    it('returns true for listDirectory actions', () => {
      const action = createFakePartial<WorkflowAction>({
        listDirectory: { directory: 'src' },
      });
      expect(createHandler().canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;
      expect(createHandler().canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let tempDir: string;

    const contextFor = (workspacePath: string) =>
      createFakePartial<WorkflowActionContext>({ workspaceFolderPath: workspacePath });

    const actionFor = (directory: string) =>
      createFakePartial<ListDirectoryAction>({ listDirectory: { directory } });

    afterEach(async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    describe('in a git repository', () => {
      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'list-directory-test-'));
        const git = await testGit(tempDir);
        await writeArchive(
          tempDir,
          parse(`
-- .gitignore --
node_modules/
*.log
ignored-dir/
-- src/tracked-file.js --
tracked content
-- src/untracked-file.ts --
untracked content
-- src/debug.log --
should be ignored
-- src/components/Component.jsx --
component
-- ignored-dir/file1.txt --
ignored content
`),
        );
        await git.add(['src/tracked-file.js', '.gitignore']);
        await git.commit('Initial commit');
      });

      it('returns error when trying to list a gitignored directory', async () => {
        const result = await createHandler().execute(actionFor('ignored-dir'), contextFor(tempDir));

        expect(result.error).toContain('excluded by .gitignore');
        expect(result.response).toBe('');
      });

      it('lists contents, marks subdirectories, and excludes gitignored entries', async () => {
        const result = await createHandler().execute(actionFor('src'), contextFor(tempDir));

        expect(result.error).toBe('');
        const items = result.response.split('\n').filter(Boolean);
        expect(items.sort()).toEqual(
          ['tracked-file.js', 'untracked-file.ts', 'components/'].sort(),
        );
      });

      it('rejects a path that escapes the workspace with ../', async () => {
        const result = await createHandler().execute(actionFor('../'), contextFor(tempDir));

        expect(result.error).toContain('outside the workspace folder');
        expect(result.response).toBe('');
      });

      it('rejects a symlink that points outside the workspace', async () => {
        const outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'list-outside-'));
        try {
          await fs.symlink(outsideDir, path.join(tempDir, 'escape-link'), 'dir');
          const result = await createHandler().execute(
            actionFor('escape-link'),
            contextFor(tempDir),
          );

          expect(result.error).toContain('outside the workspace folder');
          expect(result.response).toBe('');
        } finally {
          await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
        }
      });
    });

    describe('in a directory that is NOT a git repository', () => {
      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'list-no-repo-'));
        await writeArchive(
          tempDir,
          parse(`
-- .gitignore --
ignored.txt
-- keep.txt --
keep
-- ignored.txt --
not ignored without a repo
-- sub/file.ts --
nested
`),
        );
      });

      it('lists all entries (gitignore is not applied outside a repo)', async () => {
        const result = await createHandler().execute(actionFor('.'), contextFor(tempDir));

        expect(result.error).toBe('');
        const items = result.response.split('\n').filter(Boolean);
        expect(items.sort()).toEqual(['.gitignore', 'ignored.txt', 'keep.txt', 'sub/'].sort());
      });
    });
  });
});

describe('ListDirectoryFormatter', () => {
  let formatter: ListDirectoryFormatter;

  beforeEach(() => {
    formatter = new ListDirectoryFormatter();
  });

  it('maps a valid directory to the list_dir display', () => {
    expect(formatter.format({ directory: 'src' })).toEqual({
      tool: 'list_dir',
      directory: 'src',
    });
  });

  it.each([
    ['directory missing', {}],
    ['directory a number', { directory: 42 }],
    ['directory null', { directory: null }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
