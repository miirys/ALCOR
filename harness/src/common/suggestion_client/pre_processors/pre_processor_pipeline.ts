import { createCollectionId, createInterfaceId, Injectable } from '@gitlab/needle';
import { AIContextItem, AIContextProviderType } from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { IDocContext } from '../../document_transformer_service';

export type CodeSuggestionsAIContextItem = AIContextItem & {
  metadata: {
    allSources?: AIContextProviderType[];
  };
};

export type PreProcessorItems = {
  documentContext: IDocContext;
  aiContextItems: CodeSuggestionsAIContextItem[];
};

/**
 * PreProcessor is an interface for classes that can be used to preprocess both
 * the main document (`IDocContext`) and the AI context items (`AIContextItem[]`)
 * before they are used for generating suggestions.
 * They are run in order according to the order they are added to the PreProcessorPipeline.
 */
export interface PreProcessor {
  name:
    | 'empty_content'
    | 'disabled_item'
    | 'byte_size_limit'
    | 'context_ranker'
    | 'supported_language'
    | 'context_item_content_fetcher';

  process(items: PreProcessorItems): Promise<{
    preProcessorItems: PreProcessorItems;
    error?: {
      type: 'fatal' | 'continue';
      error: Error;
    };
  }>;
}

export interface PreProcessorPipeline extends DefaultPreProcessorPipeline {}

// Generic PreProcessor interface ID cannot handle contravariant parameters and covariant returns properly in DI registration

export const PreProcessor = createInterfaceId<PreProcessor>('PreProcessor');
const PreProcessorCollection = createCollectionId(PreProcessor);
export const PreProcessorPipeline = createInterfaceId<PreProcessorPipeline>('PreProcessorPipeline');
export const PipelineLogPrefix = '[PreProcessorPipeline]';

/**
 * This pipeline map is used to order the pre-processors according to business logic.
 * The pipeline should be designed to "fail fast" by filtering out irrelevant items as early as possible.
 */
const pipelineOrder = {
  /**
   * This processor is used to filter out items that are disabled.
   * Eg. an item that is a part of a project with Duo disabled will be filtered out.
   */
  disabled_item: 1,
  /**
   * This processor is used to filter out items that are not supported by the current language.
   */
  supported_language: 2,
  /**
   * This processor is used to rank the context items based on their relevance to the current document.
   * Eg. this ranks open tabs and import ai context items, with items that are both an open tab and import
   * taking priority.
   */
  context_ranker: 3,
  /**
   * This processor is used to fetch the content of the context items.
   */
  context_item_content_fetcher: 4,
  /**
   * We then filter out items that have no content.
   */
  empty_content: 5,
  /**
   * This processor is used to filter out items that are too large and do not fit the 500KB limit.
   */
  byte_size_limit: 6,
} as const satisfies Record<PreProcessor['name'], number>;

/**
 * Pipeline for running pre-processors on AI context items.
 * Pre-processors are used to modify context items before they are used for generating suggestions.
 * They can be used to filter, sort, or modify context items.
 */
@Injectable(PreProcessorPipeline, [Logger, PreProcessorCollection])
export class DefaultPreProcessorPipeline implements PreProcessorPipeline {
  readonly #logger: Logger;

  readonly #orderedProcessors: PreProcessor[];

  constructor(logger: Logger, rawProcessors: PreProcessor[]) {
    this.#logger = withPrefix(logger, PipelineLogPrefix);

    rawProcessors.forEach((processor) => {
      if (!(processor.name in pipelineOrder)) {
        throw new Error(`Invalid pre-processor name: ${processor.name}`);
      }
    });

    this.#orderedProcessors = rawProcessors.sort(
      (a, b) => pipelineOrder[a.name] - pipelineOrder[b.name],
    );
  }

  async run(items: PreProcessorItems): Promise<PreProcessorItems> {
    if (!this.#orderedProcessors.length) return items;

    return this.#orderedProcessors.reduce<Promise<PreProcessorItems>>(
      async (prevPromise, processor) => {
        const result = await prevPromise;
        const { preProcessorItems, error } = await processor.process(result);
        if (error?.type === 'fatal') {
          throw error.error;
        }
        if (error?.type === 'continue') {
          this.#logger.warn('pre-processor encountered an error but chose to continue', {
            processorName: processor.constructor.name,
            error: error.error,
          });
        }
        return preProcessorItems;
      },
      Promise.resolve(items),
    );
  }
}
