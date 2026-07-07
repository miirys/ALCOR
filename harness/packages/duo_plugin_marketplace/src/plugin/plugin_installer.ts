import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { InstalledPlugin } from '../schema/installed_plugins';
import { MarketplaceFetcher } from '../marketplace/marketplace_fetcher';
import { KnownMarketplacesStore } from '../marketplace/known_marketplaces_store';
import { pathExists, touchAccessedMarker } from './cache_fs';
import { InstalledPluginsStore } from './installed_plugins_store';
import { PluginsConfigStore } from './plugins_config_store';
import { assertPathSegment } from './path_segment';
import { getPluginInstallDir, type PluginScope } from './plugin_paths';
import type { PluginSpecifier } from './plugin_specifier';
import { PluginSourceResolver } from './plugin_source_resolver';
import { SafePluginFs } from './safe_plugin_fs';

/**
 * The version segment used when a plugin declares no version anywhere. Matches
 * Claude Code's behaviour: unversioned plugins share a single `unknown` cache
 * dir and are re-copied from source on every install, since there is no version
 * to key the cache on.
 */
export const UNVERSIONED = 'unknown';

/** The outcome of a successful install: the ledger id and the stored record. */
export interface InstallResult {
  id: string;
  scope: PluginScope;
  record: InstalledPlugin;
}

/** Installs a marketplace plugin into a scope's ledger and the shared store. */
export interface PluginInstaller {
  install(spec: PluginSpecifier, scope: PluginScope, workspacePath: string): Promise<InstallResult>;
}

export const PluginInstaller = createInterfaceId<PluginInstaller>('PluginMarketplaceInstaller');

/**
 * The `defaultEnabled` fallback for a freshly installed plugin: the marketplace
 * entry's value takes precedence over the plugin manifest's, defaulting to
 * enabled when neither declares one. Only consulted when the user has no
 * existing enabled setting.
 */
export function resolveDefaultEnabled(
  entryDefaultEnabled: boolean | undefined,
  manifestDefaultEnabled: boolean | undefined,
): boolean {
  return entryDefaultEnabled ?? manifestDefaultEnabled ?? true;
}

@Implements(PluginInstaller)
@Service({
  dependencies: [
    Logger,
    KnownMarketplacesStore,
    MarketplaceFetcher,
    SafePluginFs,
    PluginSourceResolver,
    InstalledPluginsStore,
    PluginsConfigStore,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPluginInstaller implements PluginInstaller {
  #logger: Logger;

  #marketplaces: KnownMarketplacesStore;

  #fetcher: MarketplaceFetcher;

  #safeFs: SafePluginFs;

  #resolver: PluginSourceResolver;

  #store: InstalledPluginsStore;

  #pluginsConfig: PluginsConfigStore;

  constructor(
    logger: Logger,
    marketplaces: KnownMarketplacesStore,
    fetcher: MarketplaceFetcher,
    safeFs: SafePluginFs,
    resolver: PluginSourceResolver,
    store: InstalledPluginsStore,
    pluginsConfig: PluginsConfigStore,
  ) {
    this.#logger = withPrefix(logger, '[PluginInstaller]');
    this.#marketplaces = marketplaces;
    this.#fetcher = fetcher;
    this.#safeFs = safeFs;
    this.#resolver = resolver;
    this.#store = store;
    this.#pluginsConfig = pluginsConfig;
  }

  async install(
    spec: PluginSpecifier,
    scope: PluginScope,
    workspacePath: string,
  ): Promise<InstallResult> {
    const marketplace = await this.#marketplaces.get(spec.marketplace);
    if (!marketplace) {
      throw new Error(
        `Unknown marketplace "${spec.marketplace}". Run: duo plugin marketplace add <source>`,
      );
    }

    const catalog = await this.#fetcher.readInstalledCatalog(marketplace.installLocation);
    const entry = catalog.plugins.find((plugin) => plugin.name === spec.plugin);
    if (!entry) {
      const available = catalog.plugins.map((plugin) => plugin.name).join(', ') || '(none)';
      throw new Error(
        `Plugin "${spec.plugin}" not found in marketplace "${spec.marketplace}". Available: ${available}`,
      );
    }

    const id = `${spec.plugin}@${spec.marketplace}`;
    const existing = await this.#store.get(id, scope);
    if (existing) {
      throw new Error(`Plugin ${id} is already installed in ${scope} scope`);
    }

    const pluginSrcDir = await this.#resolver.resolve(
      entry.source,
      marketplace.installLocation,
      catalog.metadata?.pluginRoot,
    );
    const manifest = await this.#resolver.readPluginManifest(pluginSrcDir);
    const version = this.#resolveVersion(id, manifest.version ?? entry.version);
    assertPathSegment(version, 'plugin version');

    const installDir = getPluginInstallDir(spec.marketplace, spec.plugin, version);
    // An unversioned plugin has no version to key the cache on, so a cached copy
    // may be stale. Always re-copy it from source; only genuinely versioned
    // plugins are safe to reuse.
    if (version !== UNVERSIONED && (await pathExists(installDir))) {
      await this.#safeFs.assertWithinStore(installDir);
      this.#logger.info(`Reusing cached ${id}@${version} at ${installDir}`);
    } else {
      await this.#safeFs.placePluginFiles(pluginSrcDir, installDir, {
        marketplaceRoot: marketplace.installLocation,
      });
      this.#logger.info(`Materialised ${id}@${version} into ${installDir}`);
    }
    await touchAccessedMarker(installDir);

    const now = new Date().toISOString();
    const record: InstalledPlugin = {
      installedAt: now,
      installPath: installDir,
      lastUpdated: now,
      scope,
      version,
    };
    await this.#store.upsert(id, record);

    // A previously recorded enabled setting in the target or a broader scope
    // persists across reinstalls, winning over the plugin's declared default.
    const existingEnabled = await this.#pluginsConfig.getExistingEnabledSetting(
      id,
      scope,
      workspacePath,
    );
    // TODO: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/work_items/2605
    // when plugin dependencies are supported, a plugin required by another
    // active plugin must be forced enabled here, taking precedence over its own defaultEnabled.
    const enabled =
      existingEnabled ?? resolveDefaultEnabled(entry.defaultEnabled, manifest.defaultEnabled);
    await this.#pluginsConfig.setEnabled(id, enabled, scope, workspacePath);

    return { id, scope, record };
  }

  // Normalise a declared version into a value safe to use as a directory name.
  // Semver build metadata (`1.0.0+build.5`) is dropped because `+` is not a safe
  // path segment and the build suffix is irrelevant to which version is cached.
  // When no version is declared anywhere, fall back to `unknown` and warn; such
  // plugins are re-copied from source on every install (see the cache check).
  #resolveVersion(id: string, declared: string | undefined): string {
    if (declared) {
      return declared.replace(/\+.*$/, '');
    }
    this.#logger.warn(
      `Plugin ${id} declares no version; using "${UNVERSIONED}" (cache cannot be shared)`,
    );
    return UNVERSIONED;
  }
}
