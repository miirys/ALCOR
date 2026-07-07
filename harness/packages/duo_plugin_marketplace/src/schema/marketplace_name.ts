import { z } from 'zod';

/** A marketplace name: kebab-case, used as the registry key and in `<plugin>@<marketplace>`. */
export const MarketplaceNameSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'marketplace name must be kebab-case');
