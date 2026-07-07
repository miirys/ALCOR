import { ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type { CatalogFlowSummary } from '../types';
import { getFlowMessageBus } from '../services/FlowMessageBus';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Drives an AI Catalog flow picker: maintains a debounced search query plus a
 * paginated list of summaries returned by the backend `listCatalogFlows`
 * request. Designed to be instantiated once per dialog instance.
 */
export function useCatalogFlowSearch() {
  const query = ref('');
  const flows = ref<CatalogFlowSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const endCursor = ref<string | null>(null);
  const hasMore = ref(false);
  // Bumped on every search() call; only the most recent generation may write.
  let generation = 0;

  async function fetchPage(after: string | null): Promise<void> {
    const myGeneration = generation;
    loading.value = true;
    error.value = null;

    try {
      const result = await getFlowMessageBus().sendRequest('listCatalogFlows', {
        search: query.value || undefined,
        first: PAGE_SIZE,
        after: after ?? undefined,
      });

      // Drop responses for stale searches.
      if (myGeneration !== generation) return;

      if (!result.success) {
        error.value = result.error;
        flows.value = after ? flows.value : [];
        endCursor.value = null;
        hasMore.value = false;
        return;
      }

      const incoming = result.page.flows;
      flows.value = after ? [...flows.value, ...incoming] : incoming;
      endCursor.value = result.page.pageInfo.endCursor || null;
      hasMore.value = result.page.pageInfo.hasNextPage;
    } catch (err) {
      if (myGeneration !== generation) return;
      error.value = err instanceof Error ? err.message : 'Failed to list catalog flows';
      flows.value = after ? flows.value : [];
      hasMore.value = false;
    } finally {
      if (myGeneration === generation) {
        loading.value = false;
      }
    }
  }

  /**
   * Run a fresh search from cursor zero. Internal — call `setQuery()` from
   * the UI for debounced typing, or `refresh()` for explicit re-fetch.
   */
  async function search(): Promise<void> {
    generation += 1;
    endCursor.value = null;
    hasMore.value = false;
    await fetchPage(null);
  }

  const debouncedSearch = useDebounceFn(search, SEARCH_DEBOUNCE_MS);

  function setQuery(next: string): void {
    if (next === query.value) return;
    query.value = next;
    debouncedSearch().catch(() => {
      /* errors are surfaced through the `error` ref */
    });
  }

  async function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value || !endCursor.value) return;
    await fetchPage(endCursor.value);
  }

  function reset(): void {
    generation += 1;
    query.value = '';
    flows.value = [];
    loading.value = false;
    error.value = null;
    endCursor.value = null;
    hasMore.value = false;
  }

  async function refresh(): Promise<void> {
    await search();
  }

  return {
    query,
    flows,
    loading,
    error,
    hasMore,
    setQuery,
    loadMore,
    refresh,
    reset,
  };
}
