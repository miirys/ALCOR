import { z } from 'zod';
import { MarketplaceSourceSchema } from './marketplace_source';

export const KnownMarketplaceSchema = z.object({
  /** Absolute path of the cloned catalog under `<duoConfigDir>/marketplaces/<name>/`. */
  installLocation: z.string(),
  /** Commit SHA of the installed catalog; absent for directory sources. */
  installedRevision: z.string().optional(),
  lastUpdated: z.iso.datetime(),
  source: MarketplaceSourceSchema,
});

/** A registered marketplace. */
export type KnownMarketplace = z.infer<typeof KnownMarketplaceSchema>;

export const KnownMarketplacesFileSchema = z.record(z.string(), KnownMarketplaceSchema);

/** The `known_marketplaces.json` registry, keyed by marketplace name. */
export type KnownMarketplacesFile = z.infer<typeof KnownMarketplacesFileSchema>;
