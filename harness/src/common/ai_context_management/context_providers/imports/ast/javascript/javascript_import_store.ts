import path from 'path';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { FileChangeType, WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { RepositoryService } from '@gitlab-org/repositories';
import { parseURIString } from '@gitlab-org/fs';
import { STRIP_EXTENSIONS, TRACKED_EXTENSIONS } from '../utils';

export interface JavascriptImportStore extends DefaultJavascriptImportStore {}

export const JavascriptImportStore =
  createInterfaceId<JavascriptImportStore>('JavascriptImportStore');

/**
 * JavascriptImportStore is responsible for maintaining a fast lookup store of files
 * that can be imported in Javascript modules. It uses a map for maximum performance.
 *
 * Key format: "/absolute/path/to/file" -> stored without extension for .ts/.js files
 * Value format: The actual file path with extension
 */
@Injectable(JavascriptImportStore, [RepositoryService])
export class DefaultJavascriptImportStore implements JavascriptImportStore {
  // Fast lookup map: normalized path -> actual path with extension
  #filePathStore = new Map<WorkspaceFolder['uri'], Map<string, string>>();

  // Cache for resolved non-relative importPaths
  #nonRelativeModuleStore = new Map<WorkspaceFolder['uri'], Map<string, URI>>();

  #repositoryService: RepositoryService;

  #workspaceReady = new Map<WorkspaceFolder['uri'], boolean>();

  constructor(repositoryService: RepositoryService) {
    this.#repositoryService = repositoryService;
    this.#setupFileSystemListener();
  }

  #setupFileSystemListener() {
    this.#repositoryService.onFileChange((event) => {
      const fileUri = parseURIString(event.fileEvent.uri);
      const { workspaceFolder } = event;
      switch (event.fileEvent.type) {
        case FileChangeType.Created:
        case FileChangeType.Changed:
          this.#addFile(fileUri, workspaceFolder);
          break;
        case FileChangeType.Deleted:
          this.#removeFile(fileUri, workspaceFolder);
          break;
        default:
          break;
      }
    });

    this.#repositoryService.onWorkspaceRepositoriesStart((workspaceFolder) => {
      const filePathStore = this.#filePathStore.get(workspaceFolder.uri);
      if (filePathStore) {
        filePathStore.clear();
      }
      const modulePathStore = this.#nonRelativeModuleStore.get(workspaceFolder.uri);
      if (modulePathStore) {
        modulePathStore.clear();
      }
    });

    this.#repositoryService.onWorkspaceRepositoriesFinished(async (workspaceFolder) => {
      this.#filePathStore.set(workspaceFolder.uri, new Map());
      const repositories = await this.#repositoryService.getRepositoriesForWorkspace(
        workspaceFolder.uri,
      );
      for (const repository of repositories) {
        const files = repository.getFiles({
          excludeIgnored: false,
        });
        for (const file of files) {
          this.#addFile(file.uri, workspaceFolder);
        }
      }
      this.#workspaceReady.set(workspaceFolder.uri, true);
    });
  }

  #addFile(uri: URI, workspaceFolder: WorkspaceFolder) {
    const extension = path.extname(uri.fsPath);
    if (!TRACKED_EXTENSIONS.has(extension)) {
      return;
    }

    const { fsPath } = uri;
    // For TypeScript/JavaScript files, we store both with and without extension
    // This makes lookups fast as we don't need to try multiple extensions
    if (STRIP_EXTENSIONS.has(extension)) {
      const pathWithoutExt = fsPath.slice(0, -extension.length);
      this.#filePathStore.get(workspaceFolder.uri)?.set(pathWithoutExt, fsPath);
    }
    // Always store the full path too for exact matches
    this.#filePathStore.get(workspaceFolder.uri)?.set(fsPath, fsPath);
  }

  #removeFile(uri: URI, workspaceFolder: WorkspaceFolder) {
    const workspaceCache = this.#nonRelativeModuleStore.get(workspaceFolder.uri);
    if (workspaceCache) {
      for (const [key, value] of workspaceCache.entries()) {
        if (value.toString() === uri.toString()) {
          workspaceCache.delete(key);
        }
      }
    }

    const extension = path.extname(uri.fsPath);
    if (!TRACKED_EXTENSIONS.has(extension)) {
      return;
    }

    const { fsPath } = uri;
    if (STRIP_EXTENSIONS.has(extension)) {
      const pathWithoutExt = fsPath.slice(0, -extension.length);
      this.#filePathStore.get(workspaceFolder.uri)?.delete(pathWithoutExt);
    }
    this.#filePathStore.get(workspaceFolder.uri)?.delete(fsPath);
  }

  /**
   * @param fsPath - This should be the exact path
   * the caller is searching for. You should use
   * the URI `fsPath` property if possible.
   */
  getFile(fsPath: string, workspaceFolder: WorkspaceFolder): string | null {
    return this.#filePathStore.get(workspaceFolder.uri)?.get(fsPath) ?? null;
  }

  getResolvedModule(workspaceUri: string, importPath: string): URI | null {
    return this.#nonRelativeModuleStore.get(workspaceUri)?.get(importPath) ?? null;
  }

  setResolvedModule(workspaceUri: string, importPath: string, resolvedPath: URI): void {
    let moduleStore = this.#nonRelativeModuleStore.get(workspaceUri);
    if (!moduleStore) {
      moduleStore = new Map<string, URI>();
      this.#nonRelativeModuleStore.set(workspaceUri, moduleStore);
    }
    moduleStore.set(importPath, resolvedPath);
  }
}
