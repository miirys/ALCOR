/* eslint-disable max-classes-per-file */
import { createInterfaceId } from '@gitlab/needle';
import { IDocContext } from '../../document_transformer_service';
import { SuggestionOptionText } from '../../api_types';
import { StreamingCompletionResponse } from '../../notifications';
import { log } from '../../log';

/**
 * PostProcessor is an interface for classes that can be used to modify completion responses
 * before they are sent to the client.
 * They are run in order according to the order they are added to the PostProcessorPipeline.
 * Post-processors can be used to filter, sort, or modify completion and streaming suggestions.
 * Be sure to handle both streaming and completion responses in your implementation (if applicable).
 * */
export abstract class PostProcessor {
  processStream(
    _context: IDocContext,
    input: StreamingCompletionResponse,
  ): Promise<StreamingCompletionResponse> {
    return Promise.resolve(input);
  }

  processCompletion(
    _context: IDocContext,
    input: SuggestionOptionText[],
  ): Promise<SuggestionOptionText[]> {
    return Promise.resolve(input);
  }
}

export interface PostProcessorPipeline {
  addProcessor(processor: PostProcessor): void;

  run<T extends StreamingCompletionResponse | SuggestionOptionText[]>({
    documentContext,
    input,
  }: {
    documentContext: IDocContext;
    input: T;
  }): Promise<T>;
}

function isStream(input: unknown): input is StreamingCompletionResponse {
  return Boolean((input as StreamingCompletionResponse).id);
}

function isSuggestion(input: unknown): input is SuggestionOptionText[] {
  return input instanceof Array;
}

/**
 * Pipeline for running post-processors on completion and streaming (generation) responses.
 * Post-processors are used to modify completion responses before they are sent to the client.
 * They can be used to filter, sort, or modify completion suggestions.
 */
export abstract class AbstractPostProcessorPipeline implements PostProcessorPipeline {
  #processors: PostProcessor[] = [];

  addProcessor(processor: PostProcessor): void {
    this.#processors.push(processor);
  }

  async run<T extends StreamingCompletionResponse | SuggestionOptionText[]>({
    documentContext,
    input,
  }: {
    documentContext: IDocContext;
    input: T;
  }): Promise<T> {
    if (!this.#processors.length) return input;
    if (isStream(input)) {
      return this.#processors.reduce<Promise<StreamingCompletionResponse>>(
        async (prevPromise, processor) => {
          const result = await prevPromise;
          return processor.processStream(documentContext, result);
        },
        Promise.resolve(input),
      ) as Promise<T>;
    }
    if (isSuggestion(input)) {
      return this.#processors.reduce<Promise<SuggestionOptionText[]>>(
        async (prevPromise, processor) => {
          const result = await prevPromise;
          return processor.processCompletion(documentContext, result);
        },
        Promise.resolve(input),
      ) as Promise<T>;
    }
    log.warn(`Unknown input type: ${JSON.stringify(input)}`);
    return input;
  }
}

export const PostProcessorPipeline =
  createInterfaceId<PostProcessorPipeline>('PostProcessorPipeline');
