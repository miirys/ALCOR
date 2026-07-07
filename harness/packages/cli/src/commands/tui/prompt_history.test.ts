import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CLI_INPUT_TYPES, defaultInputState, type ChoiceInputState } from '@gitlab-org/tui';
import type { PersistentStorage } from '@gitlab-org/persistent-storage';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { PromptHistory } from './prompt_history';

describe('PromptHistory', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new TestLogger();
  });

  describe('load', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when storage has valid history data', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
      });

      it('should load history from storage', async () => {
        await history.load(mockStorage, '/workspace/path');

        expect(mockStorage.get).toHaveBeenCalledWith('/workspace/path');
        const result = history.handlePrevious(defaultInputState);
        expect(result?.lines).toEqual(['third']);
      });
    });

    describe('when storage has more than maxHistory items', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
        const items = Array.from({ length: 150 }, (_, i) => `item-${i}`);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(items),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
      });

      it('should truncate to the most recent 100 items', async () => {
        await history.load(mockStorage, '/workspace/path');

        const result = history.handlePrevious(defaultInputState);
        expect(result?.lines).toEqual(['item-149']);
      });
    });

    describe('when storage returns non-array data', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue('not an array'),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
      });

      it('should start with empty history', async () => {
        await history.load(mockStorage, '/workspace/path');

        const result = history.handlePrevious(defaultInputState);
        expect(result).toBeUndefined();
      });
    });

    describe('when storage throws an error', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockRejectedValue(new Error('Storage error')),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
      });

      it('should start with empty history', async () => {
        await history.load(mockStorage, '/workspace/path');

        const result = history.handlePrevious(defaultInputState);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('add', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when adding a valid prompt', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue([]),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should add the prompt to history and persist', async () => {
        await history.add('new prompt');

        expect(mockStorage.set).toHaveBeenCalledWith('/workspace/path', ['new prompt']);
      });

      it('should add multiple prompts in order', async () => {
        await history.add('first');
        await history.add('second');

        expect(mockStorage.set).toHaveBeenLastCalledWith('/workspace/path', ['first', 'second']);
      });
    });

    describe('when adding an empty prompt', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['existing']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should not add empty string', async () => {
        await history.add('');

        expect(mockStorage.set).not.toHaveBeenCalled();
      });

      it('should not add whitespace-only string', async () => {
        await history.add('   ');

        expect(mockStorage.set).not.toHaveBeenCalled();
      });

      it('should not add tab/newline whitespace', async () => {
        await history.add('\t\n  ');

        expect(mockStorage.set).not.toHaveBeenCalled();
      });
    });

    describe('when adding a duplicate of the last entry', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should not add consecutive duplicates', async () => {
        await history.add('second');

        expect(mockStorage.set).not.toHaveBeenCalled();
      });

      it('should allow non-consecutive duplicates', async () => {
        await history.add('first');

        expect(mockStorage.set).toHaveBeenCalledWith('/workspace/path', [
          'first',
          'second',
          'first',
        ]);
      });
    });

    describe('when exceeding maxHistory limit', () => {
      it('should remove the oldest entry', async () => {
        history = new PromptHistory(mockLogger);
        const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(items),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');

        await history.add('new-item');

        const setCall = (mockStorage.set as jest.Mock).mock.calls[0] as [string, string[]];
        const savedHistory = setCall[1];
        expect(savedHistory).toHaveLength(100);
        expect(savedHistory[0]).toBe('item-1');
        expect(savedHistory[99]).toBe('new-item');
      });
    });

    describe('when storage save fails', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue([]),
          set: jest.fn<PersistentStorage['set']>().mockRejectedValue(new Error('Save failed')),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should not throw and still update in-memory history', async () => {
        await expect(history.add('new prompt')).resolves.not.toThrow();

        const result = history.handlePrevious(defaultInputState);
        expect(result?.lines).toEqual(['new prompt']);
      });
    });
  });

  describe('handlePrevious', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when input type is TEXT', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return TextInputState with previous history item', () => {
        const result = history.handlePrevious(defaultInputState);

        expect(result).toEqual({
          ...defaultInputState,
          lines: ['second'],
          cursorLine: 0,
          cursorColumn: 0,
        });
      });

      it('should navigate backwards through history', () => {
        history.handlePrevious(defaultInputState);
        const result = history.handlePrevious(defaultInputState);

        expect(result?.lines).toEqual(['first']);
      });

      it('should stop at the oldest item', () => {
        history.handlePrevious(defaultInputState);
        history.handlePrevious(defaultInputState);
        const result = history.handlePrevious(defaultInputState);

        expect(result?.lines).toEqual(['first']);
      });

      it('should split multiline history items into lines', async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['line1\nline2\nline3']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');

        const result = history.handlePrevious(defaultInputState);

        expect(result?.lines).toEqual(['line1', 'line2', 'line3']);
      });
    });

    describe('when input type is not TEXT', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return undefined for CHOICE input', () => {
        const choiceInput: ChoiceInputState = {
          inputType: CLI_INPUT_TYPES.CHOICE,
          choiceOptions: [],
          selectedChoiceIndex: 0,
        };

        const result = history.handlePrevious(choiceInput);

        expect(result).toBeUndefined();
      });
    });

    describe('when history is empty', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue([]),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return undefined', () => {
        const result = history.handlePrevious(defaultInputState);

        expect(result).toBeUndefined();
      });
    });

    describe('when load has not been called', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
      });

      it('should return undefined', () => {
        const result = history.handlePrevious(defaultInputState);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('handleNext', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when input type is TEXT and navigation is active', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
        history.handlePrevious(defaultInputState);
        history.handlePrevious(defaultInputState);
      });

      it('should return TextInputState with next history item', () => {
        const result = history.handleNext(defaultInputState);

        expect(result).toEqual({
          ...defaultInputState,
          lines: ['third'],
          cursorLine: 0,
          cursorColumn: 0,
        });
      });
    });

    describe('when reaching the end of history', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
        history.handlePrevious(defaultInputState);
      });

      it('should return empty string', () => {
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['']);
      });

      it('should reset navigation state', () => {
        history.handleNext(defaultInputState);

        const result = history.handleNext(defaultInputState);
        expect(result).toBeUndefined();
      });
    });

    describe('when input type is not TEXT', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
        history.handlePrevious(defaultInputState);
      });

      it('should return undefined for CHOICE input', () => {
        const choiceInput: ChoiceInputState = {
          inputType: CLI_INPUT_TYPES.CHOICE,
          choiceOptions: [],
          selectedChoiceIndex: 0,
        };

        const result = history.handleNext(choiceInput);

        expect(result).toBeUndefined();
      });
    });

    describe('when navigation has not started', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return undefined', () => {
        const result = history.handleNext(defaultInputState);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('reset', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when navigation is in progress', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
        history.handlePrevious(defaultInputState);
        history.handlePrevious(defaultInputState);
      });

      it('should reset navigation index', () => {
        history.reset();

        const result = history.handleNext(defaultInputState);
        expect(result).toBeUndefined();
      });

      it('should allow fresh navigation from the end', () => {
        history.reset();

        const result = history.handlePrevious(defaultInputState);
        expect(result?.lines).toEqual(['third']);
      });
    });
  });

  describe('navigation flow', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    beforeEach(async () => {
      history = new PromptHistory(mockLogger);
      mockStorage = createFakePartial<PersistentStorage>({
        get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
        set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
      });
      await history.load(mockStorage, '/workspace/path');
    });

    it('should navigate back and forth through history', () => {
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['third']);
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['second']);
      expect(history.handleNext(defaultInputState)?.lines).toEqual(['third']);
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['second']);
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['first']);
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['first']);
    });

    it('should reset navigation when adding new prompt', async () => {
      history.handlePrevious(defaultInputState);
      history.handlePrevious(defaultInputState);

      await history.add('new prompt');

      expect(history.handleNext(defaultInputState)).toBeUndefined();
      expect(history.handlePrevious(defaultInputState)?.lines).toEqual(['new prompt']);
    });

    describe('when there is text in the input (draft)', () => {
      const inputWithText: typeof defaultInputState = {
        ...defaultInputState,
        lines: ['my unsent message'],
        cursorLine: 0,
        cursorColumn: 17,
      };

      it('should save the current text as draft and restore it when navigating forward past the end', () => {
        history.handlePrevious(inputWithText);
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['my unsent message']);
      });

      it('should preserve the draft through multiple back-and-forth navigations', () => {
        history.handlePrevious(inputWithText);
        history.handlePrevious(defaultInputState);
        history.handleNext(defaultInputState);
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['my unsent message']);
      });

      it('should clear the draft on reset', () => {
        history.handlePrevious(inputWithText);
        history.reset();

        // Navigate to the last history item and then forward
        history.handlePrevious(defaultInputState);
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['']);
      });

      it('should clear the draft when adding a new prompt', async () => {
        history.handlePrevious(inputWithText);
        await history.add('submitted');

        history.handlePrevious(defaultInputState);
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['']);
      });

      it('should handle multiline draft text', () => {
        const multilineInput: typeof defaultInputState = {
          ...defaultInputState,
          lines: ['line one', 'line two'],
          cursorLine: 1,
          cursorColumn: 8,
        };

        history.handlePrevious(multilineInput);
        const result = history.handleNext(defaultInputState);

        expect(result?.lines).toEqual(['line one', 'line two']);
      });
    });
  });

  describe('search', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when query is empty', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return all items in reverse order', () => {
        const results = history.search('');

        expect(results.map((r) => r.item)).toEqual(['third', 'second', 'first']);
      });

      it('should return items with empty matches array', () => {
        const results = history.search('');

        expect(results[0]).toEqual({ item: 'third', matches: [] });
      });

      it('should handle whitespace-only query as empty', () => {
        const results = history.search('   ');

        expect(results.map((r) => r.item)).toEqual(['third', 'second', 'first']);
      });
    });

    describe('when query matches items', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest
            .fn<PersistentStorage['get']>()
            .mockResolvedValue(['apple pie', 'banana', 'apple tart', 'cherry']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return matching items in reverse order', () => {
        const results = history.search('apple');

        expect(results.map((r) => r.item)).toEqual(['apple tart', 'apple pie']);
      });

      it('should be case-insensitive', () => {
        const results = history.search('APPLE');

        expect(results.map((r) => r.item)).toEqual(['apple tart', 'apple pie']);
      });
    });

    describe('when query matches no items', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['apple', 'banana']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return empty array', () => {
        const results = history.search('orange');

        expect(results).toEqual([]);
      });
    });

    describe('when maxResults is specified', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest
            .fn<PersistentStorage['get']>()
            .mockResolvedValue(['a1', 'a2', 'a3', 'a4', 'a5']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should limit results to maxResults', () => {
        const results = history.search('a', 3);

        expect(results).toHaveLength(3);
      });

      it('should return the most recent matches', () => {
        const results = history.search('a', 3);

        expect(results.map((r) => r.item)).toEqual(['a5', 'a4', 'a3']);
      });
    });

    describe('when maxResults is not specified', () => {
      beforeEach(async () => {
        const items = Array.from({ length: 15 }, (_, i) => `item-${i}`);
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(items),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should default to 10 results', () => {
        const results = history.search('item');

        expect(results).toHaveLength(10);
      });
    });
  });

  describe('handleOpenSearch', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when called', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return HistorySearchInputState', () => {
        const result = history.handleOpenSearch();

        expect(result.inputType).toBe(CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH);
      });

      it('should have empty search query', () => {
        const result = history.handleOpenSearch();

        expect(result.searchQuery).toBe('');
      });

      it('should include all history items in reverse order', () => {
        const result = history.handleOpenSearch();

        expect(result.filteredHistory.map((h) => h.item)).toEqual(['third', 'second', 'first']);
      });

      it('should start with selectedIndex at 0', () => {
        const result = history.handleOpenSearch();

        expect(result.selectedIndex).toBe(0);
      });
    });

    describe('when history is empty', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue([]),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return valid state with empty filteredHistory', () => {
        const result = history.handleOpenSearch();

        expect(result).toEqual({
          inputType: CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH,
          searchQuery: '',
          filteredHistory: [],
          selectedIndex: 0,
        });
      });
    });
  });

  describe('handleCancelSearch', () => {
    let history: PromptHistory;

    describe('when called', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
      });

      it('should return defaultInputState', () => {
        const result = history.handleCancelSearch();

        expect(result).toEqual(defaultInputState);
      });
    });
  });

  describe('handleSelectItem', () => {
    let history: PromptHistory;

    describe('when called with a single-line item', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
      });

      it('should return TextInputState with item as single line', () => {
        const result = history.handleSelectItem('selected item');

        expect(result).toEqual({
          inputType: CLI_INPUT_TYPES.TEXT,
          lines: ['selected item'],
          cursorLine: 0,
          cursorColumn: 0,
        });
      });
    });

    describe('when called with a multiline item', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
      });

      it('should split item into multiple lines', () => {
        const result = history.handleSelectItem('line1\nline2\nline3');

        expect(result.lines).toEqual(['line1', 'line2', 'line3']);
      });

      it('should set cursor to position 0,0', () => {
        const result = history.handleSelectItem('line1\nline2');

        expect(result.cursorLine).toBe(0);
        expect(result.cursorColumn).toBe(0);
      });
    });

    describe('when called with an empty string', () => {
      beforeEach(() => {
        history = new PromptHistory(mockLogger);
      });

      it('should return state with single empty line', () => {
        const result = history.handleSelectItem('');

        expect(result.lines).toEqual(['']);
      });
    });
  });

  describe('remove', () => {
    let history: PromptHistory;
    let mockStorage: PersistentStorage;

    describe('when item exists in history', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return the index of the removed item', async () => {
        const result = await history.remove('second');

        expect(result).toBe(1);
      });

      it('should return index 0 for first item', async () => {
        const result = await history.remove('first');

        expect(result).toBe(0);
      });

      it('should return index 2 for third item', async () => {
        const result = await history.remove('third');

        expect(result).toBe(2);
      });

      it('should remove the item from history', async () => {
        await history.remove('second');

        const searchResults = history.search('');
        expect(searchResults.map((r) => r.item)).toEqual(['third', 'first']);
      });

      it('should persist the updated history', async () => {
        await history.remove('second');

        expect(mockStorage.set).toHaveBeenCalledWith('/workspace/path', ['first', 'third']);
      });

      it('should call reset after removal', async () => {
        history.handlePrevious(defaultInputState);
        history.handlePrevious(defaultInputState);

        await history.remove('second');

        const nextResult = history.handleNext(defaultInputState);
        expect(nextResult).toBeUndefined();
      });
    });

    describe('when item does not exist in history', () => {
      beforeEach(async () => {
        history = new PromptHistory(mockLogger);
        mockStorage = createFakePartial<PersistentStorage>({
          get: jest.fn<PersistentStorage['get']>().mockResolvedValue(['first', 'second', 'third']),
          set: jest.fn<PersistentStorage['set']>().mockResolvedValue(),
        });
        await history.load(mockStorage, '/workspace/path');
      });

      it('should return -1', async () => {
        const result = await history.remove('nonexistent');

        expect(result).toBe(-1);
      });

      it('should not modify history', async () => {
        await history.remove('nonexistent');

        const searchResults = history.search('');
        expect(searchResults.map((r) => r.item)).toEqual(['third', 'second', 'first']);
      });

      it('should not persist when item not found', async () => {
        await history.remove('nonexistent');

        expect(mockStorage.set).not.toHaveBeenCalled();
      });
    });
  });
});
