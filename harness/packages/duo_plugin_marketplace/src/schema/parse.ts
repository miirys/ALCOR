import { z } from 'zod';
import { MarketplaceCatalogSchema, type MarketplaceCatalog } from './marketplace_catalog';
import { KnownMarketplacesFileSchema, type KnownMarketplacesFile } from './known_marketplaces';
import { InstalledPluginsFileSchema, type InstalledPluginsFile } from './installed_plugins';
import { PluginsConfigFileSchema, type PluginsConfigFile } from './plugins';
import { PluginManifestSchema, type PluginManifest } from './plugin_manifest';

/**
 * Thrown when untrusted or persisted JSON fails schema validation. The message
 * is a human-readable rendering of the zod issues to show the user
 */
export class SchemaValidationError extends Error {
  constructor(fileName: string, error: z.ZodError) {
    super(`${fileName} is invalid:\n${z.prettifyError(error)}`);
    this.name = 'SchemaValidationError';
  }
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, fileName: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new SchemaValidationError(fileName, result.error);
  }
  return result.data;
}

export function parseMarketplaceCatalog(raw: unknown): MarketplaceCatalog {
  return parseWith(MarketplaceCatalogSchema, raw, 'marketplace.json');
}

export function parseKnownMarketplacesFile(raw: unknown): KnownMarketplacesFile {
  return parseWith(KnownMarketplacesFileSchema, raw, 'known_marketplaces.json');
}

export function parseInstalledPluginsFile(raw: unknown): InstalledPluginsFile {
  return parseWith(InstalledPluginsFileSchema, raw, 'installed_plugins.json');
}

export function parsePluginsConfigFile(raw: unknown): PluginsConfigFile {
  return parseWith(PluginsConfigFileSchema, raw, 'plugins.json');
}

export function parsePluginManifest(raw: unknown): PluginManifest {
  return parseWith(PluginManifestSchema, raw, 'plugin.json');
}
