import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { FileAccessService, FileNotFoundError } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { KnownMarketplace } from '../schema/known_marketplaces';
import { parseKnownMarketplacesFile } from '../schema/parse';
import { getKnownMarketplacesFilePath } from './paths';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Reads and writes the local `known_marketplaces.json` registry. Validates on
 * read so a hand-edited or corrupt file surfaces a clear error rather than
 * silently dropping the user's marketplaces.
 */
export interface KnownMarketplacesStore {
  load(): Promise<Record<string, KnownMarketplace>>;
  get(name: string): Promise<KnownMarketplace | undefined>;
  upsert(name: string, entry: KnownMarketplace): Promise<void>;
}

export const KnownMarketplacesStore = createInterfaceId<KnownMarketplacesStore>(
  'PluginMarketplaceKnownMarketplacesStore',
);

@Implements(KnownMarketplacesStore)
@Service({
  dependencies: [Logger, FileAccessService],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultKnownMarketplacesStore implements KnownMarketplacesStore {
  #logger: Logger;

  #fileAccess: FileAccessService;

  constructor(logger: Logger, fileAccess: FileAccessService) {
    this.#logger = withPrefix(logger, '[KnownMarketplacesStore]');
    this.#fileAccess = fileAccess;
  }

  async load(): Promise<Record<string, KnownMarketplace>> {
    const filePath = getKnownMarketplacesFilePath();

    let raw: string;
    try {
      raw = await this.#fileAccess.getText(filePath);
    } catch (e) {
      if (e instanceof FileNotFoundError) {
        return {};
      }
      throw e;
    }

    return parseKnownMarketplacesFile(JSON.parse(raw));
  }

  async get(name: string): Promise<KnownMarketplace | undefined> {
    const entries = await this.load();
    return entries[name];
  }

  async upsert(name: string, entry: KnownMarketplace): Promise<void> {
    const entries = await this.load();
    entries[name] = entry;
    await this.#save(entries);
    this.#logger.info(`Recorded marketplace ${name}`);
  }

  async #save(entries: Record<string, KnownMarketplace>): Promise<void> {
    const filePath = getKnownMarketplacesFilePath();
    const dir = dirname(filePath);
    // `mode` on mkdir/writeFile only applies when the path is first created.
    // chmod afterwards so permissions are also enforced on pre-existing paths.
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    await chmod(dir, DIR_MODE);
    await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, { mode: FILE_MODE });
    await chmod(filePath, FILE_MODE);
  }
}
