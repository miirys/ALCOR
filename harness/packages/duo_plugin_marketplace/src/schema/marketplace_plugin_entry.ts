import { z } from 'zod';
import { MarketplaceNameSchema } from './marketplace_name';
import { PluginSourceSchema } from './plugin_source';

export const MarketplacePluginEntrySchema = z
  .object({
    defaultEnabled: z.boolean().optional(),
    description: z.string().optional(),
    name: MarketplaceNameSchema,
    source: PluginSourceSchema,
    version: z.string().optional(),
  })
  .loose();

/** A single plugin entry in a marketplace catalog. */
export type MarketplacePluginEntry = z.infer<typeof MarketplacePluginEntrySchema>;
