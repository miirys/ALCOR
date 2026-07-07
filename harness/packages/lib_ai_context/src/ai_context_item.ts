import z from 'zod';
import { AIContextProviderTypeSchema } from './context_providers/ai_context_provider';
import { AIContextCategory } from './ai_context_category';

export const AIContextItemMetadataSchema = z.object({
  title: z.string(),
  enabled: z.boolean(),
  disabledReasons: z.array(z.string()).optional(),
  subType: AIContextProviderTypeSchema,
  icon: z.string(),
  secondaryText: z.string(),
  subTypeLabel: z.string(),
  /**
   * The languageId of the file, if the context item is a file
   */
  languageId: z.string().optional(),
});

export const AIContextItemBaseSchema = z.object({
  id: z.string(),
  category: AIContextCategory,
  content: z.string().optional(),
  metadata: AIContextItemMetadataSchema.optional(),
});

export const AIContextItemSchema = AIContextItemBaseSchema.extend({
  metadata: AIContextItemMetadataSchema, // required
});

export type AIContextItemMetadata = z.infer<typeof AIContextItemMetadataSchema>;

/**
 * Items that can be added to the AI context
 * @property {string} id - The id of the context item
 * @property {string} [content] - The content of the context item to be used by the AI, only sent on retrieval
 * @property {AIContextCategory} category - The category or source of the context item
 * @property {AIContextItemMetadata} metadata - Metadata about the context item for UI, format depends on category
 */
export type AIContextItem = z.infer<typeof AIContextItemSchema>;
