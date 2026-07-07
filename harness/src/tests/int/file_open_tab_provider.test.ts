import { LOG_LEVEL } from '@gitlab-org/logging';
import type { OpenTabAIContextItem } from '@gitlab-org/ai-context';
import { GITLAB_TEST_TOKEN, LspClient } from './lsp_client';
import { MOCK_FILE_1, MOCK_FILE_2 } from './test_utils';

describe('[AIContextManagement] Open tab context provider', () => {
  let lsClient: LspClient;
  let CONTEXT_ITEM_1: OpenTabAIContextItem;
  let CONTEXT_ITEM_2: OpenTabAIContextItem;

  async function setupLS(): Promise<LspClient> {
    const myLSClient = new LspClient(GITLAB_TEST_TOKEN);
    await myLSClient.sendInitialize();
    await myLSClient.sendDidChangeConfiguration({
      settings: {
        // Open tabs context cache logging is debug level, switch to that so that we can verify behaviour
        logLevel: LOG_LEVEL.DEBUG,
        token: GITLAB_TEST_TOKEN,
        codeCompletion: { enabled: true },
      },
    });
    await myLSClient.sendInitialized();
    return myLSClient;
  }

  beforeEach(async () => {
    lsClient = await setupLS();

    await lsClient.sendTextDocumentDidOpen(
      MOCK_FILE_1.uri,
      MOCK_FILE_1.languageId,
      MOCK_FILE_1.version,
      MOCK_FILE_1.text,
    );

    await lsClient.sendTextDocumentDidOpen(
      MOCK_FILE_2.uri,
      MOCK_FILE_2.languageId,
      MOCK_FILE_2.version,
      MOCK_FILE_2.text,
    );

    CONTEXT_ITEM_1 = {
      id: MOCK_FILE_1.uri,
      category: 'file',
      metadata: {
        enabled: true,
        disabledReasons: [],
        title: 'some-file.js',
        project: 'not a GitLab project',
        relativePath: 'some-file.js',
        languageId: 'javascript',
        workspaceFolder: {
          name: 'test',
          uri: 'file://base/path',
        },
        subType: 'open_tab',
        subTypeLabel: 'Project file',
        secondaryText: 'some-file.js',
        icon: 'document',
        byteSize: 100,
        lastAccessed: Date.now(),
        lastModified: Date.now(),
      },
    };
    CONTEXT_ITEM_2 = {
      id: MOCK_FILE_2.uri,
      category: 'file',
      metadata: {
        enabled: true,
        disabledReasons: [],
        title: 'some-other-file.js',
        project: 'not a GitLab project',
        relativePath: 'some-other-file.js',
        languageId: 'javascript',
        workspaceFolder: {
          name: 'test',
          uri: 'file://base/path',
        },
        subType: 'open_tab',
        subTypeLabel: 'Project file',
        secondaryText: 'some-other-file.js',
        icon: 'document',
        byteSize: 100,
        lastAccessed: Date.now(),
        lastModified: Date.now(),
      },
    };
    return lsClient.getAvailableCategories();
  });

  afterEach(() => lsClient.dispose());

  it('context category should be enabled', async () => {
    const categories = await lsClient.getAvailableCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain('file');
  });

  describe('when querying open tabs', () => {
    it('should return the list of open tabs', async () => {
      const categories = await lsClient.getAvailableCategories();
      const result = await lsClient.searchContextItemsForCategory({
        category: categories[0],
        query: '',
        workspaceFolders: [],
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(CONTEXT_ITEM_2.id);
      expect(result[1].id).toBe(CONTEXT_ITEM_1.id);

      result.forEach((item) => {
        const { metadata } = item as OpenTabAIContextItem;
        expect(metadata.byteSize).toBeGreaterThan(0);
        expect(metadata.lastAccessed).toBeGreaterThan(0);
        expect(metadata.lastModified).toBeGreaterThan(0);
      });

      result.forEach((item, index) => {
        const expected = index === 0 ? CONTEXT_ITEM_2 : CONTEXT_ITEM_1;
        expect(item).toMatchObject({
          id: expected.id,
          category: expected.category,
          metadata: {
            enabled: expected.metadata.enabled,
            disabledReasons: expected.metadata.disabledReasons,
            title: expected.metadata.title,
            project: expected.metadata.project,
            relativePath: expected.metadata.relativePath,
            languageId: expected.metadata.languageId,
            workspaceFolder: expected.metadata.workspaceFolder,
            subType: expected.metadata.subType,
            subTypeLabel: expected.metadata.subTypeLabel,
            secondaryText: expected.metadata.secondaryText,
            icon: expected.metadata.icon,
          },
        });
      });
    });

    it('should add and remove selected items', async () => {
      await lsClient.addSelectedContextItem(CONTEXT_ITEM_1);
      await lsClient.addSelectedContextItem(CONTEXT_ITEM_2);

      const selectedItems = await lsClient.getSelectedContextItems();

      expect(selectedItems).toHaveLength(2);
      expect(selectedItems[0].id).toBe(CONTEXT_ITEM_1.id);
      expect(selectedItems[1].id).toBe(CONTEXT_ITEM_2.id);

      selectedItems.forEach((item) => {
        const { metadata } = item as OpenTabAIContextItem;

        expect(metadata.byteSize).toBeGreaterThan(0);
        expect(metadata.lastAccessed).toBeGreaterThan(0);
        expect(metadata.lastModified).toBeGreaterThan(0);
      });

      await lsClient.removeSelectedContextItem(CONTEXT_ITEM_2);
      const remainingItems = await lsClient.getSelectedContextItems();
      expect(remainingItems).toHaveLength(1);
      expect(remainingItems[0].id).toBe(CONTEXT_ITEM_1.id);
    });

    it('should clear selected items', async () => {
      await lsClient.addSelectedContextItem(CONTEXT_ITEM_1);
      await lsClient.addSelectedContextItem(CONTEXT_ITEM_2);

      const selectedItems = await lsClient.getSelectedContextItems();

      expect(selectedItems).toHaveLength(2);
      selectedItems.forEach((item) => {
        const { metadata } = item as OpenTabAIContextItem;

        expect(metadata.byteSize).toBeGreaterThan(0);
        expect(metadata.lastAccessed).toBeGreaterThan(0);
        expect(metadata.lastModified).toBeGreaterThan(0);
      });

      await lsClient.clearSelectedContextItems();
      expect(await lsClient.getSelectedContextItems()).toEqual([]);
    });
  });
});
