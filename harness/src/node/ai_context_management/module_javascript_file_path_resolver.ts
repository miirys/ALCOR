import { dirname } from 'path';
import { type FileSystem, type ResolveOptions, ResolverFactory } from 'enhanced-resolve';
import uniq from 'lodash/uniq';
import mergeWith from 'lodash/mergeWith';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import builtinModules from 'builtin-modules';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RepositoryService, type Repository } from '@gitlab-org/repositories';
import {
  type IDocContext,
  FsClient,
  callbackify,
  TRACKED_EXTENSIONS,
  JavascriptImportStore,
  TsConfigStore,
  AbstractJavaScriptImportFilePathResolver,
  JavaScriptImportFilePathResolver,
} from '@gitlab-org/legacy-common';

type EcmaScriptResolveContext = {
  importPath: string;
  sourceDocumentContext: IDocContext;
  sourceDocumentUri: URI;
};

@Injectable(JavaScriptImportFilePathResolver, [
  Logger,
  FsClient,
  JavascriptImportStore,
  TsConfigStore,
  RepositoryService,
])
export class ModuleJavaScriptFilePathResolver extends AbstractJavaScriptImportFilePathResolver {
  readonly #logger: Logger;

  readonly #resolverOptions: ResolveOptions;

  readonly #importStore: JavascriptImportStore;

  readonly #tsConfigStore: TsConfigStore;

  readonly #repositoryService: RepositoryService;

  constructor(
    logger: Logger,
    fsClient: FsClient,
    importStore: JavascriptImportStore,
    tsConfigStore: TsConfigStore,
    repositoryService: RepositoryService,
  ) {
    super();
    this.#logger = withPrefix(logger, '[ModuleJavaScriptFilePathResolver]');
    this.#importStore = importStore;
    this.#tsConfigStore = tsConfigStore;
    this.#repositoryService = repositoryService;

    this.#resolverOptions = {
      fileSystem: {
        readFile: callbackify((path: string) =>
          fsClient.promises.readFile(path).then((data) => Buffer.from(data)),
        ),
        readdir: callbackify((path: string) => fsClient.promises.readdir(path)),
        readlink: callbackify((path: string) => {
          if (!fsClient.promises.readlink) {
            throw new Error('EcmaScriptModuleResolver: readlink is not defined');
          }
          return fsClient.promises.readlink(path);
        }),
        stat: callbackify((path: string) => fsClient.promises.stat(path)),
        lstat: callbackify((path: string) => fsClient.promises.lstat(path)),
      } as unknown as FileSystem,

      // Since built-in NodeJS modules (`fs`, `path` etc) do not correspond to an actual file on disk, there is nothing we can resolve to.
      // So instead we do a "best effort" resolution by aliasing all built-in modules to their `@types/node` definition. While there is
      // no guarantee that the users project will contain this dependency, there is a good chance it will exist, and will provide accurate
      // context for our code suggestions if we DO manage to resolve to it.
      alias: builtinModules
        .filter((nodeBuiltInModule) => !nodeBuiltInModule.startsWith('node:'))
        .map((nodeBuiltInModule) => [
          { name: nodeBuiltInModule, alias: [`@types/node/${nodeBuiltInModule}.d.ts`] },
          { name: `node:${nodeBuiltInModule}`, alias: [`@types/node/${nodeBuiltInModule}.d.ts`] },
        ])
        .flat(),

      extensions: uniq([
        // Order of extensions matters. Resolve TS over JS, as it will provider better code suggestions context
        '.d.ts',
        '.ts',
        '.tsx',
        ...TRACKED_EXTENSIONS.values(),
      ]),
      mainFields: ['types', 'typings', 'main'],
      conditionNames: ['types', 'import', 'require'],
    };
  }

  canResolve(importPath: string): boolean {
    return !this.isRelativePath(importPath);
  }

  async resolveImportPath(context: EcmaScriptResolveContext): Promise<URI | null> {
    const { importPath, sourceDocumentContext } = context;

    if (!sourceDocumentContext.workspaceFolder) {
      return null;
    }

    const cachedResult = this.#importStore.getResolvedModule(
      sourceDocumentContext.workspaceFolder.uri,
      importPath,
    );
    if (cachedResult) {
      return cachedResult;
    }

    const repo = await this.#getRepositoryForContext(context);
    const tsConfig =
      repo &&
      (await this.#tsConfigStore.findApplicableConfig(context.sourceDocumentContext.uri, repo));

    const result = await this.#resolveWithEnhancedResolve(context, tsConfig ?? null);
    if (result) {
      this.#importStore.setResolvedModule(
        sourceDocumentContext.workspaceFolder.uri,
        importPath,
        result,
      );
    }

    return result;
  }

  async #resolveWithEnhancedResolve(
    context: EcmaScriptResolveContext,
    tsConfig: ts.ParsedCommandLine | null,
  ): Promise<URI | null> {
    const mergedResolverOptions = mergeWith(
      {},
      this.#resolverOptions,
      this.#mapTsConfigToResolverConfig(tsConfig),
      (objValue: unknown, srcValue: unknown) => {
        if (Array.isArray(objValue)) {
          return objValue.concat(srcValue);
        }
        return undefined;
      },
    );

    const jsModuleResolver = ResolverFactory.createResolver(mergedResolverOptions);

    const lookupStartPath = URI.parse(dirname(context.sourceDocumentContext.uri)).fsPath;
    const request = context.importPath;
    const resolveContext = {};
    const enhancedResolveContext = {};

    return new Promise<URI | null>((resolve) => {
      jsModuleResolver.resolve(
        enhancedResolveContext,
        lookupStartPath,
        request,
        resolveContext,
        (err, filePath) => {
          if (err) {
            this.#logger.error(
              `Error from enhanced-resolve while resolving import "${context.importPath}":`,
              err,
            );
            resolve(null);
            return;
          }
          if (!filePath) {
            this.#logger.debug(
              `Import "${context.importPath}" did not resolve to a valid path. This might mean the import path is invalid or the project lacks necessary config.`,
            );
            resolve(null);
            return;
          }

          resolve(URI.file(filePath));
        },
      );
    });
  }

  async #getRepositoryForContext({
    sourceDocumentContext,
  }: EcmaScriptResolveContext): Promise<Repository | undefined> {
    if (!sourceDocumentContext.workspaceFolder) {
      return undefined;
    }

    const sourceUri = URI.parse(sourceDocumentContext.uri);
    const workspaceFolderUri = sourceDocumentContext.workspaceFolder.uri;

    return this.#repositoryService.getMatchingRepository(sourceUri, workspaceFolderUri);
  }

  /**
   * Map some tsconfig config options to the enhanced-resolve resolve options.
   * Note that this is not a spec-compliant mapping, we pick only some relevant config options to expand our resolver matches.
   * For example, we do not change support for `import` vs `require` based on the tsconfig `moduleResolution` value, we leave
   * enhanced-resolve to handle any of these. But we DO add custom path aliases so we can match custom module imports.
   */
  #mapTsConfigToResolverConfig(tsConfig: ts.ParsedCommandLine | null): Partial<ResolveOptions> {
    if (!tsConfig) return {};

    const { options } = tsConfig;
    const resolveOptions: Partial<ResolveOptions> = {};

    if (options.baseUrl) {
      // If we use a baseUrl, we should also include node_modules, otherwise enhanced-resolve will stop looking in node_modules completely
      resolveOptions.modules = ['node_modules', options.baseUrl];
    }

    if (options.paths) {
      resolveOptions.alias = Object.entries(options.paths).map(([key, value]) => {
        // TypeScript paths format:
        // "@app/*": ["src/app/*"]
        // "@lib/*": ["src/lib/*", "src/legacy/*"]
        //
        // Enhanced-resolve alias format:
        // { name: "@app", alias: ["src/app"] }
        // { name: "@lib", alias: ["src/lib", "src/legacy"] }
        return {
          name: key.replace('/*', ''),
          alias: value.map((p) => p.replace('/*', '')),
        };
      });
    }

    return resolveOptions;
  }
}
