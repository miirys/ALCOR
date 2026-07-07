import { AIContextCategory, AIContextItem, ChatContextManager } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initAIContextController } from './context';

describe('AIContextController', () => {
  let mockChatContextManager: ChatContextManager;
  let contextController: ReturnType<typeof initAIContextController>;
  let contextItem: AIContextItem;
  let contextItems: AIContextItem[];

  beforeEach(() => {
    mockChatContextManager = createFakePartial<ChatContextManager>({
      addSelectedContextItem: jest.fn(),
      removeSelectedContextItem: jest.fn(),
      clearSelectedContextItems: jest.fn(),
      searchContextItems: jest.fn(),
      getAvailableCategories: jest.fn(),
      getSelectedContextItems: jest.fn(),
      getItemWithContent: jest.fn(),
    });

    contextController = initAIContextController(mockChatContextManager);

    contextItem = {
      id: 'file:///path/to/file.ts',
      category: 'file',
      metadata: {
        title: 'file.ts',
        enabled: true,
        subType: 'open_tab',
        icon: 'document',
        secondaryText: '/path/to/file.ts',
        subTypeLabel: 'Project file',
      },
    };

    contextItems = [contextItem];
  });

  describe('addContextItem', () => {
    it('adds the context item to the context manager', async () => {
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue(contextItems);

      await contextController.addContextItem(contextItem);

      expect(mockChatContextManager.addSelectedContextItem).toHaveBeenCalledWith(contextItem);
    });

    it('returns refreshed context items after adding', async () => {
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue(contextItems);

      const result = await contextController.addContextItem(contextItem);

      expect(mockChatContextManager.getSelectedContextItems).toHaveBeenCalled();
      expect(result).toEqual({
        eventName: 'setContextCurrentItemsResult',
        data: contextItems,
      });
    });
  });

  describe('removeContextItem', () => {
    it('removes the context item from the context manager', async () => {
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue([]);

      await contextController.removeContextItem(contextItem);

      expect(mockChatContextManager.removeSelectedContextItem).toHaveBeenCalledWith(contextItem);
    });

    it('returns refreshed context items after removing', async () => {
      const remainingItems: AIContextItem[] = [];
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue(remainingItems);

      const result = await contextController.removeContextItem(contextItem);

      expect(mockChatContextManager.getSelectedContextItems).toHaveBeenCalled();
      expect(result).toEqual({
        eventName: 'setContextCurrentItemsResult',
        data: remainingItems,
      });
    });
  });

  describe('clearSelectedContextItems', () => {
    it('clears all selected context items from the context manager', async () => {
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue([]);

      await contextController.clearSelectedContextItems();

      expect(mockChatContextManager.clearSelectedContextItems).toHaveBeenCalled();
    });

    it('returns refreshed context items after clearing', async () => {
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue([]);

      const result = await contextController.clearSelectedContextItems();

      expect(mockChatContextManager.getSelectedContextItems).toHaveBeenCalled();
      expect(result).toEqual({
        eventName: 'setContextCurrentItemsResult',
        data: [],
      });
    });
  });

  describe('searchContextItems', () => {
    const searchRequest = { query: 'test', category: 'file' as const };

    it('makes a search request and returns the result', async () => {
      jest.mocked(mockChatContextManager.searchContextItems).mockResolvedValue(contextItems);

      const result = await contextController.searchContextItems(searchRequest);

      expect(mockChatContextManager.searchContextItems).toHaveBeenCalledWith({
        ...searchRequest,
      });

      expect(result).toEqual({
        eventName: 'setContextItemSearchResult',
        data: { results: contextItems },
      });
    });

    it('handles search errors and returns error message', async () => {
      const errorMessage = 'Search failed';
      const error = new Error(errorMessage);
      jest.mocked(mockChatContextManager.searchContextItems).mockRejectedValue(error);

      const result = await contextController.searchContextItems(searchRequest);

      expect(result).toEqual({
        eventName: 'setContextItemSearchResult',
        data: { errorMessage },
      });
    });
  });

  describe('getContextCategories', () => {
    it('returns all available categories', async () => {
      const categories = createFakePartial<AIContextCategory[]>(['file', 'issue', 'merge_request']);
      jest.mocked(mockChatContextManager.getAvailableCategories).mockResolvedValue(categories);

      const result = await contextController.getContextCategories();

      expect(mockChatContextManager.getAvailableCategories).toHaveBeenCalled();
      expect(result).toEqual({
        eventName: 'setContextCategoriesResult',
        data: categories,
      });
    });

    it('handles empty categories', async () => {
      const categories: AIContextCategory[] = [];
      jest.mocked(mockChatContextManager.getAvailableCategories).mockResolvedValue(categories);

      const result = await contextController.getContextCategories();

      expect(result).toEqual({
        eventName: 'setContextCategoriesResult',
        data: categories,
      });
    });
  });

  describe('getSelectedContextItemContent', () => {
    const hydratedContextItem: AIContextItem = {
      ...contextItem,
      content: 'file content here',
    };

    const otherContextItem: AIContextItem = {
      id: 'file:///path/to/other.ts',
      category: 'file',
      metadata: {
        title: 'other.ts',
        enabled: true,
        subType: 'open_tab',
        icon: 'document',
        secondaryText: '/path/to/other.ts',
        subTypeLabel: 'Project file',
      },
    };

    it('gets item content and updates the matching item in current items', async () => {
      const currentItems = [contextItem, otherContextItem];
      jest.mocked(mockChatContextManager.getItemWithContent).mockResolvedValue(hydratedContextItem);
      jest.mocked(mockChatContextManager.getSelectedContextItems).mockResolvedValue(currentItems);

      const result = await contextController.getSelectedContextItemContent({
        contextItem,
        messageId: 'msg-123',
      });

      expect(mockChatContextManager.getItemWithContent).toHaveBeenCalledWith(contextItem);
      expect(mockChatContextManager.getSelectedContextItems).toHaveBeenCalled();

      expect(result).toEqual({
        eventName: 'setContextCurrentItemsResult',
        data: [hydratedContextItem, otherContextItem],
      });
    });
  });
});
