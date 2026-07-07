import path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FsClient } from '../../../../../../../services/fs/fs';
import { TRACKED_EXTENSIONS } from '../../../utils';
import { JavascriptImportStore } from '../../javascript_import_store';
import {
  AbstractJavaScriptImportFilePathResolver,
  JavaScriptImportFilePathResolver,
  type ModuleResolutionContext,
} from './index';

type GetFileFn = (fsPath: string) => string | null | Promise<string | null>;

@Injectable(JavaScriptImportFilePathResolver, [Logger, JavascriptImportStore, FsClient])
export class RelativeJavaScriptFilePathResolver extends AbstractJavaScriptImportFilePathResolver {
  readonly #logger: Logger;

  readonly #importStore: JavascriptImportStore;

  readonly #fsClient: FsClient;

  constructor(logger: Logger, importStore: JavascriptImportStore, fsClient: FsClient) {
    super();
    this.#logger = withPrefix(logger, '[RelativeJavaScriptFilePathResolver]');
    this.#importStore = importStore;
    this.#fsClient = fsClient;
  }

  canResolve(importPath: string): boolean {
    return this.isRelativePath(importPath);
  }

  async resolveImportPath(resolveContext: ModuleResolutionContext): Promise<URI | null> {
    const { importPath, sourceDocumentUri, sourceDocumentContext } = resolveContext;

    if (!sourceDocumentContext.workspaceFolder) {
      return null;
    }

    const basePath = path.dirname(sourceDocumentUri.fsPath);
    const resolvedPath = await this.#resolveRelativeModulePath({
      directory: basePath,
      moduleName: importPath,
      workspaceFolder: sourceDocumentContext.workspaceFolder,
    });

    if (resolvedPath) {
      return URI.file(resolvedPath);
    }

    return null;
  }

  async #resolveRelativeModulePath({
    directory,
    moduleName,
    workspaceFolder,
  }: {
    directory: string;
    moduleName: string;
    workspaceFolder: WorkspaceFolder;
  }): Promise<string | null> {
    // First try resolving using the store - this is synchronous
    const storeGetFile = (fsPath: string) => this.#importStore.getFile(fsPath, workspaceFolder);
    const storeResult = await this.#resolveRelativeModule({
      directory,
      moduleName,
      getFile: storeGetFile,
    });

    if (storeResult) {
      return storeResult;
    }

    // If not found in store, try file system
    return this.#resolveRelativeModule({
      directory,
      moduleName,
      getFile: async (fsPath: string) => this.#resolveWithFileSystem(fsPath),
    });
  }

  async #resolveWithFileSystem(fsPath: string): Promise<string | null> {
    try {
      const stats = await this.#fsClient.promises.stat(fsPath);
      if (stats.isFile()) {
        return fsPath;
      }
      // Don't return directory paths, let the caller handle directory resolution
      return null;
    } catch (error) {
      this.#logger.debug(`Error checking file system for ${fsPath}: ${error}`);
      return null;
    }
  }

  /**
   * Checks if the module name represents a directory import
   * Examples: ".", "./", "..", "../", "../../", etc.
   */
  #isDirectoryImport(moduleName: string): boolean {
    if (moduleName === '.' || moduleName === './') {
      return true;
    }

    // Handle parent directory traversal with any number of ../
    // Examples: .., ../, ../../, ../../../, etc.
    if (moduleName === '..' || /^(?:\.\.\/)+$/.test(moduleName) || /^(?:\.\.)+$/.test(moduleName)) {
      return true;
    }

    return false;
  }

  /**
   * Resolves an index file in a directory
   * Tries index with each tracked extension
   */
  async #resolveIndexFile(dirPath: string, getFile: GetFileFn): Promise<string | null> {
    const indexPath = path.join(dirPath, 'index');

    // First try without extension (handles .ts/.js)
    const jsMatch = await getFile(indexPath);
    if (jsMatch) {
      return jsMatch;
    }

    // Then try with each extension
    try {
      const promises = Array.from(TRACKED_EXTENSIONS).map(async (ext) => {
        const result = await getFile(indexPath + ext);
        if (result) {
          return result;
        }
        throw new Error('Not found');
      });
      return await Promise.any(promises);
    } catch {
      // If all promises are rejected (no matching files found), return null
      return null;
    }
  }

  /**
   * Main relative module resolution algorithm.
   * Follows Node.js-like resolution with TypeScript/JavaScript specific handling.
   */
  async #resolveRelativeModule({
    directory,
    moduleName,
    getFile,
  }: {
    directory: string;
    moduleName: string;
    getFile: GetFileFn;
  }): Promise<string | null> {
    const absolutePath = path.resolve(directory, moduleName);

    // Special handling for directory imports (".", "..", "./", "../")
    if (this.#isDirectoryImport(moduleName)) {
      return this.#resolveIndexFile(absolutePath, getFile);
    }

    // First try exact match (handles .vue, .svelte and exact .ts/.js paths)
    const exactMatch = await getFile(absolutePath);
    if (exactMatch) {
      return exactMatch;
    }

    // If no exact match and it already has an extension, we're done
    if (path.extname(absolutePath)) {
      return null;
    }

    // No extension provided, try without extension first (for .ts/.js files)
    const jsMatch = await getFile(absolutePath);
    if (jsMatch) {
      return jsMatch;
    }

    // Try with each tracked extension
    try {
      const promises = Array.from(TRACKED_EXTENSIONS).map(async (ext) => {
        const result = await getFile(absolutePath + ext);
        if (result) {
          return result;
        }
        throw new Error('Not found');
      });
      const result = await Promise.any(promises);
      if (result) {
        return result;
      }
    } catch {
      // If all promises are rejected (no matching files found), try as directory
      return this.#resolveIndexFile(absolutePath, getFile);
    }

    return null;
  }
}
