import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { CodeSuggestionContextManager } from '../../ai_context_management/code_suggestion_context_manager';
import { PipelineLogPrefix, PreProcessor, PreProcessorItems } from './pre_processor_pipeline';

export const contentFetchedLog = (id: string) => {
  return `Content fetched for ${id}`;
};

@Injectable(PreProcessor, [Logger, CodeSuggestionContextManager])
export class ContextItemContentFetcher implements PreProcessor {
  name = 'context_item_content_fetcher' as const;

  readonly #logger: Logger;

  readonly #aiContextManager: CodeSuggestionContextManager;

  constructor(logger: Logger, aiContextManager: CodeSuggestionContextManager) {
    this.#logger = withPrefix(logger, `${PipelineLogPrefix}-[ContextItemContentFetcher]`);
    this.#aiContextManager = aiContextManager;
  }

  async process(items: PreProcessorItems) {
    const { aiContextItems } = items;
    const aiContextItemsWithContent =
      await this.#aiContextManager.addContentToItems(aiContextItems);
    const validatedItems = aiContextItemsWithContent
      .map((item) => {
        if (!item.content) {
          this.#logger.error(`Content is missing for ${item.id}`);
          return null;
        }
        this.#logger.info(contentFetchedLog(item.id));
        return item;
      })
      .filter((item) => item !== null);

    return {
      preProcessorItems: {
        ...items,
        aiContextItems: validatedItems,
      },
    };
  }
}
