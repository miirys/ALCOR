import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { KnownMarketplace } from '../schema/known_marketplaces';
import { KnownMarketplacesStore } from './known_marketplaces_store';
import { MarketplaceFetcher } from './marketplace_fetcher';
import { resolveSource } from './sources/source_resolver';

/** A registered marketplace plus the name it is keyed by. */
export interface RegisteredMarketplace {
  name: string;
  marketplace: KnownMarketplace;
}

/** A registered marketplace plus the number of plugins its catalog advertises. */
export interface MarketplaceListItem {
  name: string;
  marketplace: KnownMarketplace;
  /** Plugins in the catalog, or `undefined` if the catalog could not be read. */
  pluginCount?: number;
}

/** Manages the set of known marketplaces and their catalogs. */
export interface MarketplaceRegistry {
  /**
   * Register a marketplace from a source (local directory or git URL). Fetches
   * and validates its catalog, records it, and returns the stored entry.
   */
  add(source: string): Promise<RegisteredMarketplace>;

  /**
   * List the registered marketplaces, each with its plugin count read from the
   * cloned catalog on disk. A marketplace whose catalog cannot be read is still
   * listed, with an undefined plugin count.
   */
  list(): Promise<MarketplaceListItem[]>;
}

export const MarketplaceRegistry = createInterfaceId<MarketplaceRegistry>(
  'PluginMarketplaceRegistry',
);

@Implements(MarketplaceRegistry)
@Service({
  dependencies: [Logger, KnownMarketplacesStore, MarketplaceFetcher],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMarketplaceRegistry implements MarketplaceRegistry {
  #logger: Logger;

  #store: KnownMarketplacesStore;

  #fetcher: MarketplaceFetcher;

  constructor(logger: Logger, store: KnownMarketplacesStore, fetcher: MarketplaceFetcher) {
    this.#logger = withPrefix(logger, '[PluginMarketplaceRegistry]');
    this.#store = store;
    this.#fetcher = fetcher;
  }

  async add(source: string): Promise<RegisteredMarketplace> {
    const resolved = await resolveSource(source);
    this.#logger.debug(`Source "${source}" resolved to ${JSON.stringify(resolved)}`);

    const { catalog, installLocation, installedRevision } = await this.#fetcher.fetch(resolved);

    const marketplace: KnownMarketplace = {
      source: resolved,
      lastUpdated: new Date().toISOString(),
      installLocation,
      installedRevision,
    };
    await this.#store.upsert(catalog.name, marketplace);
    this.#logger.info(`Added marketplace ${catalog.name} (${catalog.plugins.length} plugins)`);
    return { name: catalog.name, marketplace };
  }

  async list(): Promise<MarketplaceListItem[]> {
    const entries = Object.entries(await this.#store.load());
    return Promise.all(
      entries.map(async ([name, marketplace]) => ({
        name,
        marketplace,
        pluginCount: await this.#countPlugins(marketplace.installLocation),
      })),
    );
  }

  async #countPlugins(installLocation: string): Promise<number | undefined> {
    try {
      const catalog = await this.#fetcher.readInstalledCatalog(installLocation);
      return catalog.plugins.length;
    } catch (e) {
      this.#logger.warn(
        `Could not read catalog at ${installLocation} for plugin count`,
        e instanceof Error ? e : new Error(String(e)),
      );
      return undefined;
    }
  }
}
