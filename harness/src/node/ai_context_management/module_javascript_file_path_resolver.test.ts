import type { Stats } from 'fs';
import path from 'path';
import { type Resolver, ResolverFactory } from 'enhanced-resolve';
import ts from 'typescript';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { RepositoryService, Repository } from '@gitlab-org/repositories';
import { fsPathToUri } from '@gitlab-org/fs';
import type {
  IDocContext,
  ExtendedPromiseFsClient,
  FsClient,
  JavascriptImportStore,
  TsConfigStore,
} from '@gitlab-org/legacy-common';

import { ModuleJavaScriptFilePathResolver } from './module_javascript_file_path_resolver';

jest.mock('builtin-modules', () => ['crypto', 'node:crypto', 'fs', 'node:fs', 'path', 'node:path']);
jest.mock('enhanced-resolve', () => ({
  ResolverFactory: {
    createResolver: jest.fn(),
  },
}));

describe('ModuleJavaScriptFilePathResolver', () => {
  let moduleFilePathResolver: ModuleJavaScriptFilePathResolver;
  let mockLogger: Logger;
  let mockFsClient: FsClient;
  let mockImportStore: JavascriptImportStore;
  let mockTsConfigStore: TsConfigStore;
  let mockRepositoryService: RepositoryService;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockResolver: Resolver;

  const WORKSPACE_PATH = path.resolve('/workspace');
  const WORKSPACE_URI = fsPathToUri(WORKSPACE_PATH).toString();

  // Helper function to normalize paths for cross-platform testing
  const normalizePath = (p: string) => {
    const normalized = path.normalize(p);
    return process.platform === 'win32' ? normalized.replace(/^[A-Z]:/i, '') : normalized;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockLogger = new TestLogger();

    mockWorkspaceFolder = {
      uri: WORKSPACE_URI,
      name: 'workspace',
    };

    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<ExtendedPromiseFsClient['promises']>({
        readFile: jest.fn().mockResolvedValue(Buffer.from('')),
        readdir: jest.fn().mockResolvedValue([]),
        stat: jest.fn().mockResolvedValue(
          createFakePartial<Stats>({
            isFile: () => true,
            isDirectory: () => false,
          }),
        ),
        lstat: jest.fn().mockResolvedValue(
          createFakePartial<Stats>({
            isFile: () => true,
            isDirectory: () => false,
          }),
        ),
      }),
    });

    mockImportStore = createFakePartial<JavascriptImportStore>({
      getResolvedModule: jest.fn(),
      setResolvedModule: jest.fn(),
    });

    mockTsConfigStore = createFakePartial<TsConfigStore>({
      findApplicableConfig: jest.fn(),
    });

    mockRepositoryService = createFakePartial<RepositoryService>({
      getMatchingRepository: jest.fn(),
    });

    mockResolver = createFakePartial<Resolver>({
      resolve: jest.fn(),
    });

    jest.mocked(ResolverFactory.createResolver).mockReturnValue(mockResolver);

    moduleFilePathResolver = new ModuleJavaScriptFilePathResolver(
      mockLogger,
      mockFsClient,
      mockImportStore,
      mockTsConfigStore,
      mockRepositoryService,
    );
  });

  const createMockDocContext = (uri: string): IDocContext => ({
    uri,
    fileRelativePath: 'test.ts',
    languageId: 'typescript',
    position: { line: 1, character: 1 },
    prefix: '',
    suffix: '',
    workspaceFolder: mockWorkspaceFolder,
  });

  describe('canResolve', () => {
    it('should return true for non-relative module paths', () => {
      expect(moduleFilePathResolver.canResolve('foo')).toBe(true);
      expect(moduleFilePathResolver.canResolve('~foo')).toBe(true);
      expect(moduleFilePathResolver.canResolve('@foo/bar')).toBe(true);
      expect(moduleFilePathResolver.canResolve('foo/bar')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(moduleFilePathResolver.canResolve('./foo')).toBe(false);
      expect(moduleFilePathResolver.canResolve('../foo')).toBe(false);
      expect(moduleFilePathResolver.canResolve('.')).toBe(false);
    });
  });

  describe('resolveImportPath', () => {
    it('should return null when no workspace folder is provided', async () => {
      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));

      const result = await moduleFilePathResolver.resolveImportPath({
        importPath: '@foo/bar',
        sourceDocumentUri,
        sourceDocumentContext: {
          ...createMockDocContext(sourceDocumentUri.toString()),
          workspaceFolder: undefined,
        },
      });

      expect(result).toBeNull();
    });

    describe('cache handling', () => {
      it('should return cached result when available', async () => {
        const cachedUri = fsPathToUri(path.join(WORKSPACE_PATH, 'node_modules', '@foo', 'bar.ts'));
        jest.mocked(mockImportStore.getResolvedModule).mockReturnValue(cachedUri);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await moduleFilePathResolver.resolveImportPath({
          importPath: '@foo/bar',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(result).toBe(cachedUri);
        expect(mockResolver.resolve).not.toHaveBeenCalled();
      });

      it('should cache resolved path after successful resolution', async () => {
        jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(null);
        jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(undefined);
        const resolvedPath = path.join(WORKSPACE_PATH, 'node_modules', '@foo', 'bar.ts');
        jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
          callback(null, resolvedPath);
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const context = createMockDocContext(sourceDocumentUri.toString());
        await moduleFilePathResolver.resolveImportPath({
          importPath: '@foo/bar',
          sourceDocumentUri,
          sourceDocumentContext: context,
        });

        expect(mockImportStore.setResolvedModule).toHaveBeenCalledWith(
          context.workspaceFolder?.uri,
          '@foo/bar',
          fsPathToUri(resolvedPath),
        );
      });
    });

    describe('resolution', () => {
      beforeEach(() => {
        jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(null);
        jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(undefined);
      });

      it('should resolve module path using enhanced-resolve', async () => {
        const resolvedPath = path.join(WORKSPACE_PATH, 'node_modules', '@foo', 'bar.ts');
        jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
          callback(null, resolvedPath);
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await moduleFilePathResolver.resolveImportPath({
          importPath: '@foo/bar',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(resolvedPath));
      });

      it('should return null when enhanced-resolve returns error', async () => {
        jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
          callback(new Error('Module not found'), undefined);
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await moduleFilePathResolver.resolveImportPath({
          importPath: '@foo/bar',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(result).toBeNull();
      });

      it('should return null when enhanced-resolve returns no path', async () => {
        jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
          callback(null, undefined);
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await moduleFilePathResolver.resolveImportPath({
          importPath: '@foo/bar',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(result).toBeNull();
      });

      describe('Node.js built-in module resolution', () => {
        beforeEach(() => {
          jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(null);
          jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(undefined);
        });

        it('should attempt to resolve built-in Node.js modules to @types/node definitions', async () => {
          const resolvedTypesPath = path.join(
            WORKSPACE_PATH,
            'node_modules',
            '@types',
            'node',
            'fs.d.ts',
          );
          jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
            callback(null, resolvedTypesPath);
          });

          const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
          const result = await moduleFilePathResolver.resolveImportPath({
            importPath: 'fs',
            sourceDocumentUri,
            sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
          });

          expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(resolvedTypesPath));

          expect(ResolverFactory.createResolver).toHaveBeenCalledWith(
            expect.objectContaining({
              alias: expect.arrayContaining([
                { name: 'fs', alias: ['@types/node/fs.d.ts'] },
                { name: 'node:fs', alias: ['@types/node/fs.d.ts'] },
              ]),
            }),
          );
        });

        it('should handle `node:` prefixed built-in modules', async () => {
          const resolvedTypesPath = path.join(
            WORKSPACE_PATH,
            'node_modules',
            '@types',
            'node',
            'path.d.ts',
          );
          jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
            callback(null, resolvedTypesPath);
          });

          const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
          const result = await moduleFilePathResolver.resolveImportPath({
            importPath: 'node:path',
            sourceDocumentUri,
            sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
          });

          expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(resolvedTypesPath));
        });
      });

      describe('tsconfig integration', () => {
        let mockRepo: Repository;
        let sourceDocumentUri: URI;
        let sourceDocumentContext: IDocContext;
        let resolvedPath: string;

        beforeEach(() => {
          mockRepo = createFakePartial<Repository>({
            uri: fsPathToUri('/workspace'),
          });
          sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
          sourceDocumentContext = createMockDocContext(sourceDocumentUri.toString());
          resolvedPath = path.join(WORKSPACE_PATH, 'node_modules', '@foo', 'bar.ts');

          jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(mockRepo);
          jest.mocked(mockResolver.resolve).mockImplementation((_, __, ___, ____, callback) => {
            callback(null, resolvedPath);
          });
          jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(null);
        });

        it('should attempt to find applicable tsconfig for source file', async () => {
          await moduleFilePathResolver.resolveImportPath({
            importPath: '@foo/bar',
            sourceDocumentUri,
            sourceDocumentContext,
          });

          expect(mockRepositoryService.getMatchingRepository).toHaveBeenCalledWith(
            URI.parse(sourceDocumentContext.uri),
            WORKSPACE_URI,
          );
          expect(mockTsConfigStore.findApplicableConfig).toHaveBeenCalledWith(
            sourceDocumentContext.uri,
            mockRepo,
          );
        });

        it('should not include tsconfig options when no repository found', async () => {
          jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(undefined);

          await moduleFilePathResolver.resolveImportPath({
            importPath: '@foo/bar',
            sourceDocumentUri,
            sourceDocumentContext,
          });

          expect(mockTsConfigStore.findApplicableConfig).not.toHaveBeenCalled();
          expect(ResolverFactory.createResolver).toHaveBeenCalledWith(
            expect.not.objectContaining({
              modules: expect.any(Array),
              alias: expect.any(Array),
            }),
          );
        });

        it('should not include tsconfig options when no tsconfig found', async () => {
          jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(null);

          await moduleFilePathResolver.resolveImportPath({
            importPath: '@foo/bar',
            sourceDocumentUri,
            sourceDocumentContext,
          });

          expect(ResolverFactory.createResolver).toHaveBeenCalledWith(
            expect.not.objectContaining({
              modules: expect.any(Array),
              alias: expect.any(Array),
            }),
          );
        });

        it('should configure resolver with baseUrl from tsconfig as well as node_modules', async () => {
          const mockTsConfig = createFakePartial<ts.ParsedCommandLine>({
            options: {
              baseUrl: 'src',
            },
          });
          jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(mockTsConfig);

          await moduleFilePathResolver.resolveImportPath({
            importPath: '@foo/bar',
            sourceDocumentUri,
            sourceDocumentContext,
          });

          expect(ResolverFactory.createResolver).toHaveBeenCalledWith(
            expect.objectContaining({
              // Should include `node_modules` when adding a baseUrl
              modules: ['node_modules', 'src'],
            }),
          );
        });

        it('should combines default and tsconfig path mappings in resolver configuration', async () => {
          const mockTsConfig = createFakePartial<ts.ParsedCommandLine>({
            options: {
              paths: {
                '@app/*': ['src/app/*'],
                '@lib/*': ['src/lib/*', 'src/legacy/*'],
              },
            },
          });
          jest.mocked(mockTsConfigStore.findApplicableConfig).mockResolvedValue(mockTsConfig);

          await moduleFilePathResolver.resolveImportPath({
            importPath: '@foo/bar',
            sourceDocumentUri,
            sourceDocumentContext,
          });

          expect(ResolverFactory.createResolver).toHaveBeenCalledWith(
            expect.objectContaining({
              alias: [
                // Default aliases
                { name: 'crypto', alias: ['@types/node/crypto.d.ts'] },
                { name: 'node:crypto', alias: ['@types/node/crypto.d.ts'] },
                { name: 'fs', alias: ['@types/node/fs.d.ts'] },
                { name: 'node:fs', alias: ['@types/node/fs.d.ts'] },
                { name: 'path', alias: ['@types/node/path.d.ts'] },
                { name: 'node:path', alias: ['@types/node/path.d.ts'] },

                // From tsconfig.json
                { name: '@app', alias: ['src/app'] },
                { name: '@lib', alias: ['src/lib', 'src/legacy'] },
              ],
            }),
          );
        });
      });
    });
  });
});
