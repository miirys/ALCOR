import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { isBinaryContent } from '@gitlab-org/fs';
import type { AIContextItem } from '../ai_context_item';
import { AiContextTransformer } from './ai_context_transformer';

export const BINARY_FILE_DISABLED_REASON = 'Binary files are unsupported';

export interface BinaryFileTransformer extends AiContextTransformer {}

@Injectable(AiContextTransformer, [Logger])
export class DefaultBinaryFileTransformer implements BinaryFileTransformer {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[BinaryFileTransformer]');
  }

  async transform(context: AIContextItem): Promise<AIContextItem> {
    if (!context.content) {
      return context;
    }

    if (isBinaryContent(context.content)) {
      this.#logger.debug(`Detected binary content in "${context.id}". File disabled.`);
      return {
        ...context,
        content: '',
        metadata: {
          ...context.metadata,
          enabled: false,
          disabledReasons: [
            ...(context.metadata.disabledReasons || []),
            BINARY_FILE_DISABLED_REASON,
          ],
        },
      };
    }

    return context;
  }
}
