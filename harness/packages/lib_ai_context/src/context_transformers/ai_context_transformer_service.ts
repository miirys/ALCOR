import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import type { AIContextItem } from '../ai_context_item';
import { AiContextTransformer } from './ai_context_transformer';

export interface AiContextTransformerService {
  transform(context: AIContextItem): Promise<AIContextItem>;
}

export const AiContextTransformerService = createInterfaceId<AiContextTransformerService>(
  'AiContextTransformerService',
);

@Injectable(AiContextTransformerService, [collection(AiContextTransformer)])
export class DefaultAiContextTransformerService implements AiContextTransformerService {
  #transformers: AiContextTransformer[];

  constructor(transformers: AiContextTransformer[]) {
    this.#transformers = transformers;
  }

  async transform(contextItem: AIContextItem): Promise<AIContextItem> {
    let transformedItem = contextItem;
    for (const transformer of this.#transformers) {
      // eslint-disable-next-line no-await-in-loop
      transformedItem = await transformer.transform(transformedItem);
    }

    return transformedItem;
  }
}
