import { defineStore } from 'pinia';

const categoryDisplayData = [
  { label: 'Files', value: 'file', icon: 'document' },
  { label: 'Directories', value: 'directory', icon: 'folder' },
  { label: 'Local Git', value: 'local_git', icon: 'git' },
  { label: 'Issues', value: 'issue', icon: 'issues' },
  { label: 'Merge Requests', value: 'merge_request', icon: 'merge-request' },
  { label: 'Dependencies', value: 'dependency', icon: 'package' },
  {
    label: 'Repositories',
    value: 'repository',
    icon: 'project',
    tooltip: 'Best for broad relational questions. Fills context quickly.',
  },
];

export const useAIContextStore = defineStore('ai_context', {
  state: () => ({
    contextMenuCategories: null,
    contextMenuIsLoading: false,
    contextMenuError: null,
    contextSelections: [],
    contextSearchResults: [],
  }),
  actions: {
    getContextCategories() {
      this.sendNotification('getContextCategories');
    },
    clearSelectedContextItems() {
      this.sendNotification('clearSelectedContextItems');
    },
    onContextMenuSearch({ category, query }) {
      this.contextMenuIsLoading = true;
      this.contextMenuError = null;

      this.sendNotification('searchContextItems', {
        query,
        category,
      });
    },
    onSelectContextItem(item) {
      this.contextSearchResults = this.contextSearchResults.filter(
        (result) => result.id !== item.id,
      );
      this.sendNotification('addContextItem', item);
    },
    onRemoveContextItem(item) {
      this.sendNotification('removeContextItem', item);
    },
    onGetContextItemContent({ contextItem, messageId }) {
      this.sendNotification('getSelectedContextItemContent', {
        contextItem,
        messageId,
      });
    },
    setContextCategoriesResult(categories) {
      this.contextMenuCategories = categoryDisplayData.filter((category) =>
        categories.includes(category.value),
      );
    },
    setContextCurrentItemsResult(items) {
      this.contextSelections = items;
    },
    setContextItemSearchResult({ results, errorMessage }) {
      this.contextSearchResults = results;
      this.contextMenuError = errorMessage || null;
      this.contextMenuIsLoading = false;
    },
  },
  events: {
    setContextCategoriesResult: 'setContextCategoriesResult',
    setContextCurrentItemsResult: 'setContextCurrentItemsResult',
    setContextItemSearchResult: 'setContextItemSearchResult',
  },
});
