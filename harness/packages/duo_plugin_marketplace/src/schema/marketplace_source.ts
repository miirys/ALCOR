import { z } from 'zod';

const UrlMarketplaceSourceSchema = z.object({
  ref: z.string().optional(),
  source: z.literal('url'),
  url: z.string(),
});

const DirectoryMarketplaceSourceSchema = z.object({
  path: z.string(),
  source: z.literal('directory'),
});

export const MarketplaceSourceSchema = z.discriminatedUnion('source', [
  UrlMarketplaceSourceSchema,
  DirectoryMarketplaceSourceSchema,
]);

/** Where a marketplace catalog is fetched from: a git URL or a local directory. */
export type MarketplaceSource = z.infer<typeof MarketplaceSourceSchema>;
