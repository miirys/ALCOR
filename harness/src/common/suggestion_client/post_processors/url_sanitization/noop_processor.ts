import { PostProcessor } from '../post_processor_pipeline';
import { log } from '../../../log';
import { SuggestionOptionText } from '../../../api_types';
import { IDocContext } from '../../../document_transformer_service';
import { StreamingCompletionResponse } from '../../../notifications';

export class NoopProcessor extends PostProcessor {
  async processStream(
    _context: IDocContext,
    input: StreamingCompletionResponse,
  ): Promise<StreamingCompletionResponse> {
    log.info('[NOOP_URL_PROCESSOR] noop processStream called');
    return input;
  }

  async processCompletion(
    _context: IDocContext,
    input: SuggestionOptionText[],
  ): Promise<SuggestionOptionText[]> {
    log.info('[NOOP_URL_PROCESSOR] noop processStream called');
    return input;
  }
}
