import { setActivePinia, createPinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useAIContextStore } from './ai_context';

describe('AI Context Store', () => {
  let aiContextStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);

    aiContextStore = useAIContextStore();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('initial state', () => {
    it('has correct default state', () => {
      expect(aiContextStore.contextMenuCategories).toBeNull();
      expect(aiContextStore.contextMenuIsLoading).toBe(false);
      expect(aiContextStore.contextMenuError).toBeNull();
      expect(aiContextStore.contextSelections).toEqual([]);
      expect(aiContextStore.contextSearchResults).toEqual([]);
    });
  });

  describe('getContextCategories', () => {
    it('sends request to get available categories', () => {
      aiContextStore.getContextCategories();
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('getContextCategories');
    });
  });

  describe('clearSelectedContextItems', () => {
    it('sends request to clear selected context items', () => {
      aiContextStore.clearSelectedContextItems();
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'clearSelectedContextItems',
      );
    });
  });

  describe('onContextMenuSearch', () => {
    const payload = { category: 'git', query: 'search' };

    beforeEach(() => {
      aiContextStore.contextMenuError = 'error';
      aiContextStore.contextMenuIsLoading = false;
      aiContextStore.onContextMenuSearch(payload);
    });

    it('sends request to search context items', () => {
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'searchContextItems',
        payload,
      );
    });

    it('resets the error', () => {
      expect(aiContextStore.contextMenuError).toBeNull();
    });

    it('sets menu to loading', () => {
      expect(aiContextStore.contextMenuIsLoading).toBe(true);
    });
  });

  describe('onSelectContextItem', () => {
    let selectedItem;
    let item1;
    let item2;

    beforeEach(() => {
      selectedItem = { id: 1 };
      item1 = { id: 1, content: 'MR 1' };
      item2 = { id: 2, content: 'Issue 2' };
      aiContextStore.setContextItemSearchResult({
        results: [item1, item2],
      });
    });

    it('sends request to add context item', () => {
      aiContextStore.onSelectContextItem(selectedItem);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'addContextItem',
        selectedItem,
      );
    });

    it('should filter out selected item from the context search results', () => {
      aiContextStore.onSelectContextItem(selectedItem);
      expect(aiContextStore.contextSearchResults).toEqual([item2]);
    });

    it('should not affect search results if item not found', () => {
      const nonExistentItem = { id: 999 };
      aiContextStore.onSelectContextItem(nonExistentItem);
      expect(aiContextStore.contextSearchResults).toEqual([item1, item2]);
    });
  });

  describe('onRemoveContextItem', () => {
    it('sends request to remove context item', () => {
      const item = { id: 1, content: 'Test item' };
      aiContextStore.onRemoveContextItem(item);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('removeContextItem', item);
    });
  });

  describe('onGetContextItemContent', () => {
    it('sends request to get context item content', () => {
      const contextItem = { id: 1, content: 'Test item' };
      const messageId = 'msg-123';
      aiContextStore.onGetContextItemContent({ contextItem, messageId });

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'getSelectedContextItemContent',
        {
          contextItem,
          messageId,
        },
      );
    });
  });

  describe('setContextCategoriesResult', () => {
    it('filters and sets available categories based on provided categories', () => {
      const availableCategories = ['file', 'issue', 'merge_request'];
      aiContextStore.setContextCategoriesResult(availableCategories);

      expect(aiContextStore.contextMenuCategories).toHaveLength(3);
      expect(aiContextStore.contextMenuCategories[0]).toEqual({
        label: 'Files',
        value: 'file',
        icon: 'document',
      });
      expect(aiContextStore.contextMenuCategories[1]).toEqual({
        label: 'Issues',
        value: 'issue',
        icon: 'issues',
      });
      expect(aiContextStore.contextMenuCategories[2]).toEqual({
        label: 'Merge Requests',
        value: 'merge_request',
        icon: 'merge-request',
      });
    });

    it('filters out unknown categories', () => {
      aiContextStore.setContextCategoriesResult(['file', 'unknown_category', 'issue']);
      expect(aiContextStore.contextMenuCategories).toHaveLength(2);
      expect(aiContextStore.contextMenuCategories.map((c) => c.value)).toEqual(['file', 'issue']);
    });
  });

  describe('setContextCurrentItemsResult', () => {
    it('sets the current context selections', () => {
      const items = [
        { id: 1, content: 'Item 1' },
        { id: 2, content: 'Item 2' },
      ];
      aiContextStore.setContextCurrentItemsResult(items);
      expect(aiContextStore.contextSelections).toEqual(items);
    });

    it('replaces existing selections', () => {
      aiContextStore.contextSelections = [{ id: 999, content: 'Old item' }];
      const newItems = [{ id: 1, content: 'New item' }];
      aiContextStore.setContextCurrentItemsResult(newItems);
      expect(aiContextStore.contextSelections).toEqual(newItems);
    });
  });

  describe('setContextItemSearchResult', () => {
    it('sets search results and clears loading state', () => {
      const results = [{ id: 1, content: 'Result 1' }];
      aiContextStore.contextMenuIsLoading = true;
      aiContextStore.contextMenuError = 'Previous error';

      aiContextStore.setContextItemSearchResult({ results });

      expect(aiContextStore.contextSearchResults).toEqual(results);
      expect(aiContextStore.contextMenuIsLoading).toBe(false);
      expect(aiContextStore.contextMenuError).toBeNull();
    });

    it('sets error message when provided', () => {
      const errorMessage = 'Search failed';
      aiContextStore.contextMenuIsLoading = true;

      aiContextStore.setContextItemSearchResult({ results: [], errorMessage });

      expect(aiContextStore.contextSearchResults).toEqual([]);
      expect(aiContextStore.contextMenuError).toBe(errorMessage);
      expect(aiContextStore.contextMenuIsLoading).toBe(false);
    });

    it('handles empty results', () => {
      aiContextStore.setContextItemSearchResult({ results: [] });
      expect(aiContextStore.contextSearchResults).toEqual([]);
      expect(aiContextStore.contextMenuError).toBeNull();
    });

    it('handles undefined results', () => {
      aiContextStore.setContextItemSearchResult({});
      expect(aiContextStore.contextSearchResults).toBeUndefined();
      expect(aiContextStore.contextMenuError).toBeNull();
    });
  });
});
