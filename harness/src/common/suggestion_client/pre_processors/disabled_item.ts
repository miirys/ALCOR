import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { type AIContextItem } from '@gitlab-org/ai-context';
import { asTypedContextItem } from '../../ai_context_management/context_providers/types';
import { PreProcessor, PreProcessorItems, PipelineLogPrefix } from './pre_processor_pipeline';

export const disabledItemLog = (aiContextItem: AIContextItem) => {
  if (
    asTypedContextItem(aiContextItem, 'open_tab') ||
    asTypedContextItem(aiContextItem, 'import')
  ) {
    const { metadata } = aiContextItem;
    return `Disabled item: ${metadata.disabledReasons?.join(', ')} ${metadata?.project ? `for project ${metadata.project}` : ''}`;
  }
  return `Disabled item: ${aiContextItem.metadata.disabledReasons?.join(', ')}`;
};

@Injectable(PreProcessor, [Logger])
export class DisabledItemPreProcessor implements PreProcessor {
  name = 'disabled_item' as const;

  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, `${PipelineLogPrefix}-[DisabledItemPreProcessor]`);
  }

  async process(items: PreProcessorItems) {
    return {
      preProcessorItems: {
        documentContext: items.documentContext,
        aiContextItems: items.aiContextItems.filter((item) => {
          if (item.metadata.enabled) {
            return true;
          }
          this.#logger.info(disabledItemLog(item));
          return false;
        }),
      },
    };
  }
}
