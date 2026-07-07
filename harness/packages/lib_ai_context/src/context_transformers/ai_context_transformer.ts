import { createInterfaceId } from '@gitlab/needle';
import type { AIContextItem } from '../ai_context_item';

export interface AiContextTransformer {
  transform(context: AIContextItem): Promise<AIContextItem>;
}

export const AiContextTransformer = createInterfaceId<AiContextTransformer>('AiContextTransformer');
