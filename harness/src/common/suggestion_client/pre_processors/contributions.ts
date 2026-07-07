import { ByteSizeLimitPreProcessor } from './byte_size_limit';
import { ContextItemContentFetcher } from './context_item_content_fetcher';
import { ContextRanker } from './context_ranker';
import { DisabledItemPreProcessor } from './disabled_item';
import { EmptyContentPreProcessor } from './empty_content';
import { SupportedLanguagePreProcessor } from './supported_language';

export const preProcessorContributions = [
  DisabledItemPreProcessor,
  EmptyContentPreProcessor,
  ByteSizeLimitPreProcessor,
  SupportedLanguagePreProcessor,
  ContextItemContentFetcher,
  ContextRanker,
] as const;
