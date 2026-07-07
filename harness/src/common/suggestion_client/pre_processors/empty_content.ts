import { Injectable } from '@gitlab/needle';
import { type AIContextItem } from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { PreProcessor, PreProcessorItems, PipelineLogPrefix } from './pre_processor_pipeline';

export const emptyContentLog = ({ resolutionId }: { resolutionId: string }) => {
  return `Resolution ${resolutionId} has empty content, skipping`;
};

@Injectable(PreProcessor, [Logger])
export class EmptyContentPreProcessor implements PreProcessor {
  name = 'empty_content' as const;

  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, `${PipelineLogPrefix}-[EmptyContentPreProcessor]`);
  }

  async process(items: PreProcessorItems) {
    const isEmpty = (content: string) => content.replace(/\s/g, '') === '';
    const filteredResolutions: AIContextItem[] = [];
    for (const resolution of items.aiContextItems) {
      if (isEmpty(resolution.content ?? '')) {
        this.#logger.debug(emptyContentLog({ resolutionId: resolution.id }));
      } else {
        filteredResolutions.push(resolution);
      }
    }

    return { preProcessorItems: { ...items, aiContextItems: filteredResolutions } };
  }
}
