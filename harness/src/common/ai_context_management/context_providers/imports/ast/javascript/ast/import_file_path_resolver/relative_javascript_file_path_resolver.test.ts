import type { Stats } from 'fs';
import path from 'path';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { fsPathToUri } from '@gitlab-org/fs';
import type { IDocContext } from '../../../../../../../document_transformer_service';
import type { ExtendedPromiseFsClient, FsClient } from '../../../../../../../services/fs/fs';
import { TRACKED_EXTENSIONS } from '../../../utils';
import type { JavascriptImportStore } from '../../javascript_import_store';
import { RelativeJavaScriptFilePathResolver } from './relative_javascript_file_path_resolver';

describe('RelativeJavaScriptFilePathResolver', () => {
  let resolver: RelativeJavaScriptFilePathResolver;
  let mockLogger: Logger;
  let mockFsClient: FsClient;
  let mockImportStore: JavascriptImportStore;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockStats: Stats;

  const WORKSPACE_PATH = path.resolve('/workspace');
  const WORKSPACE_URI = fsPathToUri(WORKSPACE_PATH).toString();

  // Helper function to normalize paths for cross-platform testing
  const normalizePath = (p: string) => {
    const normalized = path.normalize(p);
    // On Windows, remove drive letter for comparison
    return process.platform === 'win32' ? normalized.replace(/^[A-Z]:/i, '') : normalized;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockLogger = new TestLogger();

    mockWorkspaceFolder = {
      uri: WORKSPACE_URI,
      name: 'workspace',
    };

    mockStats = createFakePartial<Stats>({
      isFile: () => true,
      isDirectory: () => false,
    });

    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<ExtendedPromiseFsClient['promises']>({
        stat: jest.fn().mockResolvedValue(mockStats),
      }),
    });

    mockImportStore = createFakePartial<JavascriptImportStore>({
      getFile: jest.fn(),
    });

    resolver = new RelativeJavaScriptFilePathResolver(mockLogger, mockImportStore, mockFsClient);
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
    it('should return true for relative paths starting with .', () => {
      expect(resolver.canResolve('./foo')).toBe(true);
      expect(resolver.canResolve('../foo')).toBe(true);
      expect(resolver.canResolve('.')).toBe(true);
    });

    it('should return true for absolute paths starting with /', () => {
      expect(resolver.canResolve('/foo/bar')).toBe(true);
    });

    it('should return false for non-relative paths', () => {
      expect(resolver.canResolve('foo')).toBe(false);
      expect(resolver.canResolve('~foo')).toBe(false);
      expect(resolver.canResolve('foo/bar')).toBe(false);
      expect(resolver.canResolve('@foo/bar')).toBe(false);
    });
  });

  describe('resolveImportPath', () => {
    describe('basic validation', () => {
      it('should return null when no workspace folder is provided', async () => {
        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './relative/path',
          sourceDocumentUri,
          sourceDocumentContext: {
            ...createMockDocContext(sourceDocumentUri.toString()),
            workspaceFolder: undefined,
          },
        });

        expect(result).toBeNull();
      });
    });

    describe('store resolution', () => {
      it('should resolve exact matches from store', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(modulePath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module.ts',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePath));
        expect(mockFsClient.promises.stat).not.toHaveBeenCalled();
      });

      it('should resolve extensionless imports from store', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(modulePath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePath));
        expect(mockFsClient.promises.stat).not.toHaveBeenCalled();
      });

      it('should resolve index files from store', async () => {
        const indexPath = path.join(WORKSPACE_PATH, 'lib', 'index.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(indexPath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(indexPath));
        expect(mockFsClient.promises.stat).not.toHaveBeenCalled();
      });
    });

    describe('filesystem resolution', () => {
      beforeEach(() => {
        jest.mocked(mockImportStore.getFile).mockReturnValue(null);
      });

      it('should resolve exact matches from filesystem', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module.ts');
        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));

        const result = await resolver.resolveImportPath({
          importPath: './lib/module.ts',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePath));
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePath.toLowerCase());
      });

      it('should resolve extensionless imports from filesystem by trying extensions', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module');
        const modulePathWithExt = `${modulePath}.ts`;

        jest.mocked(mockFsClient.promises.stat).mockImplementation(async (filePath) => {
          if (normalizePath(filePath.toString()) === normalizePath(modulePathWithExt)) {
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          throw new Error('ENOENT');
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePathWithExt));
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePath.toLowerCase());
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePathWithExt.toLowerCase());
      });

      it('should resolve index files from filesystem by trying extensions', async () => {
        const indexPath = path.join(WORKSPACE_PATH, 'lib', 'index');
        const indexPathWithExt = `${indexPath}.ts`;

        // Mock filesystem to handle directory and index file checks
        jest.mocked(mockFsClient.promises.stat).mockImplementation(async (filePath) => {
          const normalizedFilePath = normalizePath(filePath.toString());
          if (normalizedFilePath === normalizePath(path.join(WORKSPACE_PATH, 'lib'))) {
            return createFakePartial<Stats>({
              isFile: () => false,
              isDirectory: () => true,
            });
          }
          if (normalizedFilePath === normalizePath(indexPath)) {
            throw new Error('ENOENT');
          }
          if (normalizedFilePath === normalizePath(indexPathWithExt)) {
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          throw new Error('ENOENT');
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(indexPathWithExt));
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(
          path.join(WORKSPACE_PATH, 'lib').toLowerCase(),
        );
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(indexPath.toLowerCase());
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(indexPathWithExt.toLowerCase());
      });

      it('should try all extensions in order and use first match', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module');

        jest.mocked(mockFsClient.promises.stat).mockImplementation(async (filePath) => {
          const normalizedFilePath = normalizePath(filePath.toString());
          if (normalizedFilePath === normalizePath(modulePath)) {
            throw new Error('ENOENT');
          }
          if (normalizedFilePath === normalizePath(`${modulePath}.tsx`)) {
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          throw new Error('ENOENT');
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(`${modulePath}.tsx`));
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePath.toLowerCase());
        for (const ext of TRACKED_EXTENSIONS) {
          expect(mockFsClient.promises.stat).toHaveBeenCalledWith(
            `${modulePath.toLowerCase()}${ext}`,
          );
        }
      });

      it('should handle Promise.any behavior by using first successful resolution', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module');

        jest.mocked(mockFsClient.promises.stat).mockImplementation(async (filePath) => {
          const normalizedFilePath = normalizePath(filePath.toString());
          if (normalizedFilePath === normalizePath(`${modulePath}.ts`)) {
            await new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 50);
            });
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          if (normalizedFilePath === normalizePath(`${modulePath}.tsx`)) {
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          throw new Error('ENOENT');
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(`${modulePath}.tsx`));
      });

      it('should still resolve to .tsx even when it is slower', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module');

        jest.mocked(mockFsClient.promises.stat).mockImplementation(async (filePath) => {
          const normalizedFilePath = normalizePath(filePath.toString());
          if (normalizedFilePath === normalizePath(`${modulePath}.ts`)) {
            await new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 10);
            });
            throw new Error('ENOENT');
          }
          if (normalizedFilePath === normalizePath(`${modulePath}.tsx`)) {
            await new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 50);
            });
            return createFakePartial<Stats>({
              isFile: () => true,
              isDirectory: () => false,
            });
          }
          throw new Error('ENOENT');
        });

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(`${modulePath}.tsx`));
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePath.toLowerCase());
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(`${modulePath.toLowerCase()}.ts`);
        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(`${modulePath.toLowerCase()}.tsx`);
      });

      it('should return null when all extension checks fail', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module');

        jest.mocked(mockFsClient.promises.stat).mockRejectedValue(new Error('ENOENT'));

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(result).toBeNull();

        expect(mockFsClient.promises.stat).toHaveBeenCalledWith(modulePath.toLowerCase());
        for (const ext of TRACKED_EXTENSIONS) {
          expect(mockFsClient.promises.stat).toHaveBeenCalledWith(
            `${modulePath.toLowerCase()}${ext}`,
          );
        }
      });

      it('should return null when file does not exist', async () => {
        jest.mocked(mockFsClient.promises.stat).mockRejectedValue(new Error('ENOENT'));
        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));

        const result = await resolver.resolveImportPath({
          importPath: './non-existent',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(result).toBeNull();
      });
    });

    describe('path handling', () => {
      it('should handle parent directory traversal', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'module.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(modulePath);

        const sourceDocumentUri = fsPathToUri(
          path.join(WORKSPACE_PATH, 'src', 'nested', 'source.ts'),
        );
        const result = await resolver.resolveImportPath({
          importPath: '../../module',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePath));
      });

      it('should handle current directory imports', async () => {
        const indexPath = path.join(WORKSPACE_PATH, 'lib', 'index.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(indexPath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'lib', 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: '.',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(indexPath));
      });

      it('should handle trailing slashes', async () => {
        const indexPath = path.join(WORKSPACE_PATH, 'lib', 'index.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(indexPath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: './lib/',
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(indexPath));
      });

      it('should handle quoted paths', async () => {
        const modulePath = path.join(WORKSPACE_PATH, 'lib', 'module.ts');
        jest.mocked(mockImportStore.getFile).mockReturnValue(modulePath);

        const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
        const result = await resolver.resolveImportPath({
          importPath: "'./lib/module'",
          sourceDocumentUri,
          sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
        });

        expect(normalizePath(result?.fsPath || '')).toBe(normalizePath(modulePath));
      });
    });
  });
});
