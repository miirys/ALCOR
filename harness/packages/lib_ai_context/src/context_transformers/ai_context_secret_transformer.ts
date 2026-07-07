import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { AIContextItem } from '../ai_context_item';
import { AiContextTransformer } from './ai_context_transformer';

export interface SecretContextTransformer extends AiContextTransformer {}

@Injectable(AiContextTransformer, [Logger, SecretRedactor])
export class DefaultSecretContextTransformer implements SecretContextTransformer {
  #logger: Logger;

  #secretRedactor: SecretRedactor;

  constructor(logger: Logger, secretRedactor: SecretRedactor) {
    this.#secretRedactor = secretRedactor;
    this.#logger = withPrefix(logger, '[SecretContextTransformer]');
  }

  async transform(context: AIContextItem): Promise<AIContextItem> {
    if (!context.content) {
      return context;
    }

    this.#logger.debug(`Transforming context item "${context.id}"`);
    const redactedContent = this.#secretRedactor.redactSecrets(context.content, context.id);

    return {
      ...context,
      content: redactedContent,
    };
  }
}
