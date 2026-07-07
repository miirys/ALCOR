import { z } from 'zod';

export const PluginManifestSchema = z
  .object({
    defaultEnabled: z.boolean().optional(),
    description: z.string().optional(),
    name: z.string(),
    version: z.string().optional(),
  })
  .loose();

/** A plugin directories `plugin.json` manifest. */
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
