import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { InstalledPlugin } from '../schema/installed_plugins';
import { InstalledPluginsStore } from './installed_plugins_store';
import { PluginsConfigStore } from './plugins_config_store';
import type { PluginScope } from './plugin_paths';

const SCOPE_ORDER: PluginScope[] = ['user', 'project', 'local'];

/** A resolved installed-plugin entry joining the ledger record with enabled-state. */
export interface ListedPlugin {
  id: string;
  version: string;
  scope: PluginScope;
  enabled: boolean;
  installPath: string;
  installedAt: string;
  lastUpdated: string;
}

export interface ListOptions {
  workspacePath?: string;
}

/** Manages the set of installed plugins and their enabled-state. */
export interface PluginRegistry {
  list(opts?: ListOptions): Promise<ListedPlugin[]>;
}

export const PluginRegistry = createInterfaceId<PluginRegistry>('PluginMarketplacePluginRegistry');

@Implements(PluginRegistry)
@Service({
  dependencies: [Logger, InstalledPluginsStore, PluginsConfigStore],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPluginRegistry implements PluginRegistry {
  #logger: Logger;

  #store: InstalledPluginsStore;

  #config: PluginsConfigStore;

  constructor(logger: Logger, store: InstalledPluginsStore, config: PluginsConfigStore) {
    this.#logger = withPrefix(logger, '[PluginRegistry]');
    this.#store = store;
    this.#config = config;
  }

  async list(opts?: ListOptions): Promise<ListedPlugin[]> {
    const ledger = await this.#store.load();

    const pairs: [string, InstalledPlugin][] = Object.entries(ledger).flatMap(([id, records]) =>
      records.map((record): [string, InstalledPlugin] => [id, record]),
    );

    const presentScopes = [...new Set(pairs.map(([, record]) => record.scope))];

    const scopeEntries = await Promise.all(
      presentScopes.map(async (scope): Promise<[PluginScope, Record<string, boolean>]> => {
        try {
          const config = await this.#config.load(scope, opts?.workspacePath);
          return [scope, config.enabledPlugins ?? {}];
        } catch (e) {
          this.#logger.warn(
            `Could not read plugins config for scope "${scope}", defaulting to enabled`,
            e instanceof Error ? e : new Error(String(e)),
          );
          return [scope, {}];
        }
      }),
    );
    const enabledMaps = new Map<PluginScope, Record<string, boolean>>(scopeEntries);

    const plugins: ListedPlugin[] = pairs.map(([id, record]) => {
      const scopeMap = enabledMaps.get(record.scope) ?? {};
      const enabled = scopeMap[id] ?? true;
      return {
        id,
        version: record.version,
        scope: record.scope,
        enabled,
        installPath: record.installPath,
        installedAt: record.installedAt,
        lastUpdated: record.lastUpdated,
      };
    });

    plugins.sort((a, b) => {
      const scopeDiff = SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
      if (scopeDiff !== 0) return scopeDiff;
      return a.id.localeCompare(b.id);
    });

    return plugins;
  }
}
