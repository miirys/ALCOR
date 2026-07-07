import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LRUCache } from 'lru-cache';
import { AIContextResolverRequest } from '@gitlab-org/ai-context';
import { OpenTabsService, OpenTab } from '../../open_tabs/open_tabs_service';
import { DefaultCurrentFileContextProvider } from './current_file';

jest.mock('uuid');

describe('DefaultCurrentFileContextProvider', () => {
  let provider: DefaultCurrentFileContextProvider;
  let mockLogger: Logger;
  let mockOpenTabsService: OpenTabsService;
  let mockCache: LRUCache<string, OpenTab>;

  const createMockOpenTab = (overrides: Partial<OpenTab> = {}): OpenTab => ({
    uri: 'file:///test/file.ts',
    prefix: 'const x = ',
    suffix: '42;',
    fileRelativePath: 'test/file.ts',
    position: { line: 0, character: 10 },
    languageId: 'typescript',
    workspaceFolder: { name: 'test', uri: 'file:///test' },
    lastAccessed: 1234567890,
    lastModified: 1234567890,
    byteSize: 100,
    ...overrides,
  });

  beforeEach(() => {
    jest.mocked(uuidv4).mockReturnValue('mock-uuid');

    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    mockCache = new LRUCache<string, OpenTab>({ max: 100 });

    mockOpenTabsService = createFakePartial<OpenTabsService>({
      mostRecentTabs: jest.fn(),
      openTabsCache: mockCache,
    });

    provider = new DefaultCurrentFileContextProvider(mockLogger, mockOpenTabsService);

    // Mock the policy check to always allow items
    // @ts-expect-error - accessing protected method for testing
    provider.canItemBeAdded = jest.fn().mockResolvedValue({ enabled: true });
  });

  describe('searchContextItems', () => {
    it('should return empty array (not implemented)', async () => {
      const result = await provider.searchContextItems();

      expect(result).toEqual([]);
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    describe('agentic mode', () => {
      const agenticRequest: AIContextResolverRequest = { mode: 'agentic' };

      it('should auto-add current file and return it with content', async () => {
        const mockOpenTab = createMockOpenTab();

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        const result = await provider.retrieveContextItemsWithContent(agenticRequest);

        expect(result).toHaveLength(1);
        expect(result[0].content).toContain('Current file: test/file.ts');
        expect(result[0].content).toContain('Last accessed:');
        expect(result[0].id).toBe('current-file-mock-uuid');

        // Verify cleanup happened - selected items should be empty after retrieval
        const selectedItems = await provider.getSelectedContextItems();
        expect(selectedItems).toHaveLength(0);
      });

      it('should return empty array when no current file', async () => {
        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([]);

        const result = await provider.retrieveContextItemsWithContent(agenticRequest);

        expect(result).toEqual([]);
      });

      it('should not include current file if it has not changed', async () => {
        const mockOpenTab = createMockOpenTab();

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        // First call - should return item
        const firstResult = await provider.retrieveContextItemsWithContent(agenticRequest);
        expect(firstResult).toHaveLength(1);

        // Second call - should return empty (file hasn't changed)
        const secondResult = await provider.retrieveContextItemsWithContent(agenticRequest);
        expect(secondResult).toEqual([]);
      });

      it('should include current file again if newConversation flag is set', async () => {
        const mockOpenTab = createMockOpenTab();

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        // First call
        const firstResult = await provider.retrieveContextItemsWithContent(agenticRequest);
        expect(firstResult).toHaveLength(1);

        // Second call with same file but newConversation flag
        const newConversationRequest: AIContextResolverRequest = {
          mode: 'agentic',
          newConversation: true,
        };
        const secondResult = await provider.retrieveContextItemsWithContent(newConversationRequest);
        expect(secondResult).toHaveLength(1);
      });

      it('should include current file if file path has changed', async () => {
        const firstFile = createMockOpenTab();
        const secondFile = createMockOpenTab({
          uri: 'file:///test/other.ts',
          fileRelativePath: 'test/other.ts',
        });

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValueOnce([firstFile]);

        // First call with first file
        const firstResult = await provider.retrieveContextItemsWithContent(agenticRequest);
        expect(firstResult).toHaveLength(1);

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValueOnce([secondFile]);

        // Second call with different file
        const secondResult = await provider.retrieveContextItemsWithContent(agenticRequest);
        expect(secondResult).toHaveLength(1);
      });

      it('should select most recent tab when multiple tabs exist', async () => {
        const olderTab = createMockOpenTab({
          uri: 'file:///test/old.ts',
          fileRelativePath: 'test/old.ts',
          lastAccessed: 1000,
        });
        const newerTab = createMockOpenTab({
          uri: 'file:///test/new.ts',
          fileRelativePath: 'test/new.ts',
          lastAccessed: 2000,
        });

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([olderTab, newerTab]);

        const result = await provider.retrieveContextItemsWithContent(agenticRequest);

        expect(result).toHaveLength(1);
      });

      it('should include manually added items along with current file', async () => {
        const mockOpenTab = createMockOpenTab();

        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        // Manually add another item
        const manualItem = {
          category: 'file' as const,
          content: '',
          id: 'current-file-file:///test/other.ts',
          metadata: {
            title: 'Other File',
            enabled: true,
            subType: 'open_tab' as const,
            icon: 'document',
            secondaryText: 'test/other.ts',
            subTypeLabel: 'Current File',
          },
        };
        await provider.addSelectedContextItem(manualItem);

        const result = await provider.retrieveContextItemsWithContent(agenticRequest);

        // Should have both: manually added item + auto-added current file
        expect(result).toHaveLength(2);

        // After retrieval, only manually added item should remain
        const selectedItems = await provider.getSelectedContextItems();
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0].id).toBe('current-file-file:///test/other.ts');
      });

      it('should handle errors when getting current open tab', async () => {
        jest.mocked(mockOpenTabsService.mostRecentTabs).mockImplementation(() => {
          throw new Error('Service error');
        });

        const result = await provider.retrieveContextItemsWithContent(agenticRequest);

        expect(result).toEqual([]);
      });
    });

    describe('non-agentic mode', () => {
      it('should return empty array when mode is not agentic', async () => {
        const mockOpenTab = createMockOpenTab();
        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        const classicRequest: AIContextResolverRequest = { mode: 'classic_chat' };
        const result = await provider.retrieveContextItemsWithContent(classicRequest);

        expect(result).toEqual([]);
      });

      it('should return empty array when mode is undefined', async () => {
        const mockOpenTab = createMockOpenTab();
        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        const result = await provider.retrieveContextItemsWithContent({});

        expect(result).toEqual([]);
      });

      it('should return empty array when no request is provided', async () => {
        const mockOpenTab = createMockOpenTab();
        jest.mocked(mockOpenTabsService.mostRecentTabs).mockReturnValue([mockOpenTab]);

        const result = await provider.retrieveContextItemsWithContent();

        expect(result).toEqual([]);
      });
    });
  });

  describe('context item management', () => {
    it('should allow manual addition and removal of context items', async () => {
      const item = {
        category: 'file' as const,
        content: '',
        id: 'current-file-file:///test/file.ts',
        metadata: {
          title: 'Current File',
          enabled: true,
          subType: 'open_tab' as const,
          icon: 'document',
          secondaryText: 'test/file.ts',
          subTypeLabel: 'Current File',
        },
      };

      await provider.addSelectedContextItem(item);

      let selectedItems = await provider.getSelectedContextItems();
      expect(selectedItems).toHaveLength(1);

      await provider.removeSelectedContextItem('current-file-file:///test/file.ts');

      selectedItems = await provider.getSelectedContextItems();
      expect(selectedItems).toHaveLength(0);
    });

    it('should clear all context items', async () => {
      const item = {
        category: 'file' as const,
        content: '',
        id: 'current-file-file:///test/file.ts',
        metadata: {
          title: 'Current File',
          enabled: true,
          subType: 'open_tab' as const,
          icon: 'document',
          secondaryText: 'test/file.ts',
          subTypeLabel: 'Current File',
        },
      };

      await provider.addSelectedContextItem(item);

      await provider.clearSelectedContextItems();

      const selectedItems = await provider.getSelectedContextItems();
      expect(selectedItems).toHaveLength(0);
    });
  });

  describe('getItemWithContent', () => {
    it('should return item as-is since content is already populated', async () => {
      const item = {
        category: 'file' as const,
        content: 'Current file: test/file.ts\nLast accessed: 2025-01-01T00:00:00.000Z',
        id: 'current-file-file:///test/file.ts',
        metadata: {
          title: 'Current File',
          enabled: true,
          subType: 'open_tab' as const,
          icon: 'document',
          secondaryText: 'test/file.ts',
          subTypeLabel: 'Current File',
        },
      };

      const result = await provider.getItemWithContent(item);

      expect(result).toBe(item);
      expect(result.content).toContain('Current file: test/file.ts');
    });
  });
});
