// Node-only entry: services that depend on `node:*` / `simple-git`.
export { duoPluginMarketplaceContributions } from './contributions';
export { MarketplaceRegistry, type MarketplaceListItem } from './marketplace/marketplace_registry';
export { MarketplaceFetcher, type FetchedCatalog } from './marketplace/marketplace_fetcher';
export { PluginInstaller, type InstallResult } from './plugin/plugin_installer';
export { parseSpecifier, type PluginSpecifier } from './plugin/plugin_specifier';
export { PluginRegistry, type ListedPlugin } from './plugin/plugin_registry';
export type { PluginScope } from './plugin/plugin_paths';
