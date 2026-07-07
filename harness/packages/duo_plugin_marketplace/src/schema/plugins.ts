import { z } from 'zod';
import { MarketplaceNameSchema } from './marketplace_name';
import { MarketplaceSourceSchema } from './marketplace_source';

const KnownMarketplaceEntrySchema = z
  .object({
    autoUpdate: z.boolean().optional(),
    source: MarketplaceSourceSchema,
  })
  .loose();

export const PluginsConfigFileSchema = z
  .object({
    /** Plugin enablement, keyed by `<plugin>@<marketplace>`. */
    enabledPlugins: z.record(z.string(), z.boolean()).optional(),
    /** Marketplaces declared by this config, keyed by marketplace name. */
    extraKnownMarketplaces: z.record(MarketplaceNameSchema, KnownMarketplaceEntrySchema).optional(),
  })
  .loose();

/**
 * The `plugins.json` config: which plugins are enabled and which marketplaces
 * are known. Declared per scope (workspace `plugins.json` / `plugins.local.json`
 * / user-level) and merged across scopes by precedence.
 */
export type PluginsConfigFile = z.infer<typeof PluginsConfigFileSchema>;
