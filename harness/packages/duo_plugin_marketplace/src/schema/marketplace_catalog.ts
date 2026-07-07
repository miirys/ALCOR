import { z } from 'zod';
import { MarketplaceNameSchema } from './marketplace_name';
import { MarketplacePluginEntrySchema } from './marketplace_plugin_entry';

// Optional alternatives to the top-level `description`/`version`.
const MarketplaceMetadataSchema = z
  .object({
    description: z.string().optional(),
    /**
     * Optional prefix for plugin `source` paths in this catalog: each plugin's
     * `source` is resolved relative to it. Lets a catalog shorten repeated paths.
     *
     * @example
     * // these two catalogs describe the same plugin location:
     * { plugins: [{ name: 'fmt', source: './plugins/fmt' }] }
     * { metadata: { pluginRoot: './plugins' }, plugins: [{ name: 'fmt', source: 'fmt' }] }
     */
    pluginRoot: z.string().optional(),
    version: z.string().optional(),
  })
  .loose();

export const MarketplaceCatalogSchema = z
  .object({
    description: z.string().optional(),
    metadata: MarketplaceMetadataSchema.optional(),
    name: MarketplaceNameSchema,
    owner: z.object({
      email: z.string().optional(),
      name: z.string(),
    }),
    plugins: z.array(MarketplacePluginEntrySchema),
    version: z.string().optional(),
  })
  .loose();

/** The `marketplace.json` catalog a marketplace publishes. */
export type MarketplaceCatalog = z.infer<typeof MarketplaceCatalogSchema>;
