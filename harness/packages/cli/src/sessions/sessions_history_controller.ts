import { debounce } from 'lodash-es';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import { CLI_INPUT_TYPES, defaultInputState, type SessionsCallbacks } from '@gitlab-org/tui';
import { ErrorHandler } from '@gitlab-org/errors';
import type { ControllerApi } from '../commands/tui/controller_api';
import { SessionManager } from './session_manager';

export const SEARCH_DEBOUNCE_MS = 300;

export interface SessionsHistoryController {
  openSearch(api: ControllerApi): Promise<void>;
  cancelSearch(api: ControllerApi): void;
  searchQueryChanged(api: ControllerApi, query: string): void;
  selectSession(api: ControllerApi, sessionId: string): Promise<void>;
  loadMore(api: ControllerApi): Promise<void>;
  getCallbacks(api: ControllerApi): SessionsCallbacks;
}

export const SessionsHistoryController = createInterfaceId<SessionsHistoryController>(
  'SessionsHistoryController',
);

@Implements(SessionsHistoryController)
@Service({
  dependencies: [Logger, SessionManager, ErrorHandler],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultSessionsHistoryController implements SessionsHistoryController {
  #logger: Logger;

  #sessionManager: SessionManager;

  #errorHandler: ErrorHandler;

  #endCursor?: string;

  #searchAbortController?: AbortController;

  constructor(logger: Logger, sessionManager: SessionManager, errorHandler: ErrorHandler) {
    this.#logger = withPrefix(logger, '[SessionsHistoryController]');
    this.#sessionManager = sessionManager;
    this.#errorHandler = errorHandler;
  }

  async openSearch(api: ControllerApi): Promise<void> {
    this.#logger.info('Opening session history search');

    this.#searchAbortController?.abort();
    this.#endCursor = undefined;

    const abortController = new AbortController();
    this.#searchAbortController = abortController;

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.SESSIONS_SEARCH,
        searchQuery: '',
        sessions: [],
        selectedIndex: 0,
        isLoading: true,
        hasNextPage: false,
      },
    }));

    try {
      const { items, pageInfo } = await this.#sessionManager.getSessionHistory({
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      this.#endCursor = pageInfo.endCursor;

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

        return {
          ...state,
          input: {
            ...state.input,
            sessions: items,
            isLoading: false,
            hasNextPage: pageInfo.hasNextPage,
          },
        };
      });
    } catch (error) {
      if (abortController.signal.aborted) return;

      this.#logger.error('Failed to fetch session history', error);

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

        return {
          ...state,
          input: {
            inputType: CLI_INPUT_TYPES.SESSIONS_SEARCH,
            searchQuery: '',
            sessions: [],
            selectedIndex: 0,
            isLoading: false,
            hasNextPage: false,
          },
        };
      });

      api.showError('Failed to load session history. Please try again.');
    }
  }

  cancelSearch(api: ControllerApi): void {
    this.#debouncedSearch.cancel();
    this.#searchAbortController?.abort();
    this.#endCursor = undefined;
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  searchQueryChanged(api: ControllerApi, query: string): void {
    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

      return {
        ...state,
        input: {
          ...state.input,
          searchQuery: query,
          selectedIndex: 0,
        },
      };
    });

    this.#debouncedSearch(api, query);
  }

  async selectSession(api: ControllerApi, sessionId: string): Promise<void> {
    this.#logger.info(`Switching to session: ${sessionId}`);
    await api.ensureInitialized();

    api.mutateState((state) => ({
      ...state,
      input: defaultInputState,
      isLoading: true,
    }));

    try {
      await this.#sessionManager.switchToSession(sessionId);
    } catch (error) {
      api.mutateState((state) => ({ ...state, isLoading: false }));
      this.#errorHandler.handleError('Failed to switch session', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load session';
      api.showError(errorMessage);
    }
  }

  async loadMore(api: ControllerApi): Promise<void> {
    let searchQuery: string | undefined;

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

      if (!state.input.hasNextPage || state.input.isLoading) return state;

      searchQuery = state.input.searchQuery;
      return {
        ...state,
        input: { ...state.input, isLoading: true },
      };
    });

    if (searchQuery === undefined) return;

    this.#searchAbortController?.abort();
    const abortController = new AbortController();
    this.#searchAbortController = abortController;

    try {
      const { items, pageInfo } = await this.#sessionManager.getSessionHistory({
        afterCursor: this.#endCursor,
        search: searchQuery,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      this.#endCursor = pageInfo.endCursor;

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

        return {
          ...state,
          input: {
            ...state.input,
            sessions: [...state.input.sessions, ...items],
            hasNextPage: pageInfo.hasNextPage,
            isLoading: false,
          },
        };
      });
    } catch (error) {
      if (abortController.signal.aborted) return;

      this.#logger.error('Failed to load more sessions', error);

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

        return {
          ...state,
          input: {
            ...state.input,
            isLoading: false,
          },
        };
      });
    }
  }

  getCallbacks(api: ControllerApi): SessionsCallbacks {
    return {
      onCancelSessionsSearch: () => this.cancelSearch(api),
      onSessionsSearchQueryChange: (query: string) => this.searchQueryChanged(api, query),
      onSelectSession: (sessionId: string) => {
        doNotAwait(this.selectSession(api, sessionId));
      },
      onLoadMoreSessions: () => {
        doNotAwait(this.loadMore(api));
      },
    };
  }

  #debouncedSearch = debounce((api: ControllerApi, query: string) => {
    doNotAwait(this.#executeSearch(api, query));
  }, SEARCH_DEBOUNCE_MS);

  async #executeSearch(api: ControllerApi, query: string): Promise<void> {
    this.#searchAbortController?.abort();
    const abortController = new AbortController();
    this.#searchAbortController = abortController;
    this.#endCursor = undefined;

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

      return {
        ...state,
        input: { ...state.input, isLoading: true },
      };
    });

    try {
      const { items, pageInfo } = await this.#sessionManager.getSessionHistory({
        search: query,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      this.#endCursor = pageInfo.endCursor;

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;
        if (state.input.searchQuery !== query) return state;

        return {
          ...state,
          input: {
            ...state.input,
            sessions: items,
            hasNextPage: pageInfo.hasNextPage,
            isLoading: false,
            selectedIndex: 0,
          },
        };
      });
    } catch (error) {
      if (abortController.signal.aborted) return;

      this.#logger.error('Failed to search sessions', error);

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.SESSIONS_SEARCH) return state;

        return {
          ...state,
          input: {
            ...state.input,
            isLoading: false,
          },
        };
      });
    }
  }
}
