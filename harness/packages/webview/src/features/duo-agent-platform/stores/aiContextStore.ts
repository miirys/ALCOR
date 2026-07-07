import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type {
  AIContextItem,
  AIContextCategory,
  ContextItemsMutationResult,
} from '@gitlab-org/lib-duo-agent-platform/webview';
import {
  getDuoAgentPlatformMessageBus,
  disposeDuoAgentPlatformMessageBus,
  type DuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';

const SEARCH_DEBOUNCE_MS = 500;

export interface CategoryDisplayData {
  label: string;
  value: AIContextCategory;
}

const CATEGORY_DISPLAY_DATA: CategoryDisplayData[] = [
  { label: 'Files', value: 'file' },
  { label: 'Directories', value: 'directory' },
  { label: 'Local Git', value: 'local_git' },
  { label: 'Issues', value: 'issue' },
  { label: 'Merge Requests', value: 'merge_request' },
  { label: 'Dependencies', value: 'dependency' },
  {
    label: 'Repositories',
    value: 'repository',
  },
];

export const useAIContextStore = defineStore('ai_context', () => {
  const messageBus: DuoAgentPlatformMessageBus = getDuoAgentPlatformMessageBus();
  let searchToken = 0;
  let categoriesToken = 0;

  const contextCategories = ref<CategoryDisplayData[] | null>(null);
  const contextSelections = ref<AIContextItem[]>([]);
  const contextSearchResults = ref<AIContextItem[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  messageBus.onNotification('setContextCurrentItemsResult', (items: AIContextItem[]) => {
    contextSelections.value = items;
  });

  async function getContextCategories() {
    categoriesToken += 1;
    const requestToken = categoriesToken;
    try {
      const categories = await messageBus.sendRequest('getContextCategories', undefined);
      if (requestToken !== categoriesToken) return;
      contextCategories.value = CATEGORY_DISPLAY_DATA.filter((c) => categories.includes(c.value));
      error.value = null;
    } catch (e) {
      if (requestToken !== categoriesToken) return;
      error.value = `Failed to get context categories: ${e instanceof Error ? e.message : 'Unknown error'}`;
      contextCategories.value = [];
    }
  }

  async function executeSearch(query: string, targets: AIContextCategory[], token: number) {
    try {
      const responses = await Promise.all(
        targets.map((cat) =>
          messageBus.sendRequest('searchContextItems', { query, category: cat }),
        ),
      );

      if (token !== searchToken) return;

      const merged: AIContextItem[] = [];
      for (const res of responses) {
        if (res.success) {
          merged.push(...res.results);
        } else {
          error.value = res.error;
        }
      }
      contextSearchResults.value = merged;
    } catch (e) {
      if (token !== searchToken) return;
      error.value = `Failed to search context items: ${e instanceof Error ? e.message : 'Unknown error'}`;
    } finally {
      if (token === searchToken) isLoading.value = false;
    }
  }

  const debouncedExecuteSearch = useDebounceFn(executeSearch, SEARCH_DEBOUNCE_MS);

  function searchContextItems(query: string, category: AIContextCategory | null) {
    const targets =
      category === null ? (contextCategories.value ?? []).map((c) => c.value) : [category];

    contextSearchResults.value = [];
    error.value = null;

    if (targets.length === 0) {
      isLoading.value = false;
      return;
    }

    searchToken += 1;
    isLoading.value = true;
    debouncedExecuteSearch(query, targets, searchToken).catch(() => {});
  }

  function applyMutationResult(res: ContextItemsMutationResult) {
    if (res.success) {
      contextSelections.value = res.items;
      error.value = null;
    } else {
      error.value = res.error;
    }
  }

  async function addContextItem(item: AIContextItem) {
    const res = await messageBus.sendRequest('addContextItem', item);
    if (res.success) {
      // remove added item from the dropdown
      contextSearchResults.value = contextSearchResults.value.filter((r) => r.id !== item.id);
    }
    applyMutationResult(res);
  }

  async function removeContextItem(item: AIContextItem) {
    applyMutationResult(await messageBus.sendRequest('removeContextItem', item));
  }

  async function clearSelectedContextItems() {
    applyMutationResult(await messageBus.sendRequest('clearSelectedContextItems', undefined));
  }

  function $reset() {
    contextCategories.value = null;
    contextSelections.value = [];
    contextSearchResults.value = [];
    isLoading.value = false;
    error.value = null;
  }

  function dispose() {
    disposeDuoAgentPlatformMessageBus();
  }

  return {
    contextCategories,
    contextSelections,
    contextSearchResults,
    isLoading,
    error,

    dispose,
    $reset,

    getContextCategories,
    searchContextItems,
    addContextItem,
    removeContextItem,
    clearSelectedContextItems,
  };
});
