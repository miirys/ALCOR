import { EventEmitter } from 'events';
import {
  DidChangeWatchedFilesNotification,
  DidChangeWatchedFilesRegistrationOptions,
  Disposable,
  FileEvent,
  WorkspaceFolder,
} from 'vscode-languageserver-protocol';
import { Injectable } from '@gitlab/needle';
import {
  FILE_SYSTEM_EVENT_NAME,
  FileSystemEventListener,
  FileSystemEventMap,
  getMatchingWorkspaceFolders,
  isFileSchemeUri,
  parseURIString,
  VirtualFileSystemEvents,
  VirtualFileSystemService,
} from '@gitlab-org/fs';
import { LsConnection } from '@gitlab-org/core';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { log } from '../../log';
import { GitLabApiClient } from '../../api';
import { DirectoryWalker } from './dir';

@Injectable(VirtualFileSystemService, [
  LsConnection,
  DirectoryWalker,
  ConfigService,
  GitLabApiClient,
])
export class DefaultVirtualFileSystemService {
  #lsConnection: LsConnection;

  #directoryWalker: DirectoryWalker;

  #configService: ConfigService;

  #api: GitLabApiClient;

  #emitter = new EventEmitter();

  #watchersDisposables?: Disposable[];

  #initializedWorkspaceFolders = new Set<string>();

  constructor(
    lsConnection: LsConnection,
    directoryWalker: DirectoryWalker,
    configService: ConfigService,
    api: GitLabApiClient,
  ) {
    this.#lsConnection = lsConnection;
    this.#directoryWalker = directoryWalker;
    this.#configService = configService;
    this.#api = api;
    this.#configService.onConfigChange(async (config) => {
      if (!this.#api.isInValidState) return;
      await this.#handleConfigChange(config);
    });
    this.#api.onApiReconfigured(async (event) => {
      if (!event.isInValidState) return;
      await this.#handleConfigChange(this.#configService.get());
    });
  }

  async #handleConfigChange(config: ClientConfig) {
    const workspaceFolders = config.workspaceFolders ?? [];

    const workspaceFolderFileEmits = workspaceFolders
      .filter((folder) => !this.#initializedWorkspaceFolders.has(folder.uri))
      .map((folder) => {
        this.#initializedWorkspaceFolders.add(folder.uri);
        return folder;
      })
      .map(async (folder) => {
        return this.emitFilesForWorkspace(folder);
      });

    const configFolders = new Set(workspaceFolders.map((wf) => wf.uri));
    for (const uri of this.#initializedWorkspaceFolders) {
      if (!configFolders.has(uri)) {
        // URI has previously been initialized but is not in the latest clientConfig - so removed from workspace.
        // Remove it from set to ensure it will be initialized if it is re-added to workspace
        this.#initializedWorkspaceFolders.delete(uri);
        // Emit an empty WorkspaceFilesEvent so downstream caches can clean up the removed folder
        this.#emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, {
          files: [],
          workspaceFolder: { uri, name: uri },
        });
      }
    }

    await Promise.all(workspaceFolderFileEmits);
  }

  #handleFileEvent(event: FileEvent) {
    const workspaceFolders = this.#configService.get('workspaceFolders') ?? [];
    const matchingWorkspaceFolders = getMatchingWorkspaceFolders(event.uri, workspaceFolders);
    for (const workspaceFolder of matchingWorkspaceFolders) {
      this.#emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFileEvent, {
        fileEvent: event,
        workspaceFolder,
      });
    }
  }

  async setup() {
    await this.#registerWatchers();
  }

  /**
   * Emits a workspace files update event for the given workspace folder.
   * This is used to notify consumers of the virtual file system that the files in the workspace have changed.
   *
   * For virtual filesystem workspaces (non-`file://` URI schemes such as `adt://` or
   * `semanticfs://`), local directory walking is skipped. The IDE delivers file change
   * events via LSP `textDocument/didOpen` and `workspace/didChangeWatchedFiles`
   * notifications, so no initial enumeration is needed.
   */
  async emitFilesForWorkspace(workspaceFolder: WorkspaceFolder): Promise<void> {
    if (!isFileSchemeUri(workspaceFolder.uri)) {
      log.info(
        `[VirtualFileSystemService] Skipping directory walk for virtual filesystem workspace: ${workspaceFolder.uri}`,
      );
      // Emit an empty files event so downstream consumers know the workspace is initialized.
      this.#emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        files: [],
        workspaceFolder,
      });
      return;
    }

    try {
      log.info(`[VirtualFileSystemService] Emitting files for workspace ${workspaceFolder.uri}`);
      const files = await this.#directoryWalker.findFilesForDirectory({
        directoryUri: parseURIString(workspaceFolder.uri),
      });
      this.#emitFileSystemEvent(VirtualFileSystemEvents.WorkspaceFilesEvent, {
        files,
        workspaceFolder,
      });
    } catch (error) {
      log.info(`Failed to emit files for workspace ${workspaceFolder.uri}`, error);
    }
  }

  /**
   * Registers watchers for the workspace folders.
   * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didChangeWatchedFiles
   */
  async #registerWatchers() {
    if (this.#watchersDisposables) {
      this.#watchersDisposables.forEach((disposable) => disposable.dispose());
    }
    log.info('[VirtualFileSystemService] Registering watchers');
    try {
      this.#watchersDisposables = [
        await this.#lsConnection.client.register(DidChangeWatchedFilesNotification.type, {
          watchers: [
            {
              globPattern: '**/*',
            },
          ],
        } satisfies DidChangeWatchedFilesRegistrationOptions),
        this.#lsConnection.onDidChangeWatchedFiles(({ changes }) => {
          for (const change of changes) {
            this.#handleFileEvent(change);
          }
        }),
      ];
    } catch (error) {
      log.info(`Failed to register watcher for workspaces`, error);
    }
  }

  #emitFileSystemEvent<T extends VirtualFileSystemEvents>(
    eventType: T,
    data: FileSystemEventMap[T],
  ) {
    this.#emitter.emit(FILE_SYSTEM_EVENT_NAME, eventType, data);
  }

  /**
   * Adds a listener for the file system event.
   * This can be of type `WorkspaceFileUpdate` or `WorkspaceFilesUpdate`.
   *
   * @param listener - The listener to add.
   * @returns A disposable object that can be used to remove the listener.
   */
  onFileSystemEvent(listener: FileSystemEventListener) {
    this.#emitter.on(FILE_SYSTEM_EVENT_NAME, listener);
    return {
      dispose: () => this.#emitter.removeListener(FILE_SYSTEM_EVENT_NAME, listener),
    };
  }
}
