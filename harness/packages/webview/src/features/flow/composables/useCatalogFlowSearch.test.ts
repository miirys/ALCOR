import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CatalogFlowPage, CatalogFlowSummary } from '../types';

const mockSendRequest = vi.fn();

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({ sendRequest: mockSendRequest }),
}));

// Imported after the mock is registered.
// eslint-disable-next-line import/first
import { useCatalogFlowSearch } from './useCatalogFlowSearch';

function summary(uri: string, name = uri): CatalogFlowSummary {
  return {
    uri,
    id: `gid://gitlab/Ai::Catalog::Item/${uri}`,
    name,
    description: '',
    public: false,
    updatedAt: '2026-04-27T00:00:00Z',
    projectFullPath: 'group/proj',
    latestVersionName: '1.0.0',
  };
}

function pageOk(
  flows: CatalogFlowSummary[],
  hasNextPage = false,
  endCursor = '',
): { success: true; page: CatalogFlowPage } {
  return { success: true, page: { flows, pageInfo: { endCursor, hasNextPage } } };
}

const SEARCH_DEBOUNCE_MS = 250;

describe('useCatalogFlowSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSendRequest.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refresh fetches the first page and populates state', async () => {
    mockSendRequest.mockResolvedValueOnce(pageOk([summary('a'), summary('b')], true, 'cursor-1'));

    const search = useCatalogFlowSearch();
    await search.refresh();

    expect(search.flows.value).toHaveLength(2);
    expect(search.hasMore.value).toBe(true);
    expect(search.error.value).toBeNull();
    expect(mockSendRequest).toHaveBeenCalledWith('listCatalogFlows', {
      search: undefined,
      first: 25,
      after: undefined,
    });
  });

  it('setQuery debounces and triggers a fresh search', async () => {
    mockSendRequest.mockResolvedValue(pageOk([summary('hit')]));

    const search = useCatalogFlowSearch();
    search.setQuery('foo');
    expect(mockSendRequest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(mockSendRequest).toHaveBeenCalledTimes(1);
    expect(mockSendRequest).toHaveBeenLastCalledWith('listCatalogFlows', {
      search: 'foo',
      first: 25,
      after: undefined,
    });
    expect(search.flows.value).toHaveLength(1);
  });

  it('loadMore appends results using the previous cursor', async () => {
    mockSendRequest.mockResolvedValueOnce(pageOk([summary('a'), summary('b')], true, 'cursor-1'));
    mockSendRequest.mockResolvedValueOnce(pageOk([summary('c')], false, ''));

    const search = useCatalogFlowSearch();
    await search.refresh();
    await search.loadMore();

    expect(search.flows.value.map((f) => f.uri)).toEqual(['a', 'b', 'c']);
    expect(search.hasMore.value).toBe(false);
    expect(mockSendRequest).toHaveBeenLastCalledWith('listCatalogFlows', {
      search: undefined,
      first: 25,
      after: 'cursor-1',
    });
  });

  it('loadMore is a no-op when there is no next page', async () => {
    mockSendRequest.mockResolvedValueOnce(pageOk([summary('a')], false, ''));

    const search = useCatalogFlowSearch();
    await search.refresh();
    await search.loadMore();

    expect(mockSendRequest).toHaveBeenCalledTimes(1);
  });

  it('captures backend errors without throwing', async () => {
    mockSendRequest.mockResolvedValueOnce({ success: false, error: 'access denied' });

    const search = useCatalogFlowSearch();
    await search.refresh();

    expect(search.error.value).toBe('access denied');
    expect(search.flows.value).toEqual([]);
  });

  it('drops responses for superseded searches', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockSendRequest.mockReturnValueOnce(firstResponse);
    mockSendRequest.mockResolvedValueOnce(pageOk([summary('second-result')]));

    const search = useCatalogFlowSearch();
    const firstCall = search.refresh();
    const secondCall = search.refresh();

    resolveFirst(pageOk([summary('first-result')]));
    await Promise.all([firstCall, secondCall]);

    expect(search.flows.value).toHaveLength(1);
    expect(search.flows.value[0]?.uri).toBe('second-result');
  });

  it('reset clears state and ignores in-flight responses', async () => {
    let resolvePending: (v: unknown) => void = () => {};
    const pendingResponse = new Promise((resolve) => {
      resolvePending = resolve;
    });
    mockSendRequest.mockReturnValueOnce(pendingResponse);

    const search = useCatalogFlowSearch();
    const inFlight = search.refresh();
    search.reset();
    resolvePending(pageOk([summary('late-result')]));
    await inFlight;

    expect(search.flows.value).toEqual([]);
    expect(search.query.value).toBe('');
  });
});
