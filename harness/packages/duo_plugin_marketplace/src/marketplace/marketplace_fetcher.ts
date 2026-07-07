import { access, cp, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { gitClone } from '../git/git_clone';
import type { MarketplaceCatalog } from '../schema/marketplace_catalog';
import type { MarketplaceSource } from '../schema/marketplace_source';
import { parseMarketplaceCatalog } from '../schema/parse';
import { getInstallLocation, getMarketplacesDir } from './paths';

const CATALOG_FILENAMES = ['marketplace.json', join('.claude-plugin', 'marketplace.json')];

const DIR_MODE = 0o700;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** A fetched, validated marketplace catalog and where it now lives on disk. */
export interface FetchedCatalog {
  catalog: MarketplaceCatalog;
  /** Absolute path of the catalog under `<duoConfigDir>/marketplaces/<name>/`. */
  installLocation: string;
  /** Commit SHA of the installed catalog; absent for directory sources. */
  installedRevision?: string;
}

/**
 * Fetches a marketplace catalog and makes it available on disk. Owns the full
 * fetch lifecycle: staging into a temp dir, validating `marketplace.json`, and
 * moving it to its final `marketplaces/<name>/` location.
 */
export interface MarketplaceFetcher {
  fetch(source: MarketplaceSource): Promise<FetchedCatalog>;

  /**
   * Read and validate a marketplace catalog from a directory, accepting either
   * `marketplace.json` or `.claude-plugin/marketplace.json`. Throws if neither
   * is present or the JSON fails schema validation.
   */
  readInstalledCatalog(dir: string): Promise<MarketplaceCatalog>;
}

export const MarketplaceFetcher = createInterfaceId<MarketplaceFetcher>('PluginMarketplaceFetcher');

@Implements(MarketplaceFetcher)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMarketplaceFetcher implements MarketplaceFetcher {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[MarketplaceFetcher]');
  }

  async fetch(source: MarketplaceSource): Promise<FetchedCatalog> {
    await mkdir(getMarketplacesDir(), { recursive: true, mode: DIR_MODE });
    const tempDir = await mkdtemp(join(getMarketplacesDir(), '.tmp-'));

    try {
      const populated = await this.#populate(source, tempDir);

      // Strip .git metadata so the published dir is the consumed artifact only
      await rm(join(tempDir, '.git'), { recursive: true, force: true });

      // marketplace.json's `name` is the registry key; the schema already
      // validates it as kebab-case (a safe single path segment).
      const catalog = await this.readInstalledCatalog(tempDir);

      const installLocation = getInstallLocation(catalog.name);
      await rm(installLocation, { recursive: true, force: true });
      await rename(tempDir, installLocation);

      return { catalog, installLocation, installedRevision: populated?.installedRevision };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async readInstalledCatalog(dir: string): Promise<MarketplaceCatalog> {
    const candidates = CATALOG_FILENAMES.map((filename) => join(dir, filename));
    const existing = await Promise.all(
      candidates.map(async (candidate) => ((await pathExists(candidate)) ? candidate : null)),
    );
    const found = existing.find((candidate) => candidate !== null);
    if (!found) {
      throw new Error(
        `No marketplace.json found in ${dir} (looked for ${CATALOG_FILENAMES.join(' and ')})`,
      );
    }
    const text = await readFile(found, 'utf-8');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`${found} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    return parseMarketplaceCatalog(raw);
  }

  async #populate(
    source: MarketplaceSource,
    destDir: string,
  ): Promise<{ installedRevision: string } | undefined> {
    if (source.source === 'directory') {
      this.#logger.debug(`Copying marketplace directory into ${destDir}`);
      // `verbatimSymlinks` keeps relative link values intact. Without it, `cp`
      // rewrites a relative symlink to an absolute path into the original
      // source, which would then escape this copied catalog and be dropped when
      // the plugin is installed. The install step applies the real
      // preserve/dereference/skip containment rules against this faithful copy.
      await cp(source.path, destDir, { recursive: true, verbatimSymlinks: true });
      return undefined;
    }

    this.#logger.debug(`Cloning marketplace ${source.url} into ${destDir}`);
    const { sha } = await gitClone({ url: source.url, dest: destDir, ref: source.ref });
    return { installedRevision: sha };
  }
}
