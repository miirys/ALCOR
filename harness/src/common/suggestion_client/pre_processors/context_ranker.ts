import { Injectable } from '@gitlab/needle';
import type {
  AIContextProviderType,
  OpenTabAIContextItem,
  ImportAIContextItem,
} from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  PreProcessor,
  PreProcessorItems,
  CodeSuggestionsAIContextItem,
  PipelineLogPrefix,
} from './pre_processor_pipeline';

type DeduplicatedContextProviderType = 'open_tab' | 'import' | 'multi_sourced';

type DeduplicatedContextItems = {
  id: string;
  type: DeduplicatedContextProviderType;
  allSources: AIContextProviderType[];
  contextItems: Record<AIContextProviderType, CodeSuggestionsAIContextItem>;
};

const ProviderTypePriority = {
  multi_sourced: 1,
  import: 2,
  open_tab: 3,
};

export const contextRankerLog = (numItems: number) => {
  return `Ranked ${numItems} context items`;
};

@Injectable(PreProcessor, [Logger])
export class ContextRanker implements PreProcessor {
  name = 'context_ranker' as const;

  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, `${PipelineLogPrefix}[ContextRanker]`);
  }

  async process(items: PreProcessorItems) {
    const deduplicatedContextItems = this.#deduplicate(items.aiContextItems);
    const sortedDeduplicatedContextItems = this.#rank(deduplicatedContextItems);
    const sortedContextItems = this.#extractContextItems(sortedDeduplicatedContextItems);

    const rankedPreprocessorItems = {
      preProcessorItems: {
        documentContext: items.documentContext,
        aiContextItems: sortedContextItems,
      },
    };
    this.#logger.debug(contextRankerLog(sortedContextItems.length));

    return rankedPreprocessorItems;
  }

  #deduplicate(aiContextItems: CodeSuggestionsAIContextItem[]): DeduplicatedContextItems[] {
    const deduplicatedContextItems = new Map<string, DeduplicatedContextItems>();

    aiContextItems.forEach((item) => {
      const { id } = item;

      let deduplicatedItem = deduplicatedContextItems.get(id);

      if (deduplicatedItem) {
        deduplicatedItem.type = 'multi_sourced';
        deduplicatedItem.allSources.push(item.metadata.subType);
        deduplicatedItem.contextItems[item.metadata.subType] = item;
        return;
      }

      deduplicatedItem = {
        id,
        type: item.metadata.subType as DeduplicatedContextProviderType,
        allSources: [item.metadata.subType],
        contextItems: {
          [item.metadata.subType]: item,
        } as Record<AIContextProviderType, CodeSuggestionsAIContextItem>,
      };

      deduplicatedContextItems.set(id, deduplicatedItem);
    });

    return Array.from(deduplicatedContextItems.values());
  }

  #rank(items: DeduplicatedContextItems[]): DeduplicatedContextItems[] {
    return items.sort((a, b) => {
      if (a.type === b.type) {
        return this.#compareSameTypeItems(a, b);
      }

      return this.#compareDifferentTypes(a.type, b.type);
    });
  }

  #extractContextItems(items: DeduplicatedContextItems[]): CodeSuggestionsAIContextItem[] {
    return items.map((item) => {
      // for multi_sourced context items, return the open_tab item
      const contextItem = item.contextItems.open_tab || item.contextItems.import;
      contextItem.metadata.allSources = item.allSources;
      return contextItem;
    });
  }

  #compareDifferentTypes(
    aType: DeduplicatedContextProviderType,
    bType: DeduplicatedContextProviderType,
  ): number {
    // compare the items by the priority/rank of their types
    // if there is an unexpected type, assign it a high number which means lowest priority
    const aPriority = ProviderTypePriority[aType] || 9999;
    const bPriority = ProviderTypePriority[bType] || 9999;
    return aPriority - bPriority;
  }

  #compareSameTypeItems(a: DeduplicatedContextItems, b: DeduplicatedContextItems): number {
    if (a.type === 'multi_sourced') {
      return this.#compareDeduplicatedItems(a, b);
    }

    if (a.type === 'open_tab') {
      return this.#compareOpenTabItems(
        a.contextItems.open_tab as OpenTabAIContextItem,
        b.contextItems.open_tab as OpenTabAIContextItem,
      );
    }

    if (a.type === 'import') {
      return this.#compareImportItems(
        a.contextItems.import as ImportAIContextItem,
        b.contextItems.import as ImportAIContextItem,
      );
    }

    // we are only anticipating the types checked above but if we do encounter another type
    // we consider them a similar priority
    return 0;
  }

  #compareDeduplicatedItems(a: DeduplicatedContextItems, b: DeduplicatedContextItems) {
    // for multi_sourced context items, we want to respect the open_tab lastAccessed comparison
    return this.#compareOpenTabItems(
      a.contextItems.open_tab as OpenTabAIContextItem,
      b.contextItems.open_tab as OpenTabAIContextItem,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  #compareImportItems(_a: ImportAIContextItem, _b: ImportAIContextItem) {
    // we compare by import depth, which is not yet provided by the ImportContextProvider
    // this is okay for now because we are only including first-level imports
    return 0;
  }

  #compareOpenTabItems(a: OpenTabAIContextItem, b: OpenTabAIContextItem) {
    // for open_tab comparison, we want to sort in reverse lastAccessed
    return b.metadata.lastAccessed - a.metadata.lastAccessed;
  }
}
