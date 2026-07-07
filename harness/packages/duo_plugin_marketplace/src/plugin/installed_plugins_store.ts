import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { FileAccessService, FileNotFoundError } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { InstalledPlugin } from '../schema/installed_plugins';
import { parseInstalledPluginsFile } from '../schema/parse';
import { getInstalledPluginsFilePath, type PluginScope } from './plugin_paths';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Reads and writes the global `installed_plugins.json` ledger, keyed by
 * `<plugin>@<marketplace>`. Each id maps to an array of records, one per scope
 * the plugin is installed in. Validates on read so a hand-edited or corrupt
 * file surfaces a clear error rather than silently dropping installed plugins.
 */
export interface InstalledPluginsStore {
  load(): Promise<Record<string, InstalledPlugin[]>>;
  get(id: string, scope: PluginScope): Promise<InstalledPlugin | undefined>;
  upsert(id: string, record: InstalledPlugin): Promise<void>;
  save(plugins: Record<string, InstalledPlugin[]>): Promise<void>;
}

export const InstalledPluginsStore = createInterfaceId<InstalledPluginsStore>(
  'PluginMarketplaceInstalledPluginsStore',
);

@Implements(InstalledPluginsStore)
@Service({
  dependencies: [Logger, FileAccessService],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultInstalledPluginsStore implements InstalledPluginsStore {
  #logger: Logger;

  #fileAccess: FileAccessService;

  constructor(logger: Logger, fileAccess: FileAccessService) {
    this.#logger = withPrefix(logger, '[InstalledPluginsStore]');
    this.#fileAccess = fileAccess;
  }

  async load(): Promise<Record<string, InstalledPlugin[]>> {
    const filePath = getInstalledPluginsFilePath();

    let raw: string;
    try {
      raw = await this.#fileAccess.getText(filePath);
    } catch (e) {
      if (e instanceof FileNotFoundError) {
        return {};
      }
      throw e;
    }

    const parsed = parseInstalledPluginsFile(JSON.parse(raw));
    return parsed.plugins;
  }

  async get(id: string, scope: PluginScope): Promise<InstalledPlugin | undefined> {
    const plugins = await this.load();
    return (plugins[id] ?? []).find((record) => record.scope === scope);
  }

  async upsert(id: string, record: InstalledPlugin): Promise<void> {
    const plugins = await this.load();
    const existing = (plugins[id] ?? []).filter((r) => r.scope !== record.scope);
    existing.push(record);
    plugins[id] = existing;
    await this.save(plugins);
    this.#logger.info(`Recorded plugin ${id} in ${record.scope} scope`);
  }

  async save(plugins: Record<string, InstalledPlugin[]>): Promise<void> {
    const filePath = getInstalledPluginsFilePath();
    await mkdir(dirname(filePath), { recursive: true, mode: DIR_MODE });
    const payload = { version: 1 as const, plugins };
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: FILE_MODE });
  }
}
