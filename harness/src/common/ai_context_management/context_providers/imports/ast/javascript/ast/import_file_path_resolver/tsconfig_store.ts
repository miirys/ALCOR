import { dirname } from 'path';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { RepositoryFile, RepositoryService, Repository } from '@gitlab-org/repositories';
import { CompositeDisposable, type Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FsClient, parseURIString } from '@gitlab-org/fs';

export interface TsConfigStore extends Disposable {
  findApplicableConfig(
    filePath: string,
    repository: Repository,
  ): Promise<ts.ParsedCommandLine | null>;
}

/*
 * We cache our parsed tsconfigs in a lookup object to allow for faster matching,
 * since finding a matching config from a fileUri is the 'hot path' we hit from code suggestions
 */
interface ConfigLookupCache {
  exactMatches: Map<string, ts.ParsedCommandLine>;
  wildcardDirs: {
    dir: string;
    config: ts.ParsedCommandLine;
    allowJs: boolean;
  }[];
}

export const TsConfigStore = createInterfaceId<TsConfigStore>('TsConfigStore');

type RepositoryUri = URI;
type ConfigFsPath = string;
type ParsedConfigs = Map<ConfigFsPath, ts.ParsedCommandLine>;

@Injectable(TsConfigStore, [Logger, FsClient, RepositoryService])
export class DefaultTsConfigStore implements TsConfigStore, Disposable {
  readonly #configCache = new Map<RepositoryUri, Promise<ConfigLookupCache>>();

  /*
   * Tracks config files we used while reading/parsing a tsconfig. Since tsconfig `extends` can extend any arbitrary
   * json file, we need to keep track of which files were actually read as part of parsing a config. That way we can
   * watch for changes to any of these files and invalidate our cache.
   * */
  readonly #configDependencies = new Map<RepositoryUri, Set<string>>();

  readonly #disposables = new CompositeDisposable();

  readonly #logger: Logger;

  readonly #fsClient: FsClient;

  readonly #repositoryService: RepositoryService;

  readonly #TS_EXTENSIONS = new Set(['.ts', '.tsx']);

  readonly #JS_AND_FRAMEWORK_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.vue',
    '.svelte',
  ]);

  constructor(logger: Logger, fsClient: FsClient, repositoryService: RepositoryService) {
    this.#logger = withPrefix(logger, '[TsConfigStore]');
    this.#fsClient = fsClient;
    this.#repositoryService = repositoryService;

    this.#setupListeners();
  }

  #setupListeners(): void {
    this.#disposables.add(
      this.#repositoryService.onFileChange(async (event) => {
        const fileUri = parseURIString(event.fileEvent.uri);

        const repo = await this.#repositoryService.getMatchingRepository(
          fileUri,
          event.workspaceFolder.uri,
        );
        const repoUri = repo?.uri;
        if (!repoUri) {
          return;
        }

        const configFiles = this.#configDependencies.get(repoUri);
        if (!configFiles?.has(fileUri.fsPath)) {
          return;
        }

        this.#configCache.delete(repoUri);
        this.#configDependencies.delete(repoUri);
        this.#configCache.set(repoUri, this.#parseAllConfigsInRepository(repo));
      }),
    );

    this.#disposables.add(
      this.#repositoryService.onWorkspaceRepositoriesStart(() => this.#configCache.clear()),
    );
  }

  dispose(): void {
    this.#disposables.dispose();
    this.#configCache.clear();
    this.#configDependencies.clear();
  }

  async #parseAllConfigsInRepository(repository: Repository): Promise<ConfigLookupCache> {
    const perfKey = `parseAllConfigsInRepository_${repository.uri.fsPath}`;
    performance.mark(`mark_${perfKey}`);

    try {
      const dependencies = new Set<string>();
      this.#configDependencies.set(repository.uri, dependencies);

      const allConfigFiles = this.#findConfigFiles(repository);
      const fileContents = await this.#preloadConfigFiles(allConfigFiles);
      const configs = this.#parseConfigs(allConfigFiles, fileContents, dependencies, repository);
      const cache = this.#buildConfigCache(configs);

      const { duration } = performance.measure(`measure_${perfKey}`, `mark_${perfKey}`);
      this.#logger.debug(
        `Parsed all tsconfigs/jsconfigs in "${repository.uri}" in ${duration.toFixed(2)}ms`,
      );

      return cache;
    } finally {
      performance.clearMarks(`mark_${perfKey}`);
      performance.clearMeasures(`measure_${perfKey}`);
    }
  }

  #findConfigFiles(repository: Repository) {
    return repository.getCurrentTreeFiles().filter((f) => {
      const fsPath = f.uri.fsPath.toLowerCase();

      if (fsPath.includes('node_modules')) return false;
      if (!fsPath.endsWith('.json')) return false;

      // While tsconfig can `extend` any arbitrary file, we guess at the repo files most likely to be used for config parsing
      return (
        fsPath.includes('tsconfig') ||
        fsPath.includes('jsconfig') ||
        fsPath.endsWith('package.json')
      );
    });
  }

  async #preloadConfigFiles(allConfigFiles: RepositoryFile[]) {
    // Since the `ts` APIs are synchronous, and we must support async fs operations (for node/browser compat), we first preload
    // all config files into memory. Then we provide custom sync fs functions to `ts` which read from this preloaded content.
    const fileContents = new Map<string, Buffer>();
    await Promise.all(
      allConfigFiles.map(async (configFile) => {
        try {
          const { fsPath } = configFile.uri;
          const content = await this.#fsClient.promises.readFile(fsPath);
          fileContents.set(fsPath, content);
        } catch (error) {
          this.#logger.warn(`Failed to read config file: "${configFile.uri.fsPath}"`, error);
          // Continue with other files, this is a "best effort" process
        }
      }),
    );
    return fileContents;
  }

  #parseConfigs(
    allConfigFiles: RepositoryFile[],
    fileContents: Map<string, Buffer>,
    dependencies: Set<string>,
    repository: Repository,
  ): ParsedConfigs {
    return new Map(
      allConfigFiles
        .map((configFile) => {
          const { fsPath } = configFile.uri;

          try {
            dependencies.add(fsPath);

            // Use `readConfigFile` helper instead of JSON.parse(). This will handle JSONC (JSON with comments)
            // and other non-standard JSON bits'n'bobs that a tsconfig.json may contain
            const { config } = ts.readConfigFile(fsPath, (filePath) => {
              if (fileContents.has(filePath)) {
                return fileContents.get(filePath)?.toString();
              }
              return undefined;
            });

            if (!config) return null;

            const parsed = ts.parseJsonConfigFileContent(
              config,
              {
                readFile: (filePath) => {
                  dependencies.add(filePath);

                  if (fileContents.has(filePath)) {
                    return fileContents.get(filePath)?.toString();
                  }

                  // TODO: handle extended configs not in our in-memory cache: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/826
                  // Currently, if the users TSConfig extends some arbitrary JSON file, we will fail to load/parse the TSConfig.
                  this.#logger.warn(
                    `Failed to parse TSConfig "${configFile.uri}" - could not load extended config "${filePath}". Only files containing "tsconfig" or "jsconfig" in their name are supported currently.`,
                  );
                  return undefined;
                },
                fileExists: (filePath) => Boolean(repository.getFile(URI.parse(filePath))),
                readDirectory: () => [], // Not needed for config parsing
                useCaseSensitiveFileNames: true,
              },
              dirname(fsPath),
            );

            return parsed ? [fsPath, parsed] : null;
          } catch (error) {
            this.#logger.warn(`Failed to parse TSConfig "${configFile.uri}"`, error);
            // Continue with other configs, this is a "best effort" process
            return null;
          }
        })
        .filter((entry): entry is [ConfigFsPath, ts.ParsedCommandLine] => entry !== null),
    );
  }

  #buildConfigCache(configs: ParsedConfigs): ConfigLookupCache {
    const cache: ConfigLookupCache = {
      exactMatches: new Map(),
      wildcardDirs: [],
    };

    for (const [fsPath, config] of configs.entries()) {
      for (const fileName of config.fileNames) {
        cache.exactMatches.set(fileName, config);
      }

      if (config.wildcardDirectories) {
        const allowJs =
          Boolean(config.options.allowJs) ||
          // jsconfig.json do not specify `allowJs`, this property is always implied to be true. So we explicitly set it here to simplify matching
          (fsPath.toLowerCase().includes('jsconfig') ?? false);

        cache.wildcardDirs.push(
          ...Object.keys(config.wildcardDirectories).map((dir) => ({ dir, config, allowJs })),
        );
      }
    }

    // Sort wildcardDirs by length descending for most specific match first
    cache.wildcardDirs.sort((a, b) => b.dir.length - a.dir.length);

    return cache;
  }

  async findApplicableConfig(
    filePath: string,
    repository: Repository,
  ): Promise<ts.ParsedCommandLine | null> {
    if (!this.#configCache.has(repository.uri)) {
      this.#configCache.set(repository.uri, this.#parseAllConfigsInRepository(repository));
    }

    const repoCache = await this.#configCache.get(repository.uri);
    if (!repoCache) return null;

    const { fsPath } = URI.parse(filePath);

    if (repoCache.exactMatches.has(fsPath)) {
      return repoCache.exactMatches.get(fsPath) ?? null;
    }

    const ext = fsPath.slice(fsPath.lastIndexOf('.'));
    if (!ext) {
      // extensionless files don't match any tsconfig or jsconfig.
      return null;
    }

    // Check wildcard directories - sorted by longest (most specific) first
    for (const { dir, config, allowJs } of repoCache.wildcardDirs) {
      if (fsPath.startsWith(dir)) {
        // We found a matching directory - check if the extension is supported by this config
        const isValidExtension =
          this.#TS_EXTENSIONS.has(ext) || (allowJs && this.#JS_AND_FRAMEWORK_EXTENSIONS.has(ext));

        if (isValidExtension) {
          return config;
        }

        // We found a matching directory but extension isn't valid
        // No need to check other directories since they would use the same allowJs setting
        return null;
      }
    }

    return null;
  }
}
