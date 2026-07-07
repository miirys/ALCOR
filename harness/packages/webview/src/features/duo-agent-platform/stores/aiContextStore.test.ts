import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { AIContextItem } from '@gitlab-org/lib-duo-agent-platform/webview';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { useAIContextStore } from './aiContextStore';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  onNotification: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
}

const fileItem = (id: string): AIContextItem =>
  ({
    id,
    category: 'file',
    metadata: { title: `${id}.ts`, enabled: true },
  }) as unknown as AIContextItem;

const dirItem = (id: string): AIContextItem =>
  ({
    id,
    category: 'directory',
    metadata: { title: id, enabled: true },
  }) as unknown as AIContextItem;

describe('aiContextStore', () => {
  let mockMessageBus: MockMessageBus;
  let store: ReturnType<typeof useAIContextStore>;

  /** Replays a server-pushed notification to whichever handler the store registered. */
  function pushNotification(method: string, payload: unknown) {
    const call = mockMessageBus.onNotification.mock.calls.find(([m]) => m === method);
    if (!call) throw new Error(`No handler registered for ${method}`);
    call[1](payload);
  }

  beforeEach(() => {
    setActivePinia(createPinia());

    mockMessageBus = {
      onNotification: vi.fn(),
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    store = useAIContextStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts empty and registers the selection-broadcast listener', () => {
      expect(store.contextCategories).toBeNull();
      expect(store.contextSelections).toEqual([]);
      expect(store.contextSearchResults).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(mockMessageBus.onNotification).toHaveBeenCalledWith(
        'setContextCurrentItemsResult',
        expect.any(Function),
      );
    });
  });

  describe('setContextCurrentItemsResult listener', () => {
    it('replaces the selection list with whatever the server pushes', () => {
      const items = [fileItem('a'), fileItem('b')];

      pushNotification('setContextCurrentItemsResult', items);

      expect(store.contextSelections).toEqual(items);
    });
  });

  describe('getContextCategories', () => {
    it('keeps only the categories the server says are available', async () => {
      mockMessageBus.sendRequest.mockResolvedValue(['file', 'merge_request']);

      await store.getContextCategories();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('getContextCategories', undefined);
      expect(store.contextCategories?.map((c) => c.value)).toEqual(['file', 'merge_request']);
    });

    it('records an error and clears categories when the request fails', async () => {
      mockMessageBus.sendRequest.mockRejectedValue(new Error('offline'));

      await store.getContextCategories();

      expect(store.contextCategories).toEqual([]);
      expect(store.error).toContain('offline');
    });
  });

  describe('searchContextItems', () => {
    beforeEach(async () => {
      mockMessageBus.sendRequest.mockResolvedValueOnce(['file', 'directory']);
      await store.getContextCategories();
      mockMessageBus.sendRequest.mockReset();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Fires the debounced fetch and flushes its microtasks. */
    const flushDebounce = () => vi.runOnlyPendingTimersAsync();

    it('reflects pending state synchronously, before the debounced fetch fires', () => {
      store.contextSearchResults = [fileItem('stale')];

      store.searchContextItems('hello', 'file');

      expect(store.isLoading).toBe(true);
      expect(store.contextSearchResults).toEqual([]);
      expect(store.error).toBeNull();
      expect(mockMessageBus.sendRequest).not.toHaveBeenCalled();
    });

    it('sends a single request scoped to the chosen category', async () => {
      const item = fileItem('a');
      mockMessageBus.sendRequest.mockResolvedValue({ success: true, results: [item] });

      store.searchContextItems('hello', 'file');
      await flushDebounce();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledTimes(1);
      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('searchContextItems', {
        query: 'hello',
        category: 'file',
      });
      expect(store.contextSearchResults).toEqual([item]);
      expect(store.isLoading).toBe(false);
    });

    it('fans out to every available category when no filter is set, merging results', async () => {
      const file = fileItem('a');
      const dir = dirItem('b');
      mockMessageBus.sendRequest.mockImplementation(async (_method: string, params: unknown) => {
        const { category } = params as { category: string };
        return category === 'file'
          ? { success: true, results: [file] }
          : { success: true, results: [dir] };
      });

      store.searchContextItems('hello', null);
      await flushDebounce();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledTimes(2);
      expect(store.contextSearchResults).toEqual(expect.arrayContaining([file, dir]));
      expect(store.contextSearchResults).toHaveLength(2);
    });

    it('does nothing when there are no categories to fan out to', async () => {
      store.$reset();

      store.searchContextItems('hello', null);
      await flushDebounce();

      expect(mockMessageBus.sendRequest).not.toHaveBeenCalled();
      expect(store.contextSearchResults).toEqual([]);
      expect(store.isLoading).toBe(false);
    });

    it('captures error messages from failed responses', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({ success: false, error: 'rate-limited' });

      store.searchContextItems('hello', 'file');
      await flushDebounce();

      expect(store.error).toBe('rate-limited');
      expect(store.contextSearchResults).toEqual([]);
    });

    it('coalesces rapid successive calls into a single trailing fetch', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({ success: true, results: [fileItem('z')] });

      store.searchContextItems('h', 'file');
      store.searchContextItems('he', 'file');
      store.searchContextItems('hel', 'file');
      await flushDebounce();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledTimes(1);
      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('searchContextItems', {
        query: 'hel',
        category: 'file',
      });
    });

    it('discards results from a search that has been superseded', async () => {
      let resolveFirst: (v: unknown) => void = () => {};
      mockMessageBus.sendRequest.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }) as never,
      );

      store.searchContextItems('old', 'file');
      await flushDebounce(); // first fetch fires, hangs on resolveFirst

      mockMessageBus.sendRequest.mockResolvedValueOnce({
        success: true,
        results: [fileItem('new')],
      });
      store.searchContextItems('new', 'file');
      await flushDebounce(); // second fetch fires and resolves

      // First fetch completes after the second — its results must not overwrite
      resolveFirst({ success: true, results: [fileItem('stale')] });
      await flushDebounce();

      expect(store.contextSearchResults.map((i) => i.id)).toEqual(['new']);
    });

    it('toggles loading from the initial call through fetch resolution', async () => {
      let resolve: (v: unknown) => void = () => {};
      mockMessageBus.sendRequest.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );

      store.searchContextItems('hello', 'file');
      expect(store.isLoading).toBe(true);

      await flushDebounce();
      expect(store.isLoading).toBe(true);

      resolve({ success: true, results: [] });
      await flushDebounce();

      expect(store.isLoading).toBe(false);
    });
  });

  describe('addContextItem', () => {
    it('updates selections from the response and removes the added item from search results', async () => {
      const item = fileItem('a');
      const other = fileItem('b');
      store.contextSearchResults = [item, other];
      mockMessageBus.sendRequest.mockResolvedValue({ success: true, items: [item] });

      await store.addContextItem(item);

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('addContextItem', item);
      expect(store.contextSelections).toEqual([item]);
      expect(store.contextSearchResults).toEqual([other]);
    });

    it('records the error when the server returns failure', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({ success: false, error: 'denied' });

      await store.addContextItem(fileItem('a'));

      expect(store.error).toBe('denied');
      expect(store.contextSelections).toEqual([]);
    });
  });

  describe('removeContextItem', () => {
    it('updates selections from the response', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({ success: true, items: [] });

      await store.removeContextItem(fileItem('a'));

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('removeContextItem', fileItem('a'));
      expect(store.contextSelections).toEqual([]);
    });
  });

  describe('clearSelectedContextItems', () => {
    it('clears the selection list', async () => {
      store.contextSelections = [fileItem('a'), fileItem('b')];
      mockMessageBus.sendRequest.mockResolvedValue({ success: true, items: [] });

      await store.clearSelectedContextItems();

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith(
        'clearSelectedContextItems',
        undefined,
      );
      expect(store.contextSelections).toEqual([]);
    });
  });

  describe('$reset', () => {
    it('clears every piece of derived state', async () => {
      mockMessageBus.sendRequest.mockResolvedValue(['file']);
      await store.getContextCategories();
      store.contextSelections = [fileItem('a')];
      store.contextSearchResults = [fileItem('b')];
      store.error = 'something';

      store.$reset();

      expect(store.contextCategories).toBeNull();
      expect(store.contextSelections).toEqual([]);
      expect(store.contextSearchResults).toEqual([]);
      expect(store.error).toBeNull();
      expect(store.isLoading).toBe(false);
    });
  });

  describe('dispose', () => {
    it('disposes the underlying message bus', () => {
      store.dispose();

      expect(DuoAgentPlatformMessageBusModule.disposeDuoAgentPlatformMessageBus).toHaveBeenCalled();
    });
  });
});
