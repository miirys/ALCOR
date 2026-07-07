import { join } from 'node:path';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';

/** The scope a plugin is installed in. */
export type PluginScope = 'user' | 'project' | 'local';

/** Name of the touch-marker written inside each cached plugin version dir. */
export const ACCESSED_MARKER = '.accessed';

function duoConfigDir(): string {
  const dir = getDuoConfigDir();
  if (!dir) {
    throw new Error('Unable to resolve the Duo config directory.');
  }
  return dir;
}

/** `<duoConfigDir>/plugins` — the shared store holding materialised plugin versions. */
export function getPluginStoreRoot(): string {
  return join(duoConfigDir(), 'plugins');
}

/**
 * The shared cache location for a plugin version, keyed only by
 * `<marketplace>/<plugin>/<version>` so every consumer shares one copy on disk
 * (not scoped by workspace).
 */
export function getPluginInstallDir(marketplace: string, plugin: string, version: string): string {
  return join(getPluginStoreRoot(), marketplace, plugin, version);
}

/**
 * Path of the global `installed_plugins.json` ledger. There is one ledger for
 * all scopes; each record carries its own `scope`. Lives at the Duo config root.
 */
export function getInstalledPluginsFilePath(): string {
  return join(duoConfigDir(), 'installed_plugins.json');
}

/**
 * Path of a scope's `plugins.json` config (plugin enablement). User scope lives
 * at the Duo config root; project/local scopes live under the workspace's
 * `.gitlab/duo/` (`plugins.json` is committed, `plugins.local.json` is ignored).
 */
export function getPluginsConfigFilePath(scope: PluginScope, workspacePath?: string): string {
  if (scope === 'user') {
    return join(duoConfigDir(), 'plugins.json');
  }
  if (!workspacePath) {
    throw new Error(`A workspace path is required to resolve the ${scope} plugins.json`);
  }
  const fileName = scope === 'local' ? 'plugins.local.json' : 'plugins.json';
  return join(workspacePath, '.gitlab', 'duo', fileName);
}
