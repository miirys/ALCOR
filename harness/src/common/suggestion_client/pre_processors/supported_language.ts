import { Injectable } from '@gitlab/needle';
import { withPrefix, Logger } from '@gitlab-org/logging';
import { SupportedLanguagesService } from '../../suggestion/supported_languages_service';
import { PipelineLogPrefix, PreProcessor, PreProcessorItems } from './pre_processor_pipeline';

export const languageNotEnabledLog = ({
  languageId,
  resolutionId,
}: {
  languageId: string;
  resolutionId: string;
}) => {
  return `language "${languageId}" not enabled for context, skipping file: ${resolutionId}`;
};

@Injectable(PreProcessor, [Logger, SupportedLanguagesService])
export class SupportedLanguagePreProcessor implements PreProcessor {
  name = 'supported_language' as const;

  readonly #logger: Logger;

  readonly #supportedLanguagesService: SupportedLanguagesService;

  constructor(logger: Logger, supportedLanguagesService: SupportedLanguagesService) {
    this.#logger = withPrefix(logger, `${PipelineLogPrefix}-[SupportedLanguagePreProcessor]`);
    this.#supportedLanguagesService = supportedLanguagesService;
  }

  async process(items: PreProcessorItems) {
    try {
      const filteredResolutions = items.aiContextItems.filter((resolution) => {
        if (resolution.category !== 'file' || !resolution.metadata?.languageId) {
          // Not a file with a languageId we can check, so this filter doesn't apply
          return true;
        }

        const languageEnabled = this.#supportedLanguagesService.isLanguageEnabled(
          resolution.metadata?.languageId,
        );
        if (!languageEnabled) {
          this.#logger.debug(
            languageNotEnabledLog({
              languageId: resolution.metadata?.languageId,
              resolutionId: resolution.id,
            }),
          );
          return false;
        }
        return true;
      });

      return { preProcessorItems: { ...items, aiContextItems: filteredResolutions } };
    } catch (error) {
      return {
        preProcessorItems: { ...items, aiContextItems: [] },
        error: {
          type: 'continue' as const,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      };
    }
  }
}
