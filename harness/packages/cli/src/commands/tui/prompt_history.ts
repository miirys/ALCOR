import {
  CLI_INPUT_TYPES,
  defaultInputState,
  type InputState,
  type TextInputState,
  type HistorySearchInputState,
} from '@gitlab-org/tui';
import type { PersistentStorage } from '@gitlab-org/persistent-storage';
import { Logger, withPrefix } from '@gitlab-org/logging';

export class PromptHistory {
  #logger: Logger;

  #history: string[] = [];

  #currentIndex: number = -1;

  #draft: string = '';

  #maxHistory = 100;

  #storage?: PersistentStorage;

  #storageKey?: string;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[PromptHistory]');
  }

  async load(storage: PersistentStorage, workspacePath: string): Promise<void> {
    this.#storage = storage;
    this.#storageKey = workspacePath;

    try {
      const historyData = await storage.get(workspacePath);
      if (Array.isArray(historyData)) {
        this.#history = historyData.slice(-this.#maxHistory);
      }
    } catch (error) {
      this.#logger.error('Failed to load prompt history ', error);
      // Silently fail, start with empty history
    }
  }

  async #save(): Promise<void> {
    if (!this.#storage || !this.#storageKey) return;
    try {
      await this.#storage.set(this.#storageKey, this.#history);
    } catch (error) {
      this.#logger.error('Failed to save prompt history ', error);
      // Persistence failure shouldn't break UX
    }
  }

  async add(prompt: string): Promise<void> {
    if (!prompt.trim()) return;

    if (this.#history[this.#history.length - 1] === prompt) {
      return;
    }

    this.#history.push(prompt);

    if (this.#history.length > this.#maxHistory) {
      this.#history.shift();
    }

    this.reset();
    await this.#save();
  }

  reset(): void {
    this.#currentIndex = -1;
    this.#draft = '';
  }

  handlePrevious(currentInput: InputState, currentText?: string): TextInputState | undefined {
    if (currentInput.inputType !== CLI_INPUT_TYPES.TEXT) {
      return undefined;
    }

    if (this.#currentIndex === -1) {
      this.#draft = currentText ?? currentInput.lines.join('\n');
    }

    const previous = this.#getPrevious();
    if (previous === undefined) {
      return undefined;
    }
    return {
      ...currentInput,
      lines: previous.split('\n'),
      cursorLine: 0,
      cursorColumn: 0,
    };
  }

  handleNext(currentInput: InputState): TextInputState | undefined {
    const next = this.#getNext();
    if (next === undefined || currentInput.inputType !== CLI_INPUT_TYPES.TEXT) {
      return undefined;
    }
    return {
      ...currentInput,
      lines: next.split('\n'),
      cursorLine: 0,
      cursorColumn: 0,
    };
  }

  #getPrevious(): string | undefined {
    if (this.#history.length === 0) return undefined;

    if (this.#currentIndex === -1) {
      this.#currentIndex = this.#history.length;
    }

    if (this.#currentIndex > 0) {
      this.#currentIndex--;
    }

    return this.#history[this.#currentIndex];
  }

  #getNext(): string | undefined {
    if (this.#currentIndex === -1) return undefined;

    if (this.#currentIndex < this.#history.length - 1) {
      this.#currentIndex++;
      return this.#history[this.#currentIndex];
    }

    this.#currentIndex = -1;
    return this.#draft;
  }

  async remove(prompt: string): Promise<number> {
    const index = this.#history.indexOf(prompt);
    if (index === -1) {
      return -1;
    }

    this.#history.splice(index, 1);
    this.reset();
    await this.#save();
    return index;
  }

  search(
    query: string,
    maxResults: number = 10,
  ): {
    item: string;
    matches: number[];
  }[] {
    if (!query.trim()) {
      const results = this.#history
        .slice(-maxResults)
        .reverse()
        .map((item) => ({ item, matches: [] }));
      return results;
    }

    const lowerQuery = query.toLowerCase();
    const filtered: { item: string; matchIndex: number }[] = [];

    for (const item of this.#history) {
      const matchIndex = item.toLowerCase().indexOf(lowerQuery);
      if (matchIndex !== -1) {
        filtered.push({ item, matchIndex });
      }
    }

    return filtered
      .slice(-maxResults)
      .reverse()
      .map(({ item, matchIndex }) => ({
        item,
        matches: [matchIndex],
      }));
  }

  handleOpenSearch(): HistorySearchInputState {
    const searchResults = this.search('', 10);
    return {
      inputType: CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH,
      searchQuery: '',
      filteredHistory: searchResults,
      selectedIndex: 0,
    };
  }

  handleCancelSearch(): TextInputState {
    return defaultInputState;
  }

  handleSelectItem(item: string): TextInputState {
    return {
      inputType: CLI_INPUT_TYPES.TEXT,
      lines: item.split('\n'),
      cursorLine: 0,
      cursorColumn: 0,
    };
  }
}
