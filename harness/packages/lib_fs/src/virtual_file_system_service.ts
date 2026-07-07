import { createInterfaceId } from '@gitlab/needle';
import { FileEvent, WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';

export type WorkspaceFileUpdate = {
  fileEvent: FileEvent;
  workspaceFolder: WorkspaceFolder;
};
export type WorkspaceFilesUpdate = {
  files: URI[];
  workspaceFolder: WorkspaceFolder;
};

/**
 * Events emitted by the `VirtualFileSystemService`.
 * TODO: potentially make these separate event emitters to subscribe to individually
 */
export enum VirtualFileSystemEvents {
  /**
   * Emitted when a single file is added, changed, or deleted in a workspace folder.
   */
  WorkspaceFileEvent = 'workspaceFileEvent',
  /**
   * Emitted when multiple files are added, changed, or deleted in a workspace folder.
   * This will happen when a workspace folder is initialized via a config change.
   * Under the hood, this uses the `DirectoryWalker` to find all files in the workspace folder.
   */
  WorkspaceFilesEvent = 'workspaceFilesEvent',
}

export const FILE_SYSTEM_EVENT_NAME = 'fileSystemEvent';

export interface FileSystemEventMap {
  [VirtualFileSystemEvents.WorkspaceFileEvent]: WorkspaceFileUpdate;
  [VirtualFileSystemEvents.WorkspaceFilesEvent]: WorkspaceFilesUpdate;
}

export interface FileSystemEventListener {
  <T extends VirtualFileSystemEvents>(eventType: T, data: FileSystemEventMap[T]): void;
}

export interface VirtualFileSystemService {
  onFileSystemEvent(listener: FileSystemEventListener): { dispose(): void };
  setup(): Promise<void>;
}

export const VirtualFileSystemService = createInterfaceId<VirtualFileSystemService>(
  'VirtualFileSystemService',
);
