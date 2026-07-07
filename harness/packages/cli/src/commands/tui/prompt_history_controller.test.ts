import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import {
  CLI_INPUT_TYPES,
  defaultAppState,
  defaultInputState,
  type AppState,
  type HistorySearchInputState,
  type TextInputState,
} from '@gitlab-org/tui';
import type { ControllerApi, StateMutation } from './controller_api';
import type { PromptHistory } from './prompt_history';

const MockPromptHistory = jest.fn();
const MockDefaultPersistentStorage = jest.fn();
const mockGetDuoConfigDir = jest.fn<() => string | undefined>();

jest.unstable_mockModule('./prompt_history', () => ({
  PromptHistory: MockPromptHistory,
}));

jest.unstable_mockModule('@gitlab-org/persistent-storage', () => ({
  DefaultPersistentStorage: MockDefaultPersistentStorage,
}));

jest.unstable_mockModule('@gitlab-org/ai-configuration', () => ({
  getDuoConfigDir: mockGetDuoConfigDir,
}));

// Dynamic imports AFTER mocks are set up
const { DefaultPromptHistoryController } = await import('./prompt_history_controller');

describe('DefaultPromptHistoryController', () => {
  let logger: Logger;
  let controller: InstanceType<typeof DefaultPromptHistoryController>;
  let mockHistory: PromptHistory;
  let currentState: AppState;
  let mockApi: ControllerApi;

  const historySearchState: HistorySearchInputState = {
    inputType: CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH,
    searchQuery: 'test',
    filteredHistory: [{ item: 'item1', matches: [] }],
    selectedIndex: 0,
  };

  beforeEach(() => {
    logger = new TestLogger();
    delete process.env.GLAB_CONFIG_DIR;
    mockGetDuoConfigDir.mockReturnValue(undefined);
    MockDefaultPersistentStorage.mockReset();

    mockHistory = createFakePartial<PromptHistory>({
      load: jest.fn<PromptHistory['load']>().mockResolvedValue(),
      add: jest.fn<PromptHistory['add']>().mockResolvedValue(),
      handlePrevious: jest.fn<PromptHistory['handlePrevious']>().mockReturnValue(undefined),
      handleNext: jest.fn<PromptHistory['handleNext']>().mockReturnValue(undefined),
      handleOpenSearch: jest.fn<PromptHistory['handleOpenSearch']>().mockReturnValue({
        inputType: CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH,
        searchQuery: '',
        filteredHistory: [],
        selectedIndex: 0,
      }),
      handleCancelSearch: jest
        .fn<PromptHistory['handleCancelSearch']>()
        .mockReturnValue(defaultInputState),
      handleSelectItem: jest
        .fn<PromptHistory['handleSelectItem']>()
        .mockReturnValue(defaultInputState),
      search: jest.fn<PromptHistory['search']>().mockReturnValue([]),
      remove: jest.fn<PromptHistory['remove']>().mockResolvedValue(-1),
    });
    MockPromptHistory.mockReturnValue(mockHistory);

    currentState = { ...defaultAppState };
    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest
        .fn<ControllerApi['mutateState']>()
        .mockImplementation((mutation: StateMutation) => {
          currentState = mutation(currentState);
          return currentState;
        }),
    });

    controller = new DefaultPromptHistoryController(logger);
  });

  describe('load', () => {
    describe('when GLAB_CONFIG_DIR is set', () => {
      beforeEach(() => {
        process.env.GLAB_CONFIG_DIR = '/custom/config/dir';
      });

      it('creates storage using GLAB_CONFIG_DIR as the base dir', async () => {
        await controller.load('/cwd');

        expect(MockDefaultPersistentStorage).toHaveBeenCalledWith(
          expect.anything(),
          '/custom/config/dir/duo-cli-prompt-history.json',
        );
      });

      it('loads prompt history with the provided cwd', async () => {
        await controller.load('/my/workspace');

        expect(mockHistory.load).toHaveBeenCalledWith(expect.anything(), '/my/workspace');
      });
    });

    describe('when GLAB_CONFIG_DIR is not set and getDuoConfigDir returns a path', () => {
      beforeEach(() => {
        mockGetDuoConfigDir.mockReturnValue('/duo/config/dir');
      });

      it('creates storage using getDuoConfigDir as the base dir', async () => {
        await controller.load('/cwd');

        expect(MockDefaultPersistentStorage).toHaveBeenCalledWith(
          expect.anything(),
          '/duo/config/dir/duo-cli-prompt-history.json',
        );
      });

      it('loads prompt history with the provided cwd', async () => {
        await controller.load('/workspace/path');

        expect(mockHistory.load).toHaveBeenCalledWith(expect.anything(), '/workspace/path');
      });
    });

    describe('when no base dir is available', () => {
      it('does not create storage', async () => {
        await controller.load('/cwd');

        expect(MockDefaultPersistentStorage).not.toHaveBeenCalled();
      });

      it('does not load prompt history', async () => {
        await controller.load('/cwd');

        expect(mockHistory.load).not.toHaveBeenCalled();
      });
    });

    describe('when PromptHistory.load throws an error', () => {
      beforeEach(() => {
        process.env.GLAB_CONFIG_DIR = '/config/dir';
        jest.mocked(mockHistory.load).mockRejectedValue(new Error('storage error'));
      });

      it('does not throw', async () => {
        await expect(controller.load('/cwd')).resolves.not.toThrow();
      });
    });
  });

  describe('when history is not loaded', () => {
    describe('addToHistory', () => {
      it('does not throw', async () => {
        await expect(controller.addToHistory('some prompt')).resolves.not.toThrow();
      });

      it('does not call add', async () => {
        await controller.addToHistory('some prompt');

        expect(mockHistory.add).not.toHaveBeenCalled();
      });
    });

    describe('getCallbacks', () => {
      it('callbacks leave state unchanged', async () => {
        const callbacks = controller.getCallbacks(mockApi);
        const stateBefore = { ...currentState };

        callbacks.onHistoryPrevious('');
        callbacks.onHistoryNext('');
        callbacks.onOpenHistorySearch();
        callbacks.onCancelHistorySearch();
        callbacks.onHistorySearchQueryChange('query');
        callbacks.onSelectHistoryItem('item');
        await callbacks.onDeleteHistoryItem('item');

        expect(currentState).toEqual(stateBefore);
      });
    });
  });

  describe('when history is loaded', () => {
    beforeEach(async () => {
      process.env.GLAB_CONFIG_DIR = '/config/dir';
      await controller.load('/cwd');
    });

    describe('addToHistory', () => {
      it('delegates to promptHistory.add', async () => {
        await controller.addToHistory('my prompt');

        expect(mockHistory.add).toHaveBeenCalledWith('my prompt');
      });
    });

    describe('getCallbacks', () => {
      describe('onHistoryPrevious', () => {
        describe('when handlePrevious returns a new input state', () => {
          const newInput: TextInputState = {
            inputType: CLI_INPUT_TYPES.TEXT,
            lines: ['previous command'],
            cursorLine: 0,
            cursorColumn: 0,
          };

          beforeEach(() => {
            jest.mocked(mockHistory.handlePrevious).mockReturnValue(newInput);
          });

          it('updates the state input to the new input', () => {
            controller.getCallbacks(mockApi).onHistoryPrevious('current text');

            expect(currentState.input).toEqual(newInput);
          });
        });

        describe('when handlePrevious returns undefined', () => {
          it('leaves state unchanged', () => {
            const stateBefore = { ...currentState };
            controller.getCallbacks(mockApi).onHistoryPrevious('current text');

            expect(currentState).toEqual(stateBefore);
          });
        });
      });

      describe('onHistoryNext', () => {
        describe('when handleNext returns a new input state', () => {
          const newInput: TextInputState = {
            inputType: CLI_INPUT_TYPES.TEXT,
            lines: ['next command'],
            cursorLine: 0,
            cursorColumn: 0,
          };

          beforeEach(() => {
            jest.mocked(mockHistory.handleNext).mockReturnValue(newInput);
          });

          it('updates the state input to the new input', () => {
            controller.getCallbacks(mockApi).onHistoryNext('current text');

            expect(currentState.input).toEqual(newInput);
          });
        });

        describe('when handleNext returns undefined', () => {
          it('leaves state unchanged', () => {
            const stateBefore = { ...currentState };
            controller.getCallbacks(mockApi).onHistoryNext('current text');

            expect(currentState).toEqual(stateBefore);
          });
        });
      });

      describe('onOpenHistorySearch', () => {
        const openSearchResult: HistorySearchInputState = {
          inputType: CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH,
          searchQuery: '',
          filteredHistory: [{ item: 'hello world', matches: [] }],
          selectedIndex: 0,
        };

        beforeEach(() => {
          jest.mocked(mockHistory.handleOpenSearch).mockReturnValue(openSearchResult);
        });

        it('updates state input to the result of handleOpenSearch', () => {
          controller.getCallbacks(mockApi).onOpenHistorySearch();

          expect(currentState.input).toEqual(openSearchResult);
        });
      });

      describe('onCancelHistorySearch', () => {
        const cancelSearchResult: TextInputState = {
          inputType: CLI_INPUT_TYPES.TEXT,
          lines: [''],
          cursorLine: 0,
          cursorColumn: 0,
        };

        beforeEach(() => {
          jest.mocked(mockHistory.handleCancelSearch).mockReturnValue(cancelSearchResult);
        });

        it('updates state input to the result of handleCancelSearch', () => {
          controller.getCallbacks(mockApi).onCancelHistorySearch();

          expect(currentState.input).toEqual(cancelSearchResult);
        });
      });

      describe('onHistorySearchQueryChange', () => {
        describe('when state input type is PROMPT_HISTORY_SEARCH', () => {
          const searchResults = [
            { item: 'matching item', matches: [0] },
            { item: 'another match', matches: [8] },
          ];

          beforeEach(() => {
            currentState = { ...defaultAppState, input: historySearchState };
            jest.mocked(mockHistory.search).mockReturnValue(searchResults);
          });

          it('updates searchQuery in state', () => {
            controller.getCallbacks(mockApi).onHistorySearchQueryChange('new query');

            expect((currentState.input as HistorySearchInputState).searchQuery).toBe('new query');
          });

          it('updates filteredHistory from search results', () => {
            controller.getCallbacks(mockApi).onHistorySearchQueryChange('new query');

            expect((currentState.input as HistorySearchInputState).filteredHistory).toEqual(
              searchResults,
            );
          });

          it('resets selectedIndex to 0', () => {
            currentState = {
              ...defaultAppState,
              input: { ...historySearchState, selectedIndex: 3 },
            };

            controller.getCallbacks(mockApi).onHistorySearchQueryChange('new query');

            expect((currentState.input as HistorySearchInputState).selectedIndex).toBe(0);
          });

          it('calls search with the query and limit of 10', () => {
            controller.getCallbacks(mockApi).onHistorySearchQueryChange('some query');

            expect(mockHistory.search).toHaveBeenCalledWith('some query', 10);
          });
        });

        describe('when state input type is NOT PROMPT_HISTORY_SEARCH', () => {
          beforeEach(() => {
            currentState = { ...defaultAppState, input: defaultInputState };
          });

          it('leaves state unchanged', () => {
            const stateBefore = { ...currentState };
            controller.getCallbacks(mockApi).onHistorySearchQueryChange('query');

            expect(currentState).toEqual(stateBefore);
          });

          it('does not call search', () => {
            controller.getCallbacks(mockApi).onHistorySearchQueryChange('query');

            expect(mockHistory.search).not.toHaveBeenCalled();
          });
        });
      });

      describe('onSelectHistoryItem', () => {
        const selectedInput: TextInputState = {
          inputType: CLI_INPUT_TYPES.TEXT,
          lines: ['selected item'],
          cursorLine: 0,
          cursorColumn: 0,
        };

        beforeEach(() => {
          jest.mocked(mockHistory.handleSelectItem).mockReturnValue(selectedInput);
        });

        it('updates state input to the result of handleSelectItem', () => {
          controller.getCallbacks(mockApi).onSelectHistoryItem('selected item');

          expect(currentState.input).toEqual(selectedInput);
        });

        it('passes the item to handleSelectItem', () => {
          controller.getCallbacks(mockApi).onSelectHistoryItem('my selected item');

          expect(mockHistory.handleSelectItem).toHaveBeenCalledWith('my selected item');
        });
      });

      describe('onDeleteHistoryItem', () => {
        describe('when remove returns -1 (item not found)', () => {
          it('does not call mutateState', async () => {
            await controller.getCallbacks(mockApi).onDeleteHistoryItem('missing item');

            expect(mockApi.mutateState).not.toHaveBeenCalled();
          });
        });

        describe('when remove succeeds and state is PROMPT_HISTORY_SEARCH', () => {
          const updatedSearchResults = [{ item: 'remaining item', matches: [] }];

          beforeEach(() => {
            jest.mocked(mockHistory.remove).mockResolvedValue(0);
            jest.mocked(mockHistory.search).mockReturnValue(updatedSearchResults);
            currentState = {
              ...defaultAppState,
              input: {
                ...historySearchState,
                filteredHistory: [
                  { item: 'deleted item', matches: [] },
                  { item: 'remaining item', matches: [] },
                ],
                selectedIndex: 1,
              },
            };
          });

          it('updates filteredHistory with new search results', async () => {
            await controller.getCallbacks(mockApi).onDeleteHistoryItem('deleted item');

            expect((currentState.input as HistorySearchInputState).filteredHistory).toEqual(
              updatedSearchResults,
            );
          });

          it('clamps selectedIndex to the new results length', async () => {
            // selectedIndex was 1, new results has length 1 (max index 0) → clamped to 0
            await controller.getCallbacks(mockApi).onDeleteHistoryItem('deleted item');

            expect((currentState.input as HistorySearchInputState).selectedIndex).toBe(0);
          });

          it('keeps selectedIndex if it is within bounds', async () => {
            currentState = {
              ...defaultAppState,
              input: {
                ...historySearchState,
                filteredHistory: [
                  { item: 'item1', matches: [] },
                  { item: 'item2', matches: [] },
                  { item: 'item3', matches: [] },
                ],
                selectedIndex: 0,
              },
            };
            jest.mocked(mockHistory.search).mockReturnValue([
              { item: 'item1', matches: [] },
              { item: 'item3', matches: [] },
            ]);

            await controller.getCallbacks(mockApi).onDeleteHistoryItem('item2');

            expect((currentState.input as HistorySearchInputState).selectedIndex).toBe(0);
          });

          it('uses the current searchQuery when calling search', async () => {
            await controller.getCallbacks(mockApi).onDeleteHistoryItem('deleted item');

            expect(mockHistory.search).toHaveBeenCalledWith(historySearchState.searchQuery, 10);
          });
        });

        describe('when remove succeeds and state is NOT PROMPT_HISTORY_SEARCH', () => {
          beforeEach(() => {
            jest.mocked(mockHistory.remove).mockResolvedValue(0);
            currentState = { ...defaultAppState, input: defaultInputState };
          });

          it('leaves state unchanged', async () => {
            const stateBefore = { ...currentState };
            await controller.getCallbacks(mockApi).onDeleteHistoryItem('item');

            expect(currentState).toEqual(stateBefore);
          });
        });
      });
    });
  });
});
