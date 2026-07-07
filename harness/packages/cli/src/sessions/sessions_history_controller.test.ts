import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  type AppState,
  type SessionListItem,
  type SessionsSearchInputState,
} from '@gitlab-org/tui';
import { ErrorHandler } from '@gitlab-org/errors';
import type { ControllerApi, StateMutation } from '../commands/tui/controller_api';
import type { SessionManager } from './session_manager';
import type { SessionHistoryPage, SessionHistoryPageInfo } from './session_history';
import type { Session } from './session';
import {
  DefaultSessionsHistoryController,
  SEARCH_DEBOUNCE_MS,
} from './sessions_history_controller';

const createSessionsSearchState = (overrides: Partial<SessionsSearchInputState> = {}): AppState =>
  createFakePartial<AppState>({
    input: {
      inputType: CLI_INPUT_TYPES.SESSIONS_SEARCH,
      searchQuery: '',
      sessions: [],
      selectedIndex: 0,
      isLoading: false,
      hasNextPage: false,
      ...overrides,
    },
  });

describe('DefaultSessionsHistoryController', () => {
  let controller: DefaultSessionsHistoryController;
  let mockSessionManager: SessionManager;
  let mockErrorHandler: ErrorHandler;
  let mockApi: ControllerApi;
  let currentState: AppState;

  beforeEach(() => {
    currentState = createSessionsSearchState();

    mockSessionManager = createFakePartial<SessionManager>({
      getSessionHistory: jest.fn<SessionManager['getSessionHistory']>(),
      switchToSession: jest.fn<SessionManager['switchToSession']>(),
    });

    mockErrorHandler = createFakePartial<ErrorHandler>({
      handleError: jest.fn(),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn((mutation: StateMutation) => {
        currentState = mutation(currentState);
        return currentState;
      }),
      showError: jest.fn(),
      ensureInitialized: jest.fn<ControllerApi['ensureInitialized']>().mockResolvedValue(undefined),
    });

    controller = new DefaultSessionsHistoryController(
      new TestLogger(),
      mockSessionManager,
      mockErrorHandler,
    );
  });

  describe('openSearch', () => {
    describe('when session history returns items', () => {
      const historyItems: SessionListItem[] = [
        {
          id: 'session-1',
          title: 'Debug auth',
          status: 'RUNNING',
          lastActivity: '2026-02-20T10:00:00Z',
        },
        {
          id: 'session-2',
          title: 'Refactor CLI',
          status: 'RUNNING',
          lastActivity: '2026-02-19T15:30:00Z',
        },
      ];

      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValue(
          createFakePartial<SessionHistoryPage>({
            items: historyItems,
            pageInfo: createFakePartial<SessionHistoryPageInfo>({
              hasNextPage: true,
              endCursor: 'cursor-abc',
            }),
          }),
        );

        await controller.openSearch(mockApi);
      });

      it('calls getSessionHistory with a signal', () => {
        expect(mockSessionManager.getSessionHistory).toHaveBeenCalledWith({
          signal: expect.any(AbortSignal),
        });
      });

      it('calls mutateState twice (loading + data)', () => {
        expect(mockApi.mutateState).toHaveBeenCalledTimes(2);
      });

      it('sets sessions from the fetched items', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.sessions).toEqual(historyItems);
      });

      it('sets isLoading to false', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.isLoading).toBe(false);
      });

      it('sets hasNextPage from pageInfo', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.hasNextPage).toBe(true);
      });
    });

    describe('loading mutation', () => {
      let loadingMutation: StateMutation;

      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValue(
          createFakePartial<SessionHistoryPage>({
            items: [],
            pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
          }),
        );

        await controller.openSearch(mockApi);

        [[loadingMutation]] = jest.mocked(mockApi.mutateState).mock.calls;
      });

      it('sets input type to SESSIONS_SEARCH', () => {
        const result = loadingMutation({ existing: 'state' } as never);
        const input = result.input as SessionsSearchInputState;
        expect(input.inputType).toBe(CLI_INPUT_TYPES.SESSIONS_SEARCH);
      });

      it('sets isLoading to true', () => {
        const result = loadingMutation({ existing: 'state' } as never);
        const input = result.input as SessionsSearchInputState;
        expect(input.isLoading).toBe(true);
      });

      it('sets sessions to empty array', () => {
        const result = loadingMutation({ existing: 'state' } as never);
        const input = result.input as SessionsSearchInputState;
        expect(input.sessions).toEqual([]);
      });

      it('sets searchQuery to empty string', () => {
        const result = loadingMutation({ existing: 'state' } as never);
        const input = result.input as SessionsSearchInputState;
        expect(input.searchQuery).toBe('');
      });
    });

    describe('when data mutation receives state with existing searchQuery', () => {
      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValue(
          createFakePartial<SessionHistoryPage>({
            items: [],
            pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
          }),
        );

        await controller.openSearch(mockApi);
      });

      it('preserves the searchQuery from existing state', () => {
        const dataMutation = jest.mocked(mockApi.mutateState).mock.calls[1][0];
        const stateWithQuery = createSessionsSearchState({ searchQuery: 'my-search' });
        const result = dataMutation(stateWithQuery);
        const input = result.input as SessionsSearchInputState;

        expect(input.searchQuery).toBe('my-search');
      });
    });

    describe('when session history throws an error', () => {
      beforeEach(async () => {
        jest
          .mocked(mockSessionManager.getSessionHistory)
          .mockRejectedValue(new Error('network failure'));

        await controller.openSearch(mockApi);
      });

      it('resets to empty state with isLoading false', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.isLoading).toBe(false);
        expect(input.sessions).toEqual([]);
        expect(input.hasNextPage).toBe(false);
      });

      it('calls api.showError', () => {
        expect(mockApi.showError).toHaveBeenCalledWith(
          'Failed to load session history. Please try again.',
        );
      });
    });

    describe('when user cancels during loading (input type changes)', () => {
      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValue(
          createFakePartial<SessionHistoryPage>({
            items: [{ id: 's-1', title: 'Test', status: 'active', lastActivity: '2026-01-01' }],
            pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
          }),
        );

        await controller.openSearch(mockApi);
      });

      it('returns state unchanged when input type is no longer sessions search', () => {
        const dataMutation = jest.mocked(mockApi.mutateState).mock.calls[1][0];
        const cancelledState = createFakePartial<AppState>({
          input: { inputType: CLI_INPUT_TYPES.TEXT, lines: [], cursorLine: 0, cursorColumn: 0 },
        });

        const result = dataMutation(cancelledState);

        expect(result).toBe(cancelledState);
      });
    });

    describe('when user cancels during loading and fetch fails', () => {
      beforeEach(async () => {
        jest
          .mocked(mockSessionManager.getSessionHistory)
          .mockRejectedValue(new Error('network failure'));

        await controller.openSearch(mockApi);
      });

      it('returns state unchanged when input type is no longer sessions search', () => {
        const errorMutation = jest.mocked(mockApi.mutateState).mock.calls[1][0];
        const cancelledState = createFakePartial<AppState>({
          input: { inputType: CLI_INPUT_TYPES.TEXT, lines: [], cursorLine: 0, cursorColumn: 0 },
        });

        const result = errorMutation(cancelledState);

        expect(result).toBe(cancelledState);
      });
    });

    describe('when the request is aborted mid-flight', () => {
      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockImplementation(async () => {
          controller.cancelSearch(mockApi);
          throw new Error('network error');
        });

        await controller.openSearch(mockApi);
      });

      it('silently ignores the error', () => {
        expect(mockApi.showError).not.toHaveBeenCalled();
      });
    });
  });

  describe('cancelSearch', () => {
    beforeEach(() => {
      controller.cancelSearch(mockApi);
    });

    it('resets input to defaultInputState', () => {
      expect(currentState.input).toEqual(defaultInputState);
    });
  });

  describe('searchQueryChanged', () => {
    describe('when input type is SESSIONS_SEARCH', () => {
      beforeEach(() => {
        currentState = createSessionsSearchState({ selectedIndex: 5 });
        controller.searchQueryChanged(mockApi, 'new query');
      });

      it('updates searchQuery in state', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.searchQuery).toBe('new query');
      });

      it('resets selectedIndex to 0', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.selectedIndex).toBe(0);
      });
    });

    describe('when input type is not SESSIONS_SEARCH', () => {
      beforeEach(() => {
        currentState = createFakePartial<AppState>({
          input: { inputType: CLI_INPUT_TYPES.TEXT, lines: [], cursorLine: 0, cursorColumn: 0 },
        });
      });

      it('does not modify state', () => {
        const stateBefore = currentState;
        controller.searchQueryChanged(mockApi, 'query');

        expect(currentState).toBe(stateBefore);
      });
    });

    describe('when the debounce period elapses', () => {
      beforeEach(() => {
        jest.useFakeTimers();

        const searchResults = createFakePartial<SessionHistoryPage>({
          items: [{ id: 'r-1', title: 'Result', status: 'running', lastActivity: '2026-01-01' }],
          pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
        });
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValue(searchResults);

        currentState = createSessionsSearchState({ searchQuery: '' });
        controller.searchQueryChanged(mockApi, 'refactor');
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('calls getSessionHistory with the search query and a signal', () => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

        expect(mockSessionManager.getSessionHistory).toHaveBeenCalledWith({
          search: 'refactor',
          signal: expect.any(AbortSignal),
        });
      });

      it('does not call getSessionHistory before the debounce period', () => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);

        expect(mockSessionManager.getSessionHistory).not.toHaveBeenCalled();
      });

      it('populates state with search results', async () => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
        await jest.runAllTimersAsync();

        const input = currentState.input as SessionsSearchInputState;
        expect(input.sessions).toEqual([expect.objectContaining({ id: 'r-1', title: 'Result' })]);
      });
    });

    describe('when a second search triggers before the first completes', () => {
      let firstCallSignal: AbortSignal | undefined;

      beforeEach(() => {
        jest.useFakeTimers();

        jest
          .mocked(mockSessionManager.getSessionHistory)
          .mockImplementationOnce(
            (options) =>
              new Promise(() => {
                firstCallSignal = options?.signal;
              }),
          )
          .mockResolvedValueOnce(
            createFakePartial<SessionHistoryPage>({
              items: [],
              pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
            }),
          );

        currentState = createSessionsSearchState({ searchQuery: '' });

        controller.searchQueryChanged(mockApi, 'first');
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

        controller.searchQueryChanged(mockApi, 'second');
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('aborts the first request signal', () => {
        expect(firstCallSignal?.aborted).toBe(true);
      });

      it('calls getSessionHistory twice', () => {
        expect(mockSessionManager.getSessionHistory).toHaveBeenCalledTimes(2);
      });
    });

    describe('when the debounced search is aborted mid-flight', () => {
      beforeEach(async () => {
        jest.useFakeTimers();

        jest.mocked(mockSessionManager.getSessionHistory).mockImplementation(async () => {
          controller.cancelSearch(mockApi);
          throw new Error('network error');
        });

        currentState = createSessionsSearchState({ searchQuery: '' });
        controller.searchQueryChanged(mockApi, 'query');
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
        await jest.runAllTimersAsync();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('silently ignores the error', () => {
        expect(mockApi.showError).not.toHaveBeenCalled();
      });
    });
  });

  describe('selectSession', () => {
    describe('when switchToSession succeeds', () => {
      beforeEach(async () => {
        jest
          .mocked(mockSessionManager.switchToSession)
          .mockResolvedValue(createFakePartial<Session>({ sessionId: 'session-42' }));

        await controller.selectSession(mockApi, 'session-42');
      });

      it('calls api.ensureInitialized', () => {
        expect(mockApi.ensureInitialized).toHaveBeenCalled();
      });

      it('sets input to defaultInputState with isLoading true', () => {
        const loadingMutation = jest.mocked(mockApi.mutateState).mock.calls[0][0];
        const result = loadingMutation(createFakePartial<AppState>({ isLoading: false }));

        expect(result.input).toEqual(defaultInputState);
        expect(result.isLoading).toBe(true);
      });

      it('calls sessionManager.switchToSession with the sessionId', () => {
        expect(mockSessionManager.switchToSession).toHaveBeenCalledWith('session-42');
      });
    });

    describe('when switchToSession throws an error', () => {
      beforeEach(async () => {
        jest
          .mocked(mockSessionManager.switchToSession)
          .mockRejectedValue(new Error('session not found'));

        await controller.selectSession(mockApi, 'bad-session');
      });

      it('calls api.ensureInitialized', () => {
        expect(mockApi.ensureInitialized).toHaveBeenCalled();
      });

      it('calls errorHandler.handleError', () => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'Failed to switch session',
          expect.any(Error),
        );
      });

      it('calls api.showError with the error message', () => {
        expect(mockApi.showError).toHaveBeenCalledWith('session not found');
      });

      it('resets isLoading to false', () => {
        expect(currentState.isLoading).toBe(false);
      });
    });

    describe('when switchToSession throws a non-Error', () => {
      beforeEach(async () => {
        jest.mocked(mockSessionManager.switchToSession).mockRejectedValue('string error');

        await controller.selectSession(mockApi, 'bad-session');
      });

      it('calls api.showError with fallback message', () => {
        expect(mockApi.showError).toHaveBeenCalledWith('Failed to load session');
      });
    });
  });

  describe('loadMore', () => {
    describe('when input type is not SESSIONS_SEARCH', () => {
      beforeEach(async () => {
        currentState = createFakePartial<AppState>({
          input: { inputType: CLI_INPUT_TYPES.TEXT, lines: [], cursorLine: 0, cursorColumn: 0 },
        });

        await controller.loadMore(mockApi);
      });

      it('does not call getSessionHistory', () => {
        expect(mockSessionManager.getSessionHistory).not.toHaveBeenCalled();
      });
    });

    describe('when hasNextPage is false', () => {
      beforeEach(async () => {
        currentState = createSessionsSearchState({ hasNextPage: false });

        await controller.loadMore(mockApi);
      });

      it('does not call getSessionHistory', () => {
        expect(mockSessionManager.getSessionHistory).not.toHaveBeenCalled();
      });
    });

    describe('when already loading', () => {
      beforeEach(async () => {
        currentState = createSessionsSearchState({ hasNextPage: true, isLoading: true });

        await controller.loadMore(mockApi);
      });

      it('does not call getSessionHistory', () => {
        expect(mockSessionManager.getSessionHistory).not.toHaveBeenCalled();
      });
    });

    describe('when there are more pages to load', () => {
      const existingSessions: SessionListItem[] = [
        { id: 'session-1', title: 'First', status: 'RUNNING', lastActivity: '2026-01-01' },
      ];
      const newSessions: SessionListItem[] = [
        { id: 'session-2', title: 'Second', status: 'RUNNING', lastActivity: '2026-01-02' },
      ];

      beforeEach(async () => {
        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValueOnce(
          createFakePartial<SessionHistoryPage>({
            items: existingSessions,
            pageInfo: createFakePartial<SessionHistoryPageInfo>({
              hasNextPage: true,
              endCursor: 'cursor-1',
            }),
          }),
        );

        await controller.openSearch(mockApi);

        currentState = createSessionsSearchState({
          hasNextPage: true,
          isLoading: false,
          sessions: existingSessions,
          searchQuery: 'test',
        });

        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValueOnce(
          createFakePartial<SessionHistoryPage>({
            items: newSessions,
            pageInfo: createFakePartial<SessionHistoryPageInfo>({
              hasNextPage: false,
              endCursor: 'cursor-2',
            }),
          }),
        );

        await controller.loadMore(mockApi);
      });

      it('calls getSessionHistory with afterCursor, search, and signal', () => {
        expect(mockSessionManager.getSessionHistory).toHaveBeenLastCalledWith({
          afterCursor: 'cursor-1',
          search: 'test',
          signal: expect.any(AbortSignal),
        });
      });

      it('appends new items to existing sessions', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.sessions).toEqual([...existingSessions, ...newSessions]);
      });

      it('updates hasNextPage from new pageInfo', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.hasNextPage).toBe(false);
      });

      it('sets isLoading to false', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.isLoading).toBe(false);
      });
    });

    describe('when getSessionHistory throws an error', () => {
      beforeEach(async () => {
        currentState = createSessionsSearchState({
          hasNextPage: true,
          isLoading: false,
          sessions: [
            { id: 'session-1', title: 'Keep me', status: 'RUNNING', lastActivity: '2026-01-01' },
          ],
        });

        jest
          .mocked(mockSessionManager.getSessionHistory)
          .mockRejectedValue(new Error('load more failed'));

        await controller.loadMore(mockApi);
      });

      it('sets isLoading to false', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.isLoading).toBe(false);
      });

      it('preserves existing sessions', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.sessions).toEqual([
          { id: 'session-1', title: 'Keep me', status: 'RUNNING', lastActivity: '2026-01-01' },
        ]);
      });
    });

    describe('when the request is aborted mid-flight', () => {
      beforeEach(async () => {
        currentState = createSessionsSearchState({
          hasNextPage: true,
          isLoading: false,
        });

        jest.mocked(mockSessionManager.getSessionHistory).mockImplementation(async () => {
          controller.cancelSearch(mockApi);
          throw new Error('network error');
        });

        await controller.loadMore(mockApi);
      });

      it('silently ignores the error', () => {
        expect(mockApi.showError).not.toHaveBeenCalled();
      });
    });

    describe('when a search aborts an in-flight loadMore', () => {
      let loadMoreSignal: AbortSignal | undefined;

      beforeEach(async () => {
        jest.useFakeTimers();

        jest.mocked(mockSessionManager.getSessionHistory).mockResolvedValueOnce(
          createFakePartial<SessionHistoryPage>({
            items: [],
            pageInfo: createFakePartial<SessionHistoryPageInfo>({
              hasNextPage: true,
              endCursor: 'cursor-1',
            }),
          }),
        );

        await controller.openSearch(mockApi);

        currentState = createSessionsSearchState({
          hasNextPage: true,
          isLoading: false,
          searchQuery: 'query',
        });

        jest
          .mocked(mockSessionManager.getSessionHistory)
          .mockImplementationOnce(
            (options) =>
              new Promise((resolve) => {
                loadMoreSignal = options?.signal;
                options?.signal?.addEventListener('abort', () => {
                  resolve(
                    createFakePartial<SessionHistoryPage>({
                      items: [],
                      pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
                    }),
                  );
                });
              }),
          )
          .mockResolvedValueOnce(
            createFakePartial<SessionHistoryPage>({
              items: [],
              pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
            }),
          );

        const loadMorePromise = controller.loadMore(mockApi);

        controller.searchQueryChanged(mockApi, 'new query');
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

        await loadMorePromise;
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('aborts the loadMore signal', () => {
        expect(loadMoreSignal?.aborted).toBe(true);
      });
    });

    describe('when input type changes during fetch', () => {
      beforeEach(async () => {
        currentState = createSessionsSearchState({
          hasNextPage: true,
          isLoading: false,
        });

        jest.mocked(mockSessionManager.getSessionHistory).mockImplementation(async () => {
          currentState = createFakePartial<AppState>({
            input: {
              inputType: CLI_INPUT_TYPES.TEXT,
              lines: [],
              cursorLine: 0,
              cursorColumn: 0,
            },
          });

          return createFakePartial<SessionHistoryPage>({
            items: [{ id: 'new-1', title: 'New', status: 'active', lastActivity: '2026-01-01' }],
            pageInfo: createFakePartial<SessionHistoryPageInfo>({ hasNextPage: false }),
          });
        });

        await controller.loadMore(mockApi);
      });

      it('returns state unchanged', () => {
        expect(currentState.input.inputType).toBe(CLI_INPUT_TYPES.TEXT);
      });
    });
  });

  describe('getCallbacks', () => {
    let callbacks: ReturnType<typeof controller.getCallbacks>;

    beforeEach(() => {
      callbacks = controller.getCallbacks(mockApi);
    });

    it('returns an object with all expected callback functions', () => {
      expect(typeof callbacks.onCancelSessionsSearch).toBe('function');
      expect(typeof callbacks.onSessionsSearchQueryChange).toBe('function');
      expect(typeof callbacks.onSelectSession).toBe('function');
      expect(typeof callbacks.onLoadMoreSessions).toBe('function');
    });

    describe('when onCancelSessionsSearch is called', () => {
      beforeEach(() => {
        callbacks.onCancelSessionsSearch();
      });

      it('resets input to defaultInputState', () => {
        expect(currentState.input).toEqual(defaultInputState);
      });
    });

    describe('when onSessionsSearchQueryChange is called', () => {
      beforeEach(() => {
        currentState = createSessionsSearchState({ selectedIndex: 3 });
        callbacks.onSessionsSearchQueryChange('test query');
      });

      it('updates searchQuery in state', () => {
        const input = currentState.input as SessionsSearchInputState;
        expect(input.searchQuery).toBe('test query');
      });
    });
  });
});
