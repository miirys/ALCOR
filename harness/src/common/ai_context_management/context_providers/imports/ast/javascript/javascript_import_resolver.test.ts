import path from 'path';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { fsPathToUri } from '@gitlab-org/fs';
import { IDocContext } from '../../../../../document_transformer_service';
import { JavaScriptImportFilePathResolver } from './ast/import_file_path_resolver';
import { JavascriptImportResolver } from './javascript_import_resolver';

// Note: this tests only tests the resolveImportPath method
// To see remaining tests (which include tree sitter logic), see
// src/tests/unit/tree_sitter/javascript_import_resolver.test.ts
describe('JavascriptImportResolver', () => {
  let resolver: JavascriptImportResolver;
  let mockLogger: Logger;
  let mockWorkspaceFolder: WorkspaceFolder;
  let mockImportFileResolverA: JavaScriptImportFilePathResolver;
  let mockImportFileResolverB: JavaScriptImportFilePathResolver;

  const WORKSPACE_PATH = path.resolve('/workspace');
  const WORKSPACE_URI = fsPathToUri(WORKSPACE_PATH).toString();

  beforeEach(() => {
    jest.resetAllMocks();
    mockLogger = new TestLogger();

    mockWorkspaceFolder = {
      uri: WORKSPACE_URI,
      name: 'workspace',
    };

    mockImportFileResolverA = createFakePartial<JavaScriptImportFilePathResolver>({
      canResolve: jest.fn().mockReturnValue(false),
      resolveImportPath: jest.fn().mockResolvedValue(null),
    });

    mockImportFileResolverB = createFakePartial<JavaScriptImportFilePathResolver>({
      canResolve: jest.fn().mockReturnValue(false),
      resolveImportPath: jest.fn().mockResolvedValue(null),
    });

    resolver = new JavascriptImportResolver(mockLogger, [
      mockImportFileResolverA,
      mockImportFileResolverB,
    ]);
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

  describe('resolveImportPath', () => {
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

    it('should return null when no resolver can handle the import path', async () => {
      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
      const result = await resolver.resolveImportPath({
        importPath: './module',
        sourceDocumentUri,
        sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
      });

      expect(result).toBeNull();
      expect(mockImportFileResolverA.canResolve).toHaveBeenCalledWith('./module');
      expect(mockImportFileResolverB.canResolve).toHaveBeenCalledWith('./module');
      expect(mockImportFileResolverA.resolveImportPath).not.toHaveBeenCalled();
      expect(mockImportFileResolverB.resolveImportPath).not.toHaveBeenCalled();
    });

    it('should only try resolvers that can handle the import path', async () => {
      jest.mocked(mockImportFileResolverA.canResolve).mockReturnValue(true);

      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
      await resolver.resolveImportPath({
        importPath: './module',
        sourceDocumentUri,
        sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
      });

      expect(mockImportFileResolverA.resolveImportPath).toHaveBeenCalled();
      expect(mockImportFileResolverB.resolveImportPath).not.toHaveBeenCalled();
    });

    it('should use first successful resolution when multiple resolvers can handle the path', async () => {
      const expectedUri = URI.file(path.join(WORKSPACE_PATH, 'resolved-by-a.ts'));

      jest.mocked(mockImportFileResolverA.canResolve).mockReturnValue(true);
      jest.mocked(mockImportFileResolverB.canResolve).mockReturnValue(true);
      jest.mocked(mockImportFileResolverA.resolveImportPath).mockResolvedValue(expectedUri);
      jest.mocked(mockImportFileResolverB.resolveImportPath).mockImplementation(async () => {
        return new Promise((resolve) => {
          // Simulate a slow resolver
          setTimeout(() => resolve(URI.file(path.join(WORKSPACE_PATH, 'resolved-by-b.ts'))), 100);
        });
      });

      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
      const result = await resolver.resolveImportPath({
        importPath: './module',
        sourceDocumentUri,
        sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
      });

      expect(result?.fsPath).toBe(expectedUri.fsPath);
    });

    it('should try next resolver if first resolver fails', async () => {
      const expectedUri = URI.file(path.join(WORKSPACE_PATH, 'resolved-by-b.ts'));

      jest.mocked(mockImportFileResolverA.canResolve).mockReturnValue(true);
      jest.mocked(mockImportFileResolverB.canResolve).mockReturnValue(true);
      jest
        .mocked(mockImportFileResolverA.resolveImportPath)
        .mockRejectedValue(new Error('Failed to resolve'));
      jest.mocked(mockImportFileResolverB.resolveImportPath).mockResolvedValue(expectedUri);

      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
      const result = await resolver.resolveImportPath({
        importPath: './module',
        sourceDocumentUri,
        sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
      });

      expect(result?.fsPath).toBe(expectedUri.fsPath);
    });

    it('should return null if all resolvers fail', async () => {
      jest.mocked(mockImportFileResolverA.canResolve).mockReturnValue(true);
      jest.mocked(mockImportFileResolverB.canResolve).mockReturnValue(true);
      jest
        .mocked(mockImportFileResolverA.resolveImportPath)
        .mockRejectedValue(new Error('Failed to resolve A'));
      jest
        .mocked(mockImportFileResolverB.resolveImportPath)
        .mockRejectedValue(new Error('Failed to resolve B'));

      const sourceDocumentUri = fsPathToUri(path.join(WORKSPACE_PATH, 'source.ts'));
      const result = await resolver.resolveImportPath({
        importPath: './module',
        sourceDocumentUri,
        sourceDocumentContext: createMockDocContext(sourceDocumentUri.toString()),
      });

      expect(result).toBeNull();
    });
  });
});
