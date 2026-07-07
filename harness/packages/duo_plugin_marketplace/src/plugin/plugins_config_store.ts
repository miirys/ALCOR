import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { FileAccessService, FileNotFoundError } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { PluginsConfigFile } from '../schema/plugins';
import { parsePluginsConfigFile } from '../schema/parse';
import { getPluginsConfigFilePath, type PluginScope } from './plugin_paths';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Reads and writes a scope's `plugins.json` config: which plugins are enabled
 * and which marketplaces are known. Validates on read so a hand-edited or
 * corrupt file surfaces a clear error rather than silently losing config.
 */
export interface PluginsConfigStore {
  load(scope: PluginScope, workspacePath?: string): Promise<PluginsConfigFile>;
  setEnabled(
    id: string,
    enabled: boolean,
    scope: PluginScope,
    workspacePath?: string,
  ): Promise<void>;
  /**
   * A previously recorded enabled setting for a plugin, looked up in the
   * target scope and any broader scope (`local` → `project` → `user`).
   * Narrower scopes are never consulted, so a workspace-scoped setting cannot
   * leak into a broader scope's config when the result is written back.
   * Returns `undefined` when no consulted scope has a setting. Project/local
   * scopes are only consulted when a `workspacePath` is given.
   */
  getExistingEnabledSetting(
    id: string,
    scope: PluginScope,
    workspacePath?: string,
  ): Promise<boolean | undefined>;
}

export const PluginsConfigStore = createInterfaceId<PluginsConfigStore>(
  'PluginMarketplacePluginsConfigStore',
);

@Implements(PluginsConfigStore)
@Service({
  dependencies: [Logger, FileAccessService],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPluginsConfigStore implements PluginsConfigStore {
  #logger: Logger;

  #fileAccess: FileAccessService;

  constructor(logger: Logger, fileAccess: FileAccessService) {
    this.#logger = withPrefix(logger, '[PluginsConfigStore]');
    this.#fileAccess = fileAccess;
  }

  async load(scope: PluginScope, workspacePath?: string): Promise<PluginsConfigFile> {
    const filePath = getPluginsConfigFilePath(scope, workspacePath);

    let raw: string;
    try {
      raw = await this.#fileAccess.getText(filePath);
    } catch (e) {
      if (e instanceof FileNotFoundError) {
        return {};
      }
      throw e;
    }

    return parsePluginsConfigFile(JSON.parse(raw));
  }

  async getExistingEnabledSetting(
    id: string,
    scope: PluginScope,
    workspacePath?: string,
  ): Promise<boolean | undefined> {
    const ladder: PluginScope[] = ['local', 'project', 'user'];
    const scopes = ladder
      .slice(ladder.indexOf(scope))
      .filter((candidate) => candidate === 'user' || workspacePath !== undefined);
    for (const candidate of scopes) {
      // eslint-disable-next-line no-await-in-loop
      const config = await this.load(candidate, workspacePath);
      const setting = config.enabledPlugins?.[id];
      if (setting !== undefined) {
        return setting;
      }
    }
    return undefined;
  }

  async setEnabled(
    id: string,
    enabled: boolean,
    scope: PluginScope,
    workspacePath?: string,
  ): Promise<void> {
    const config = await this.load(scope, workspacePath);
    const enabledPlugins = config.enabledPlugins ?? {};
    enabledPlugins[id] = enabled;
    config.enabledPlugins = enabledPlugins;
    await this.#save(config, scope, workspacePath);
    this.#logger.info(`Set ${id} enabled=${enabled} in ${scope} scope`);
  }

  async #save(
    config: PluginsConfigFile,
    scope: PluginScope,
    workspacePath?: string,
  ): Promise<void> {
    const filePath = getPluginsConfigFilePath(scope, workspacePath);
    await mkdir(dirname(filePath), { recursive: true, mode: DIR_MODE });
    await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: FILE_MODE });
  }
}
