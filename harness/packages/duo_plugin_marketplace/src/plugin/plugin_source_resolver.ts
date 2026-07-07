import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { PluginManifest } from '../schema/plugin_manifest';
import type { PluginSource } from '../schema/plugin_source';
import { parsePluginManifest } from '../schema/parse';
import { isWithin } from './path_containment';
import { assertPathSegment } from './path_segment';
import { pathExists } from './cache_fs';

/**
 * Resolves a catalog plugin entry's `source` to a local directory on disk.
 * Relative (string) sources are fully supported and containment-checked against
 * the catalog directory. Object sources (github/url/git-subdir/npm) are not yet
 * supported and throw.
 */
export interface PluginSourceResolver {
  resolve(source: PluginSource, catalogDir: string, pluginRoot?: string): Promise<string>;
  /**
   * Read a plugin's `plugin.json`. Tolerant: returns `{}` when no manifest is
   * present or it cannot be parsed, so a missing manifest never blocks install.
   */
  readPluginManifest(pluginDir: string): Promise<Partial<PluginManifest>>;
}

export const PluginSourceResolver = createInterfaceId<PluginSourceResolver>(
  'PluginMarketplaceSourceResolver',
);

function splitSegments(value: string): string[] {
  return value
    .replace(/^\.\//, '')
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0);
}

@Implements(PluginSourceResolver)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPluginSourceResolver implements PluginSourceResolver {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[PluginSourceResolver]');
  }

  async resolve(source: PluginSource, catalogDir: string, pluginRoot?: string): Promise<string> {
    if (typeof source === 'string') {
      return this.#resolveRelative(source, catalogDir, pluginRoot);
    }
    return this.#rejectObjectSource(source);
  }

  async #resolveRelative(source: string, catalogDir: string, pluginRoot?: string): Promise<string> {
    const realCatalogDir = await realpath(catalogDir);

    const segments = [...(pluginRoot ? splitSegments(pluginRoot) : []), ...splitSegments(source)];
    for (const segment of segments) {
      assertPathSegment(segment, 'plugin source subdir');
    }

    const joined = resolve(realCatalogDir, ...segments);
    const realJoined = (await pathExists(joined)) ? await realpath(joined) : joined;
    if (!isWithin(realCatalogDir, realJoined)) {
      throw new Error(`Plugin source ${source} escapes catalog directory ${realCatalogDir}`);
    }
    if (!(await pathExists(realJoined))) {
      throw new Error(`Plugin source directory does not exist: ${realJoined}`);
    }
    return realJoined;
  }

  #rejectObjectSource(source: Exclude<PluginSource, string>): never {
    const detail = objectSourceDetail(source);
    throw new Error(`Plugin source kind "${source.source}" (${detail}) is not yet supported`);
  }

  async readPluginManifest(pluginDir: string): Promise<Partial<PluginManifest>> {
    const candidates = [
      join(pluginDir, 'plugin.json'),
      join(pluginDir, '.claude-plugin', 'plugin.json'),
    ];
    const existing = await Promise.all(
      candidates.map(async (candidate) => ((await pathExists(candidate)) ? candidate : null)),
    );
    const found = existing.find((candidate) => candidate !== null);
    if (!found) {
      return {};
    }
    try {
      const raw = await readFile(found, 'utf8');
      return parsePluginManifest(JSON.parse(raw));
    } catch (e) {
      this.#logger.warn(
        `Failed to read plugin manifest at ${found}`,
        e instanceof Error ? e : new Error(String(e)),
      );
      return {};
    }
  }
}

function objectSourceDetail(source: Exclude<PluginSource, string>): string {
  switch (source.source) {
    case 'github':
      return source.repo;
    case 'url':
    case 'git-subdir':
      return source.url;
    case 'npm':
      return source.package;
    default:
      return assertNever(source);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected plugin source: ${JSON.stringify(value)}`);
}
