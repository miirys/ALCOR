import { SuggestionOptionText } from '../../../api_types';
import { IDocContext } from '../../../document_transformer_service';
import { log } from '../../../log';
import { StreamingCompletionResponse } from '../../../notifications';
import { TreeSitterLanguageName } from '../../../tree_sitter/languages';
import { PostProcessor } from '../post_processor_pipeline';
import { NoopProcessor } from './noop_processor';

const logError = (error: unknown, context: { functionName: string; fileName: string }) => {
  let errorMessage: string = 'Unknown error';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  log.error(
    `[UrlSanitizationPostProcessor] Error in ${context.functionName} while processing ${context.fileName}: ${errorMessage}`,
  );
};

export class UrlSanitizationPostProcessor extends PostProcessor {
  #subProcessors = new Map<string, PostProcessor>();

  #defaultProcessor = new NoopProcessor();

  addProcessor(language: TreeSitterLanguageName, processor: PostProcessor) {
    this.#subProcessors.set(language, processor);
  }

  #getProcessor(context: IDocContext) {
    const processor = this.#subProcessors.get(context.languageId);
    log.warn(
      `[UrlSanitizationPostProcessor] picked ${processor ? context.languageId : 'plain text'} subprocessor`,
    );
    return processor || this.#defaultProcessor;
  }

  async processStream(
    context: IDocContext,
    input: StreamingCompletionResponse,
  ): Promise<StreamingCompletionResponse> {
    try {
      const processor = this.#getProcessor(context);
      return await processor.processStream(context, input);
    } catch (error) {
      logError(error, { functionName: 'processStream', fileName: context.fileRelativePath });
      return {
        ...input,
        completion: '',
      };
    }
  }

  async processCompletion(
    context: IDocContext,
    input: SuggestionOptionText[],
  ): Promise<SuggestionOptionText[]> {
    try {
      const processor = this.#getProcessor(context);
      return await processor.processCompletion(context, input);
    } catch (error) {
      logError(error, { functionName: 'processCompletion', fileName: context.fileRelativePath });
      return input.map((suggestion) => ({ ...suggestion, text: '' }));
    }
  }
}
