import { join } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DefaultPersistentStorage } from '@gitlab-org/persistent-storage';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import { CLI_INPUT_TYPES } from '@gitlab-org/tui';
import type { ControllerApi } from './controller_api';
import { PromptHistory } from './prompt_history';

export interface PromptHistoryCallbacks {
  onHistoryPrevious: (currentText: string) => void;
  onHistoryNext: (currentText: string) => void;
  onOpenHistorySearch: () => void;
  onCancelHistorySearch: () => void;
  onHistorySearchQueryChange: (query: string) => void;
  onSelectHistoryItem: (item: string) => void;
  onDeleteHistoryItem: (item: string) => Promise<void>;
}

export interface PromptHistoryController {
  load(cwd: string): Promise<void>;
  addToHistory(prompt: string): Promise<void>;
  getCallbacks(api: ControllerApi): PromptHistoryCallbacks;
}

export const PromptHistoryController =
  createInterfaceId<PromptHistoryController>('PromptHistoryController');

const HISTORY_SEARCH_LIMIT = 10;

@Implements(PromptHistoryController)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPromptHistoryController implements PromptHistoryController {
  #logger: Logger;

  #promptHistory?: PromptHistory;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[PromptHistoryController]');
  }

  async load(cwd: string): Promise<void> {
    const baseDir = process.env.GLAB_CONFIG_DIR || getDuoConfigDir();
    if (!baseDir) {
      this.#logger.warn(
        'Unable to determine baseDir for prompt history storage, this will be skipped!',
      );
      return;
    }

    const storagePath = join(baseDir, 'duo-cli-prompt-history.json');
    const storage = new DefaultPersistentStorage(this.#logger, storagePath);

    try {
      const history = new PromptHistory(this.#logger);
      await history.load(storage, cwd);
      this.#promptHistory = history;
      this.#logger.debug(`Loaded prompt history`);
    } catch (error) {
      this.#logger.error('Failed to load prompt history', error);
    }
  }

  async addToHistory(prompt: string): Promise<void> {
    try {
      await this.#promptHistory?.add(prompt);
    } catch (error) {
      this.#logger.error('Failed to add prompt to history', error);
    }
  }

  getCallbacks(api: ControllerApi): PromptHistoryCallbacks {
    return {
      onHistoryPrevious: (currentText: string) => this.#handleHistoryPrevious(api, currentText),
      onHistoryNext: () => this.#handleHistoryNext(api),
      onOpenHistorySearch: () => this.#handleOpenHistorySearch(api),
      onCancelHistorySearch: () => this.#handleCancelHistorySearch(api),
      onHistorySearchQueryChange: (query: string) =>
        this.#handleHistorySearchQueryChange(api, query),
      onSelectHistoryItem: (item: string) => this.#handleSelectHistoryItem(api, item),
      onDeleteHistoryItem: (item: string) => this.#handleDeleteHistoryItem(api, item),
    };
  }

  #handleHistoryPrevious(api: ControllerApi, currentText: string): void {
    api.mutateState((state) => {
      if (!this.#promptHistory) return state;
      const newInput = this.#promptHistory.handlePrevious(state.input, currentText);
      return newInput ? { ...state, input: newInput } : state;
    });
  }

  #handleHistoryNext(api: ControllerApi): void {
    api.mutateState((state) => {
      if (!this.#promptHistory) return state;
      const newInput = this.#promptHistory.handleNext(state.input);
      return newInput ? { ...state, input: newInput } : state;
    });
  }

  #handleOpenHistorySearch(api: ControllerApi): void {
    if (!this.#promptHistory) return;
    const newInput = this.#promptHistory.handleOpenSearch();
    api.mutateState((state) => ({ ...state, input: newInput }));
  }

  #handleCancelHistorySearch(api: ControllerApi): void {
    if (!this.#promptHistory) return;
    const newInput = this.#promptHistory.handleCancelSearch();
    api.mutateState((state) => ({ ...state, input: newInput }));
  }

  #handleHistorySearchQueryChange(api: ControllerApi, query: string): void {
    const history = this.#promptHistory;
    if (!history) return;

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH) return state;
      const searchResults = history.search(query, HISTORY_SEARCH_LIMIT);
      return {
        ...state,
        input: {
          ...state.input,
          searchQuery: query,
          filteredHistory: searchResults,
          selectedIndex: 0,
        },
      };
    });
  }

  #handleSelectHistoryItem(api: ControllerApi, item: string): void {
    if (!this.#promptHistory) return;
    const newInput = this.#promptHistory.handleSelectItem(item);
    api.mutateState((state) => ({ ...state, input: newInput }));
  }

  async #handleDeleteHistoryItem(api: ControllerApi, item: string): Promise<void> {
    const history = this.#promptHistory;
    if (!history) return;

    const index = await history.remove(item);
    if (index === -1) return;

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH) return state;

      const searchResults = history.search(state.input.searchQuery, HISTORY_SEARCH_LIMIT);
      const newSelectedIndex = Math.min(
        state.input.selectedIndex,
        Math.max(0, searchResults.length - 1),
      );

      return {
        ...state,
        input: {
          ...state.input,
          filteredHistory: searchResults,
          selectedIndex: newSelectedIndex,
        },
      };
    });
  }
}
