import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial, writeArchive, parse } from '@gitlab-org/test-utils';
import { FileAccessService } from '@gitlab-org/fs';
import { getMockWorkflowToken } from '../../test_utils';
import { WorkflowAction } from '../clients/types';
import { CodeSnippetRanker, CodeSnippet, CodeSnippetScored } from '../../../code_insights/ranking';
import { DefaultRipgrepService, RipgrepService } from '../../../services/ripgrep_service';
import { NullRgBinaryProvider } from '../../../services/null_rg_binary_provider';
import { GrepActionHandler, GrepAction, GrepFormatter } from './grep';
import { testGit } from './test_utils/test_git';
import { WorkflowActionContext } from './index';

describe('GrepActionHandler', () => {
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let mockRanker: CodeSnippetRanker;
  let handler: GrepActionHandler;
  let tempDir: string;

  const createAction = (pattern: string, searchDirectory: string, caseInsensitive = false) =>
    createFakePartial<GrepAction>({
      grep: { pattern, search_directory: searchDirectory, case_insensitive: caseInsensitive },
    });

  const createContext = (workspacePath: string) =>
    createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: workspacePath,
      workflowToken: getMockWorkflowToken(),
    });

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'grep-test-'));
    mockLogger = new TestLogger();

    await writeArchive(
      tempDir,
      parse(
        `
-- src/main.ts --
export function searchPattern() {
  const searchPattern = true;
  return searchPattern;
}
-- src/utils.ts --
export function SearchPattern() {
  return 'FOUND';
}
-- src/nested/helper.ts --
export function helper() {
  return 'no match here';
}
-- uncommitted.ts --
export function searchPattern() {
  return 'uncommitted but has searchPattern';
}
-- long-file.ts --
const searchPattern = '${'x'.repeat(6000)}';
-- gaps.ts --
const searchPattern = 1;
${'const other = 0;\n'.repeat(15)}const searchPattern2 = 16;
-- ignored-dir/file.ts --
this should be ignored
-- .gitignore --
ignored-dir/
`,
      ),
    );

    const git = await testGit(tempDir);
    await git.add(['src/', 'long-file.ts', 'gaps.ts', '.gitignore']);
    await git.commit('Initial commit');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(() => {
    mockFileAccessService = createFakePartial<FileAccessService>({
      priority: 1,
      realPath: jest.fn().mockImplementation((filePath: string) => Promise.resolve(filePath)),
    });
    mockRanker = createFakePartial<CodeSnippetRanker>({
      rank: jest
        .fn()
        .mockImplementation(
          async (snippets: CodeSnippet[]): Promise<CodeSnippetScored[]> =>
            snippets.map((s) => [s, 1.0]),
        ),
    });
    handler = new GrepActionHandler(
      mockLogger,
      [mockFileAccessService],
      mockRanker,
      new DefaultRipgrepService(mockLogger, new NullRgBinaryProvider()),
    );
  });

  describe('canHandle', () => {
    it('returns true for grep actions and false for others', () => {
      expect(handler.canHandle(createAction('test', 'src'))).toBe(true);
      expect(handler.canHandle(createFakePartial<WorkflowAction>({ listDirectory: {} }))).toBe(
        false,
      );
    });
  });

  describe('execute', () => {
    it('finds matches and includes line range metadata', async () => {
      const result = await handler.execute(
        createAction('searchPattern', '.'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      expect(result.response).toContain('src/main.ts');
      expect(result.response).toContain('uncommitted.ts');
      expect(result.response).toMatch(/src\/main\.ts:\d+_\d+/);
    });

    it('includes a "Found N matches across M files" prefix line', async () => {
      const result = await handler.execute(
        createAction('searchPattern', '.'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      expect(result.response).toMatch(/^Found \d+ matches? across \d+ files?\n/);
    });

    it('excludes gitignored directories from results', async () => {
      const result = await handler.execute(createAction('ignored', '.'), createContext(tempDir));

      expect(result.error).toBe('');
      expect(result.response).not.toContain('ignored-dir');
    });

    describe('when results are truncated by the ranker limit', () => {
      beforeEach(() => {
        mockRanker = createFakePartial<CodeSnippetRanker>({
          rank: jest
            .fn()
            .mockImplementation(
              async (snippets: CodeSnippet[]): Promise<CodeSnippetScored[]> =>
                snippets.slice(0, 2).map((s) => [s, 1.0]),
            ),
        });
        handler = new GrepActionHandler(
          mockLogger,
          [mockFileAccessService],
          mockRanker,
          new DefaultRipgrepService(mockLogger, new NullRgBinaryProvider()),
        );
      });

      it('shows total count and truncation notice in prefix and suffix', async () => {
        const result = await handler.execute(
          createAction('searchPattern', '.'),
          createContext(tempDir),
        );

        expect(result.error).toBe('');
        expect(result.response).toMatch(
          /^Found \d+ matches? across \d+ files? \(showing first 2\)\n/,
        );
        expect(result.response).toContain('(Results truncated: showing 2 of');
        expect(result.response).toContain('Consider using a more specific path or pattern.)');
      });
    });

    it('handles case insensitive search', async () => {
      const result = await handler.execute(
        createAction('searchpattern', 'src', true),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      expect(result.response).toContain('src/main.ts');
      expect(result.response).toContain('searchPattern');
      expect(result.response).toContain('src/utils.ts');
      expect(result.response).toContain('SearchPattern');
    });

    it('returns "No matches found." when no matches found', async () => {
      const result = await handler.execute(
        createAction('nonexistent', 'src'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      expect(result.response).toBe('No matches found.\n');
    });

    it('searches in nested directories', async () => {
      const result = await handler.execute(createAction('helper', 'src'), createContext(tempDir));

      expect(result.error).toBe('');
      expect(result.response).toContain('src/nested/helper.ts');
    });

    it('handles multiple comma-separated search terms and calls ranker correctly', async () => {
      const result = await handler.execute(
        createAction('searchPattern,helper', 'src'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      expect(result.response).toContain('src/main.ts');
      expect(result.response).toContain('src/nested/helper.ts');
      expect(mockRanker.rank).toHaveBeenCalledWith(
        expect.any(Array),
        ['searchPattern', 'helper'],
        100,
      );

      const [snippets, searchTerms, topK] = (mockRanker.rank as jest.Mock).mock.calls[0];
      expect(snippets.length).toBeGreaterThan(0);
      expect(searchTerms).toEqual(['searchPattern', 'helper']);
      expect(topK).toBe(100);
    });

    it('trims snippets exceeding maximum length', async () => {
      const result = await handler.execute(
        createAction('searchPattern', '.'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');
      const longFileSnippet = result.response
        .split('\n')
        .find((line) => line.includes('long-file.ts'));
      expect(longFileSnippet).toBeDefined();
      expect(result.response).toContain('... (trimmed)');
    });

    it('groups consecutive lines into single snippet and separates non-consecutive matches', async () => {
      const result = await handler.execute(
        createAction('searchPattern', '.'),
        createContext(tempDir),
      );

      expect(result.error).toBe('');

      const mainSnippets = result.response.match(/src\/main\.ts:\d+_\d+/g);
      expect(mainSnippets).toHaveLength(1);

      const gapSnippets = result.response.match(/gaps\.ts:\d+_\d+/g);
      expect(gapSnippets?.length).toBeGreaterThan(1);
    });

    it('rejects a search directory that escapes the workspace', async () => {
      const result = await handler.execute(
        createAction('test', '../outside-repo'),
        createContext(tempDir),
      );
      expect(result.error).toContain('outside the workspace folder');
      expect(result.response).toBe('');
    });

    it('rejects a gitignored search directory', async () => {
      const result = await handler.execute(
        createAction('test', 'ignored-dir'),
        createContext(tempDir),
      );
      expect(result.error).toMatch(/excluded by \.gitignore/);
      expect(result.response).toBe('');
    });

    it('searches a directory that is NOT a git repository', async () => {
      const plainDir = await fs.mkdtemp(path.join(tmpdir(), 'grep-no-repo-'));
      try {
        await writeArchive(
          plainDir,
          parse(`
-- a.ts --
export function plainPattern() {}
`),
        );

        const result = await handler.execute(
          createAction('plainPattern', '.'),
          createContext(plainDir),
        );

        expect(result.error).toBe('');
        expect(result.response).toContain('a.ts');
      } finally {
        await fs.rm(plainDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('reports workspace-relative paths for a nested repo without nesting them under the repo root', async () => {
      const workspaceDir = await fs.mkdtemp(path.join(tmpdir(), 'workspace-'));

      try {
        await writeArchive(
          workspaceDir,
          parse(
            `
-- nested-repo/src/feature.ts --
export function nestedPattern() {}
-- nested-repo/other.ts --
export function nestedPattern() {}
`,
          ),
        );

        await testGit(path.join(workspaceDir, 'nested-repo'));

        const result = await handler.execute(
          createAction('nestedPattern', 'nested-repo/src'),
          createContext(workspaceDir),
        );

        expect(result.error).toBe('');
        expect(result.response).toContain('nested-repo/src/feature.ts');
        expect(result.response).not.toContain('other.ts');
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('returns the virtual-workspace message for virtual filesystem workspaces', async () => {
      const result = await handler.execute(createAction('searchPattern', '.'), {
        ...createContext(tempDir),
        workspaceFolderUri: 'adt://server/sap/bc/adt/packages/zmy_package',
      });

      expect(result.response).toBe('');
      expect(result.error).toContain('grep is not supported for virtual filesystem workspaces');
    });

    describe('when ripgrep returns duplicate (path, line) entries across result keys', () => {
      beforeEach(() => {
        const duplicateRipgrep = createFakePartial<RipgrepService>({
          isAvailable: jest.fn().mockResolvedValue(true),
          grep: jest.fn().mockResolvedValue({
            paths: new Set(['src/main.ts']),
            results: {
              key1: [{ path: 'src/main.ts', line: 1, preview: 'export function searchPattern()' }],
              key2: [{ path: 'src/main.ts', line: 1, preview: 'export function searchPattern()' }],
            },
          }),
        });
        handler = new GrepActionHandler(
          mockLogger,
          [mockFileAccessService],
          mockRanker,
          duplicateRipgrep,
        );
      });

      it('deduplicates matches with the same path and line number', async () => {
        const result = await handler.execute(
          createAction('searchPattern', 'src'),
          createContext(tempDir),
        );

        expect(result.error).toBe('');
        expect(result.response).toMatch(/^Found 1 match across 1 file\n/);
      });
    });

    describe('when ripgrep is not available', () => {
      beforeEach(() => {
        const unavailableRipgrep = createFakePartial<RipgrepService>({
          isAvailable: jest.fn().mockResolvedValue(false),
          grep: jest.fn(),
        });
        handler = new GrepActionHandler(
          mockLogger,
          [mockFileAccessService],
          mockRanker,
          unavailableRipgrep,
        );
      });

      it('returns an error indicating ripgrep is unavailable', async () => {
        const result = await handler.execute(
          createAction('searchPattern', 'src'),
          createContext(tempDir),
        );

        expect(result.response).toBe('');
        expect(result.error).toContain('ripgrep');
      });
    });
  });
});

describe('GrepFormatter', () => {
  let formatter: GrepFormatter;

  beforeEach(() => {
    formatter = new GrepFormatter();
  });

  it('maps pattern with optional fields', () => {
    expect(
      formatter.format({
        pattern: 'TODO',
        search_directory: 'src',
        case_insensitive: true,
      }),
    ).toEqual({
      tool: 'grep',
      pattern: 'TODO',
      directory: 'src',
      caseInsensitive: true,
    });
  });

  it('falls back to keywords when pattern is absent', () => {
    expect(formatter.format({ keywords: 'fixme' })).toEqual({
      tool: 'grep',
      pattern: 'fixme',
      directory: undefined,
      caseInsensitive: undefined,
    });
  });

  it.each([
    ['neither pattern nor keywords', {}],
    ['pattern a number', { pattern: 42 }],
    ['case_insensitive a string', { pattern: 'x', case_insensitive: 'yes' }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
