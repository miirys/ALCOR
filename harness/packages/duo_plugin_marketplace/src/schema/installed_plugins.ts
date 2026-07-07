import { z } from 'zod';

export const InstalledPluginSchema = z.object({
  installedAt: z.iso.datetime(),

  /** Shared cache directory `<duoConfigDir>/plugins/<marketplace>/<plugin>/<version>/`. */
  installPath: z.string(),
  lastUpdated: z.iso.datetime(),
  scope: z.enum(['user', 'project', 'local']),
  version: z.string(),
});

/** An installed plugin record, one per scope the plugin is installed in. */
export type InstalledPlugin = z.infer<typeof InstalledPluginSchema>;

export const InstalledPluginsFileSchema = z.object({
  plugins: z.record(z.string(), z.array(InstalledPluginSchema)),
  version: z.literal(1),
});

/** The global `installed_plugins.json` ledger, keyed by `<plugin>@<marketplace>`. */
export type InstalledPluginsFile = z.infer<typeof InstalledPluginsFileSchema>;
