import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rgPath as packagedRgPath } from '@vscode/ripgrep';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial, writeArchive, parse } from '@gitlab-org/test-utils';
import { DefaultRipgrepService, RipgrepService } from '../../../services/ripgrep_service';
import { NullRgBinaryProvider } from '../../../services/null_rg_binary_provider';
import { WorkflowAction } from '../clients/types';
import { FindFilesAction, FindFilesActionHandler, FindFilesFormatter } from './find_files';
import { testGit } from './test_utils/test_git';
import { WorkflowActionContext } from './index';

function isBinaryAvailableSync(binary: string): boolean {
  try {
    execFileSync(binary, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ripgrepAvailable = isBinaryAvailableSync(packagedRgPath) || isBinaryAvailableSync('rg');
const describeIfRg = ripgrepAvailable ? describe : describe.skip;

describe('FindFilesActionHandler', () => {
  let mockLogger: TestLogger;

  const createRipgrepService = (): RipgrepService =>
    new DefaultRipgrepService(mockLogger, new NullRgBinaryProvider());

  beforeEach(() => {
    mockLogger = new TestLogger();
  });

  describe('canHandle', () => {
    it('returns true for findFiles actions', () => {
      const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
      const action = createFakePartial<WorkflowAction>({
        findFiles: { name_pattern: '*.ts' },
      });

      expect(handler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(handler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), 'find-files-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('returns an error when ripgrep is unavailable', async () => {
      const unavailable = createFakePartial<RipgrepService>({
        isAvailable: jest.fn().mockResolvedValue(false),
      });
      const handler = new FindFilesActionHandler(mockLogger, unavailable);
      const context = createFakePartial<WorkflowActionContext>({ workspaceFolderPath: tempDir });

      const result = await handler.execute(
        createFakePartial<FindFilesAction>({ findFiles: { name_pattern: '*.ts' } }),
        context,
      );

      expect(result.error).toContain('ripgrep');
      expect(result.response).toBe('');
    });

    describeIfRg('with ripgrep available', () => {
      it('finds files matching the glob in a git repository', async () => {
        await testGit(tempDir);
        await writeArchive(
          tempDir,
          parse(`
-- src/main.ts --
main application
-- src/other.js --
not a match
`),
        );

        const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
        const context = createFakePartial<WorkflowActionContext>({ workspaceFolderPath: tempDir });
        const action = createFakePartial<FindFilesAction>({
          findFiles: { name_pattern: '*.ts' },
        });

        const result = await handler.execute(action, context);

        expect(result.error).toBe('');
        expect(result.response.split('\n').filter(Boolean)).toEqual(['src/main.ts']);
      });

      it('finds files in a directory that is NOT a git repository', async () => {
        await writeArchive(
          tempDir,
          parse(`
-- notes.ts --
plain dir file
`),
        );

        const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
        const context = createFakePartial<WorkflowActionContext>({ workspaceFolderPath: tempDir });
        const action = createFakePartial<FindFilesAction>({
          findFiles: { name_pattern: '*.ts' },
        });

        const result = await handler.execute(action, context);

        expect(result.error).toBe('');
        expect(result.response.split('\n').filter(Boolean)).toEqual(['notes.ts']);
      });

      it('excludes .gitignored files when inside a repository', async () => {
        await testGit(tempDir);
        await writeArchive(
          tempDir,
          parse(`
-- keep.ts --
keep
-- ignored.ts --
ignore me
-- .gitignore --
ignored.ts
`),
        );

        const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
        const context = createFakePartial<WorkflowActionContext>({ workspaceFolderPath: tempDir });
        const action = createFakePartial<FindFilesAction>({
          findFiles: { name_pattern: '*.ts' },
        });

        const result = await handler.execute(action, context);

        expect(result.error).toBe('');
        const files = result.response.split('\n').filter(Boolean);
        expect(files).toContain('keep.ts');
        expect(files).not.toContain('ignored.ts');
      });

      // Regression: ripgrep must confine globs to the workspace root (find_files has no containment check of its own).
      it('cannot escape the workspace root via malicious glob patterns', async () => {
        const workspaceDir = path.join(tempDir, 'workspace');
        await writeArchive(
          workspaceDir,
          parse(`
-- inside.txt --
inside the workspace
`),
        );
        // A sibling file OUTSIDE the workspace root that escape patterns might target.
        const outsidePath = path.join(tempDir, 'outside.txt');
        await fs.writeFile(outsidePath, 'outside the workspace');

        const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
        const context = createFakePartial<WorkflowActionContext>({
          workspaceFolderPath: workspaceDir,
        });

        const escapePatterns = ['../*', '../*.txt', '../outside.txt', '/etc/*', outsidePath];

        for (const namePattern of escapePatterns) {
          // eslint-disable-next-line no-await-in-loop
          const result = await handler.execute(
            createFakePartial<FindFilesAction>({ findFiles: { name_pattern: namePattern } }),
            context,
          );

          expect(result.error).toBe('');
          const files = result.response.split('\n').filter(Boolean);
          expect(files).not.toContain('outside.txt');
          expect(files.some((file) => file.includes('..'))).toBe(false);
          expect(files.some((file) => path.isAbsolute(file))).toBe(false);
        }
      });

      it('lists .gitignore-matching files in a plain (non-repo) directory', async () => {
        await writeArchive(
          tempDir,
          parse(`
-- keep.ts --
keep
-- ignored.ts --
not actually ignored without a repo
-- .gitignore --
ignored.ts
`),
        );

        const handler = new FindFilesActionHandler(mockLogger, createRipgrepService());
        const context = createFakePartial<WorkflowActionContext>({ workspaceFolderPath: tempDir });
        const action = createFakePartial<FindFilesAction>({
          findFiles: { name_pattern: '*.ts' },
        });

        const result = await handler.execute(action, context);

        expect(result.error).toBe('');
        const files = result.response.split('\n').filter(Boolean);
        expect(files.sort()).toEqual(['ignored.ts', 'keep.ts']);
      });
    });
  });
});

describe('FindFilesFormatter', () => {
  let formatter: FindFilesFormatter;

  beforeEach(() => {
    formatter = new FindFilesFormatter();
  });

  it('maps a valid name_pattern to the find_files display', () => {
    expect(formatter.format({ name_pattern: '**/*.ts' })).toEqual({
      tool: 'find_files',
      pattern: '**/*.ts',
    });
  });

  it.each([
    ['name_pattern missing', {}],
    ['name_pattern undefined', { name_pattern: undefined }],
    ['name_pattern null', { name_pattern: null }],
    ['name_pattern a number', { name_pattern: 42 }],
    ['name_pattern an array', { name_pattern: ['a'] }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
