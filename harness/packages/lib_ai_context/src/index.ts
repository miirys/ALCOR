import { z } from 'zod';
import { AIContextCategory } from './ai_context_category';

export * from './ai_context_category';
export * from './ai_context_item';
export * from './context_providers/ai_context_provider';
export * from './chat_context_manager';
export * from './context_transformers';
export * from './system_context';
export type * from './context_providers';

export type AIContextPolicyResponse = {
  enabled: boolean;
  disabledReasons?: string[];
};

export const DuoChatAIRequest = z.object({
  category: AIContextCategory,
  query: z.string(),
  workspaceFolders: z.array(z.object({ uri: z.string(), name: z.string() })).optional(),
});

export type DuoChatAIRequest = z.infer<typeof DuoChatAIRequest>;

export type AIContextResolverRequest = {
  newConversation?: Boolean;
  mode?: 'agentic' | 'classic_chat';
};
