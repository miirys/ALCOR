import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Disposable } from 'vscode-languageserver-protocol';
import { LRUCache } from 'lru-cache';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LsConnection } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import type { DocumentTransformerService } from '../document_transformer_service';
import { DocumentService, TextDocumentChangeListener } from '../document_service';
import { TextDocumentChangeListenerType } from '../text_document_change_listener_type';
import { FsClient } from '../services/fs/fs';
import { DefaultOpenTabsService } from './open_tabs_service';

jest.mock('lru-cache', () => {
  const mockDelete = jest.fn().mockReturnValue(true);
  const mockSet = jest.fn();
  const mockGet = jest.fn();
  const mockValues = jest.fn().mockReturnValue([]);

  return {
    LRUCache: jest.fn().mockImplementation(() => ({
      delete: mockDelete,
      set: mockSet,
      get: mockGet,
      values: mockValues,
    })),
  };
});

describe('OpenTabsService', () => {
  let mockDocument: TextDocument;
  let subscription: Disposable;

  const mockConnectionOnShutdown = jest.fn().mockImplementation((cb) => cb());
  const mockDocumentServiceOnDocumentChange = jest.fn();
  const mockIsLanguageEnabled = jest.fn();
  const mockGetContext = jest.fn();
  let triggerOnDocumentChange: TextDocumentChangeListener;
  const mockDispose = jest.fn();
  const mockStat = jest.fn();

  let openTabsService: DefaultOpenTabsService;

  beforeEach(() => {
    mockDocument = createFakePartial<TextDocument>({
      uri: 'file:///path/to/file.js',
      languageId: 'javascript',
    });

    subscription = createFakePartial<Disposable>({ dispose: mockDispose });

    const logger = new TestLogger();
    const configService = new DefaultConfigService();
    const connection = createFakePartial<LsConnection>({ onShutdown: mockConnectionOnShutdown });
    mockDocumentServiceOnDocumentChange.mockImplementation((_callback) => {
      triggerOnDocumentChange = _callback;
      return subscription;
    });
    const documentService = createFakePartial<DocumentService>({
      onDocumentChange: mockDocumentServiceOnDocumentChange,
    });
    const documentTransformer = createFakePartial<DocumentTransformerService>({
      getContext: mockGetContext,
    });
    const fsClient = createFakePartial<FsClient>({
      promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        unlink: jest.fn(),
        readdir: jest.fn(),
        mkdir: jest.fn(),
        rmdir: jest.fn(),
        stat: mockStat,
        lstat: jest.fn(),
        readFileFirstBytes: jest.fn(),
        readlink: jest.fn(),
        symlink: jest.fn(),
        chmod: jest.fn(),
      },
    });

    openTabsService = new DefaultOpenTabsService(
      logger,
      configService,
      connection,
      documentService,
      documentTransformer,
      fsClient,
    );
  });

  afterEach(() => {
    subscription?.dispose();
  });

  describe('when connection shuts down', () => {
    it('should clean up disposables', () => {
      expect(mockConnectionOnShutdown).toHaveBeenCalledTimes(1);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a document is closed', () => {
    it('should delete the item from the cache', async () => {
      mockIsLanguageEnabled.mockReturnValue(false);

      triggerOnDocumentChange(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidClose,
      );

      await new Promise(process.nextTick);

      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      expect(mockCache.delete).toHaveBeenCalledWith('file:///path/to/file.js');
    });
  });

  describe.each([
    TextDocumentChangeListenerType.onDidOpen,
    TextDocumentChangeListenerType.onDidChangeContent,
    TextDocumentChangeListenerType.onDidSave,
    TextDocumentChangeListenerType.onDidSetActive,
  ])('when receiving event type "%s"', (handlerType) => {
    describe('when a document context exists', () => {
      beforeEach(() => {
        mockGetContext.mockReturnValue({
          uri: mockDocument.uri,
          prefix: 'test prefix',
          suffix: 'test suffix',
          byteSize: 100,
          workspaceFolder: {
            uri: 'file:///workspace',
            name: 'test-workspace',
          },
          fileRelativePath: 'test.ts',
          position: { line: 0, character: 0 },
          languageId: 'typescript',
        });
        mockStat.mockResolvedValue({ mtime: new Date() });
      });

      it('should update the cache', async () => {
        triggerOnDocumentChange({ document: mockDocument }, handlerType);

        await new Promise(process.nextTick);

        const mockCache = jest.mocked(LRUCache).mock.results[0].value;
        expect(mockCache.set).toHaveBeenCalledTimes(1);
        expect(mockCache.set).toHaveBeenCalledWith(
          mockDocument.uri,
          expect.objectContaining({
            uri: mockDocument.uri,
            prefix: 'test prefix',
            suffix: 'test suffix',
            byteSize: 100,
          }),
        );
      });
    });

    describe('when a document context does not exist', () => {
      beforeEach(() => {
        mockGetContext.mockReturnValue(undefined);
      });

      it('should not update the cache', async () => {
        triggerOnDocumentChange({ document: mockDocument }, handlerType);

        await new Promise(process.nextTick);

        const mockCache = jest.mocked(LRUCache).mock.results[0].value;
        expect(mockCache.set).not.toHaveBeenCalled();
      });
    });
  });

  describe('mostRecentTabs', () => {
    it('should return all files when no context is provided', async () => {
      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      mockCache.values.mockReturnValue([{ uri: 'file:///test1.ts' }, { uri: 'file:///test2.ts' }]);

      const result = openTabsService.mostRecentTabs({});
      expect(result).toEqual([{ uri: 'file:///test1.ts' }, { uri: 'file:///test2.ts' }]);
    });

    it('should filter files by workspace when context is provided', async () => {
      const workspaceFolder = { uri: 'file:///workspace', name: 'test-workspace' };
      const otherWorkspaceFolder = { uri: 'file:///other', name: 'other-workspace' };

      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      mockCache.values.mockReturnValue([
        { uri: 'file:///workspace/test1.ts', workspaceFolder },
        { uri: 'file:///other/test2.ts', workspaceFolder: otherWorkspaceFolder },
        { uri: 'file:///workspace/test3.ts', workspaceFolder },
      ]);

      const result = openTabsService.mostRecentTabs({
        context: {
          uri: 'file:///workspace/current.ts',
          workspaceFolder,
          prefix: 'test prefix',
          suffix: 'test suffix',
          fileRelativePath: 'current.ts',
          position: { line: 0, character: 0 },
          languageId: 'typescript',
        },
      });

      expect(result).toEqual([
        { uri: 'file:///workspace/test1.ts', workspaceFolder },
        { uri: 'file:///workspace/test3.ts', workspaceFolder },
      ]);
    });

    it('should exclude current file when includeCurrentFile is false', async () => {
      const workspaceFolder = { uri: 'file:///workspace', name: 'test-workspace' };
      const currentFile = {
        uri: 'file:///workspace/current.ts',
        workspaceFolder,
        prefix: 'test prefix',
        suffix: 'test suffix',
        fileRelativePath: 'current.ts',
        position: { line: 0, character: 0 },
        languageId: 'typescript',
      };

      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      mockCache.values.mockReturnValue([
        { uri: 'file:///workspace/test1.ts', workspaceFolder },
        currentFile,
        { uri: 'file:///workspace/test3.ts', workspaceFolder },
      ]);

      const result = openTabsService.mostRecentTabs({
        context: currentFile,
        includeCurrentFile: false,
      });

      expect(result).toEqual([
        { uri: 'file:///workspace/test1.ts', workspaceFolder },
        { uri: 'file:///workspace/test3.ts', workspaceFolder },
      ]);
    });
  });

  describe('document updates with timestamps', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should update lastModified on content change', async () => {
      const now = Date.now();
      mockGetContext.mockReturnValue({
        uri: mockDocument.uri,
        prefix: 'test prefix',
        suffix: 'test suffix',
        byteSize: 100,
      });

      triggerOnDocumentChange(
        { document: mockDocument },
        TextDocumentChangeListenerType.onDidChangeContent,
      );

      await new Promise(process.nextTick);

      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      expect(mockCache.set).toHaveBeenCalledWith(
        mockDocument.uri,
        expect.objectContaining({
          lastModified: expect.any(Number),
          lastAccessed: expect.any(Number),
        }),
      );

      const setCall = mockCache.set.mock.calls[0][1];
      expect(setCall.lastModified).toBeGreaterThanOrEqual(now);
    });

    it('should use Date.now() for lastModified when document URI is non-file scheme', async () => {
      const virtualDocument = createFakePartial<TextDocument>({
        uri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package/source.abap',
        languageId: 'abap',
      });

      const mockContext = {
        uri: virtualDocument.uri,
        prefix: 'test',
        suffix: 'content',
        workspaceFolder: {
          uri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package',
          name: 'SAP',
        },
        languageId: 'abap',
        fileRelativePath: 'source.abap',
        position: { line: 0, character: 0 },
      };
      mockGetContext.mockReturnValue(mockContext);

      const now = Date.now();
      await triggerOnDocumentChange(
        { document: virtualDocument },
        TextDocumentChangeListenerType.onDidOpen,
      );

      expect(mockStat).not.toHaveBeenCalled();

      const cache = jest.mocked(LRUCache).mock.results[0].value;
      const setCall = cache.set.mock.calls.find(
        (call: unknown[]) => call[0] === virtualDocument.uri,
      );
      expect(setCall).toBeDefined();
      expect(setCall[1].lastModified).toBeGreaterThanOrEqual(now);
    });

    it('should use file stats for lastModified on open', async () => {
      const fileStats = { mtime: new Date('2024-01-01') };
      mockStat.mockResolvedValue(fileStats);
      mockGetContext.mockReturnValue({
        uri: mockDocument.uri,
        prefix: 'test prefix',
        suffix: 'test suffix',
        byteSize: 100,
      });

      triggerOnDocumentChange({ document: mockDocument }, TextDocumentChangeListenerType.onDidOpen);

      await new Promise(process.nextTick);

      const mockCache = jest.mocked(LRUCache).mock.results[0].value;
      expect(mockCache.set).toHaveBeenCalledWith(
        mockDocument.uri,
        expect.objectContaining({
          lastModified: fileStats.mtime.getTime(),
        }),
      );
    });
  });

  // this verifies a temporary fix for https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1983
  describe('when client is Visual Studio Code and file is package.json', () => {
    it('should ignore package.json files', async () => {
      const configService = new DefaultConfigService();
      configService.merge({
        clientInfo: {
          name: 'Visual Studio Code',
        },
      });

      let vsCodeTriggerOnDocumentChange: TextDocumentChangeListener = () => {};
      const mockVsCodeDocumentServiceOnDocumentChange = jest.fn().mockImplementation((callback) => {
        vsCodeTriggerOnDocumentChange = callback;
        return subscription;
      });

      // eslint-disable-next-line no-new
      new DefaultOpenTabsService(
        new TestLogger(),
        configService,
        createFakePartial<LsConnection>({ onShutdown: jest.fn() }),
        createFakePartial<DocumentService>({
          onDocumentChange: mockVsCodeDocumentServiceOnDocumentChange,
        }),
        createFakePartial<DocumentTransformerService>({ getContext: mockGetContext }),
        createFakePartial<FsClient>({ promises: { stat: mockStat } }),
      );

      const packageJsonDocument = createFakePartial<TextDocument>({
        uri: 'file:///path/to/package.json',
        languageId: 'json',
      });

      // Trigger the document change listener - should return early and not call getContext
      vsCodeTriggerOnDocumentChange(
        { document: packageJsonDocument },
        TextDocumentChangeListenerType.onDidOpen,
      );

      expect(mockGetContext).not.toHaveBeenCalled();
    });
  });
});
