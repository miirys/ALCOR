import { DefaultKnownMarketplacesStore } from './marketplace/known_marketplaces_store';
import { DefaultMarketplaceFetcher } from './marketplace/marketplace_fetcher';
import { DefaultMarketplaceRegistry } from './marketplace/marketplace_registry';
import { DefaultInstalledPluginsStore } from './plugin/installed_plugins_store';
import { DefaultPluginsConfigStore } from './plugin/plugins_config_store';
import { DefaultPluginInstaller } from './plugin/plugin_installer';
import { DefaultPluginRegistry } from './plugin/plugin_registry';
import { DefaultPluginSourceResolver } from './plugin/plugin_source_resolver';
import { DefaultSafePluginFs } from './plugin/safe_plugin_fs';

export const duoPluginMarketplaceContributions = [
  DefaultKnownMarketplacesStore,
  DefaultMarketplaceFetcher,
  DefaultMarketplaceRegistry,
  DefaultSafePluginFs,
  DefaultPluginSourceResolver,
  DefaultInstalledPluginsStore,
  DefaultPluginsConfigStore,
  DefaultPluginInstaller,
  DefaultPluginRegistry,
];
