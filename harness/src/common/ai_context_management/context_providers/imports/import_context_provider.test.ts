import path from 'path';
import Parser from 'web-tree-sitter';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { LRUCache } from 'lru-cache';
import { createFakePartial } from '@gitlab-org/test-utils';
import { FsClient, fsPathToUri } from '@gitlab-org/fs';
import { IDocContext } from '@gitlab-org/document';
import type { ImportAIContextItem } from '@gitlab-org/ai-context';
import { TreeAndLanguage, TreeSitterLanguageName } from '../../../tree_sitter';
import {
  DuoProjectAccessChecker,
  DuoProjectStatus,
  DuoProject,
} from '../../../services/duo_access';
import { FilePolicyProvider } from '../../context_policies/file_policy';
import { OpenTabsService, OpenTab } from '../../../open_tabs/open_tabs_service';
import { DefaultImportContextProvider } from './import_context_provider';
import { AbstractImportResolver } from './ast/import_resolver';

describe('ImportContextProvider', () => {
  let provider: DefaultImportContextProvider;
  let mockLogger: Logger;
  let mockFsClient: FsClient;
  let mockImportResolver: AbstractImportResolver;
  let mockProjectAccessChecker: DuoProjectAccessChecker;
  let mockFilePolicyProvider: FilePolicyProvider;
  let mockOpenTabsService: OpenTabsService;

  const WORKSPACE_PATH = '/workspace';
  const TEST_FILE_PATH = path.join(WORKSPACE_PATH, 'test.ts');
  const TEST_FILE_URI = fsPathToUri(TEST_FILE_PATH);
  const TEST_IMPORT_PATH = path.join(WORKSPACE_PATH, 'imported.ts');
  const TEST_IMPORT_URI = fsPathToUri(TEST_IMPORT_PATH);

  const mockWorkspaceFolder: WorkspaceFolder = {
    uri: fsPathToUri(WORKSPACE_PATH).toString(),
    name: 'workspace',
  };

  const mockDocument = {
    uri: TEST_FILE_URI.toString(),
    fileRelativePath: 'test.ts',
    languageId: 'typescript',
    position: { line: 1, character: 1 },
    prefix: 'import { foo } from ',
    suffix: "'./imported';",
    workspaceFolder: mockWorkspaceFolder,
  } as IDocContext;

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<FsClient['promises']>({
        readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content')),
      }),
    });

    mockImportResolver = createFakePartial<AbstractImportResolver>({
      enabledForLanguage: jest.fn().mockReturnValue(true),
      getTreeSitterQuery: jest.fn().mockReturnValue('mock query'),
      getImportMetadataByPath: jest.fn().mockResolvedValue(
        new Map([
          [
            './imported',
            {
              importPath: './imported',
              importIdentifiers: [],
              sourceDocumentContext: mockDocument,
              languageName: 'typescript' as TreeSitterLanguageName,
            },
          ],
        ]),
      ),
      resolveImportPath: jest.fn().mockResolvedValue(TEST_IMPORT_URI),
    });

    mockProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn().mockReturnValue({
        status: DuoProjectStatus.DuoEnabled,
        project: createFakePartial<DuoProject>({
          projectPath: 'projectPath',
          enabled: true,
          host: 'host',
          namespace: 'namespace',
          namespaceWithPath: 'namespaceWithPath',
          uri: 'uri',
        }),
      }),
    });

    mockFilePolicyProvider = createFakePartial<FilePolicyProvider>({
      isContextItemAllowed: jest.fn().mockResolvedValue({ enabled: true }),
    });

    mockOpenTabsService = createFakePartial<OpenTabsService>({
      openTabsCache: createFakePartial<LRUCache<string, OpenTab>>({
        get: jest.fn(),
      }),
      mostRecentTabs: jest.fn(),
    });

    provider = new DefaultImportContextProvider(
      mockLogger,
      mockFsClient,
      [mockImportResolver],
      mockProjectAccessChecker,
      mockFilePolicyProvider,
      mockOpenTabsService,
    );
  });

  describe('getContextForCodeSuggestions', () => {
    const mockTreeAndLanguage = createFakePartial<TreeAndLanguage>({
      tree: createFakePartial<Parser.Tree>({
        rootNode: createFakePartial<Parser.SyntaxNode>({
          tree: {} as Parser.Tree,
          id: 1,
          typeId: 1,
          grammarId: 1,
        }),
      }),
      languageInfo: {
        name: 'typescript' as TreeSitterLanguageName,
        extensions: [],
        editorLanguageIds: [],
        wasmPath: '',
      },
      language: createFakePartial<Parser.Language>({
        query: jest.fn().mockReturnValue({
          captures: jest.fn().mockReturnValue([]),
        }),
      }),
      parser: createFakePartial<Parser>({
        parse: jest.fn(),
      }),
    });

    it('should return empty array when no language info is available', async () => {
      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: createFakePartial<TreeAndLanguage>({
          ...mockTreeAndLanguage,
          languageInfo: {
            name: null as unknown as TreeSitterLanguageName,
            extensions: [],
            editorLanguageIds: [],
            wasmPath: '',
          },
        }),
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when no import resolver is found for language', async () => {
      jest.mocked(mockImportResolver.enabledForLanguage).mockReturnValue(false);

      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result).toEqual([]);
    });

    it('should process imports and return context items', async () => {
      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: TEST_IMPORT_URI.toString(),
        category: 'file',
        metadata: {
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          project: 'namespaceWithPath',
          secondaryText: TEST_IMPORT_PATH,
        },
      });
    });

    it('should handle disabled projects', async () => {
      jest.mocked(mockProjectAccessChecker.checkProjectStatus).mockReturnValue({
        status: DuoProjectStatus.DuoDisabled,
        project: undefined,
      });

      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toContain('project disabled');
    });

    it('should handle policy restrictions', async () => {
      jest.mocked(mockFilePolicyProvider.isContextItemAllowed).mockResolvedValue({
        enabled: false,
        disabledReasons: ['policy restriction'],
      });

      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result[0].metadata.enabled).toBe(false);
      expect(result[0].metadata.disabledReasons).toContain('policy restriction');
    });

    it('should use open tab content if available', async () => {
      const openFile: OpenTab = {
        prefix: 'open tab ',
        suffix: 'content',
        fileRelativePath: 'imported.ts',
        position: { line: 1, character: 1 },
        uri: TEST_IMPORT_URI.toString(),
        languageId: 'typescript',
        workspaceFolder: mockWorkspaceFolder,
        byteSize: 100,
        lastAccessed: Date.now(),
        lastModified: Date.now(),
      };

      jest.mocked(mockOpenTabsService.openTabsCache.get).mockReturnValue(openFile);

      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result[0]).toMatchObject({
        category: 'file',
        metadata: {
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          project: 'namespaceWithPath',
          secondaryText: TEST_IMPORT_PATH,
        },
      });

      const content = await provider.addContentToItems(result);
      expect(content[0].content).toBe('open tab content');
      expect(mockFsClient.promises.readFile).not.toHaveBeenCalled();
    });

    it('should fall back to file system if not in open tabs', async () => {
      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result[0]).toMatchObject({
        category: 'file',
        metadata: {
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          project: 'namespaceWithPath',
          secondaryText: TEST_IMPORT_PATH,
        },
      });

      const content = await provider.addContentToItems(result);
      expect(content[0].content).toBe('mock file content');
      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(TEST_IMPORT_PATH);
    });
  });

  describe('searchContextItems', () => {
    const mockTreeAndLanguage = createFakePartial<TreeAndLanguage>({
      tree: createFakePartial<Parser.Tree>({
        rootNode: createFakePartial<Parser.SyntaxNode>({
          tree: {} as Parser.Tree,
          id: 1,
          typeId: 1,
          grammarId: 1,
        }),
      }),
      languageInfo: {
        name: 'typescript' as TreeSitterLanguageName,
        extensions: [],
        editorLanguageIds: [],
        wasmPath: '',
      },
      language: createFakePartial<Parser.Language>({
        query: jest.fn().mockReturnValue({
          captures: jest.fn().mockReturnValue([]),
        }),
      }),
      parser: createFakePartial<Parser>({
        parse: jest.fn(),
      }),
    });

    it('should handle search request for code suggestions', async () => {
      const result = await provider.searchSuggestionContextItems({
        iDocContext: mockDocument,
        treeAndLanguage: mockTreeAndLanguage,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'file',
        metadata: {
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          secondaryText: TEST_IMPORT_PATH,
        },
      });
    });
  });

  describe('addContentToItems', () => {
    it('should return empty array when no items provided', async () => {
      const result = await provider.addContentToItems([]);
      expect(result).toEqual([]);
    });

    it('should retrieve content from open tabs when available', async () => {
      const openFile: OpenTab = {
        prefix: 'open tab ',
        suffix: 'content',
        fileRelativePath: 'imported.ts',
        position: { line: 1, character: 1 },
        uri: TEST_IMPORT_URI.toString(),
        languageId: 'typescript',
        workspaceFolder: mockWorkspaceFolder,
        byteSize: 100,
        lastAccessed: Date.now(),
        lastModified: Date.now(),
      };

      jest.mocked(mockOpenTabsService.openTabsCache.get).mockReturnValue(openFile);

      const mockItem = createFakePartial<ImportAIContextItem>({
        id: TEST_IMPORT_PATH,
        category: 'file',
        metadata: {
          title: TEST_IMPORT_PATH,
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          project: 'test-project',
          secondaryText: TEST_IMPORT_PATH,
          resolvedImportPath: TEST_IMPORT_URI,
          importPath: './imported',
          importIdentifiers: [],
          sourceDocumentContext: mockDocument,
          languageName: 'typescript',
        },
      });

      const result = await provider.addContentToItems([mockItem]);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('open tab content');
      expect(mockFsClient.promises.readFile).not.toHaveBeenCalled();
    });

    it('should retrieve content from file system when not in open tabs', async () => {
      const mockItem = createFakePartial<ImportAIContextItem>({
        id: TEST_IMPORT_PATH,
        category: 'file',
        metadata: {
          title: TEST_IMPORT_PATH,
          enabled: true,
          icon: 'import',
          subType: 'import',
          subTypeLabel: 'Imported file',
          project: 'test-project',
          secondaryText: TEST_IMPORT_PATH,
          resolvedImportPath: TEST_IMPORT_URI,
          importPath: './imported',
          importIdentifiers: [],
          sourceDocumentContext: mockDocument,
          languageName: 'typescript',
        },
      });

      const result = await provider.addContentToItems([mockItem]);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('mock file content');
      expect(mockFsClient.promises.readFile).toHaveBeenCalledWith(TEST_IMPORT_PATH);
    });

    it('should handle multiple items', async () => {
      const mockItems = [
        createFakePartial<ImportAIContextItem>({
          id: TEST_IMPORT_PATH,
          category: 'file',
          metadata: {
            title: TEST_IMPORT_PATH,
            enabled: true,
            icon: 'import',
            subType: 'import',
            subTypeLabel: 'Imported file',
            project: 'test-project',
            secondaryText: TEST_IMPORT_PATH,
            resolvedImportPath: TEST_IMPORT_URI,
            importPath: './imported',
            importIdentifiers: [],
            sourceDocumentContext: mockDocument,
            languageName: 'typescript',
          },
        }),
        createFakePartial<ImportAIContextItem>({
          id: `${TEST_IMPORT_PATH}-2`,
          category: 'file',
          metadata: {
            title: `${TEST_IMPORT_PATH}-2`,
            enabled: true,
            icon: 'import',
            subType: 'import',
            subTypeLabel: 'Imported file',
            project: 'test-project',
            secondaryText: `${TEST_IMPORT_PATH}-2`,
            resolvedImportPath: fsPathToUri(`${TEST_IMPORT_PATH}-2`),
            importPath: './imported-2',
            importIdentifiers: [],
            sourceDocumentContext: mockDocument,
            languageName: 'typescript',
          },
        }),
      ];

      const result = await provider.addContentToItems(mockItems);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('mock file content');
      expect(result[1].content).toBe('mock file content');
      expect(mockFsClient.promises.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('unimplemented methods', () => {
    it('should throw on addSelectedContextItem', async () => {
      await expect(provider.addSelectedContextItem()).rejects.toThrow('Method not implemented');
    });

    it('should throw on removeSelectedContextItem', async () => {
      await expect(provider.removeSelectedContextItem()).rejects.toThrow('Method not implemented');
    });

    it('should throw on clearSelectedContextItems', async () => {
      await expect(provider.clearSelectedContextItems()).rejects.toThrow('Method not implemented');
    });

    it('should return empty array for getSelectedContextItems', async () => {
      expect(await provider.getSelectedContextItems()).toEqual([]);
    });

    it('should return same item for getItemWithContent', async () => {
      const mockItem = createFakePartial<ImportAIContextItem>({
        id: 'test',
      });
      expect(await provider.getItemWithContent(mockItem)).toBe(mockItem);
    });
  });
});
