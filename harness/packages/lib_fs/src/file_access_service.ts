import { createInterfaceId } from '@gitlab/needle';
import { TextEdit } from 'vscode-languageserver-protocol';

export const LSP_PRIORITY = 2;
export const FS_PRIORITY = 1;

export interface FileAccessService {
  readonly priority: typeof LSP_PRIORITY | typeof FS_PRIORITY;

  /** @throws FileNotFoundError if the file doesn't exist */
  getText(fullPath: string): Promise<string>;
  /** @throws FileNotFoundError if the file doesn't exist */
  updateFile(fullPath: string, textEdits: TextEdit[]): Promise<void>;
  writeFile(fullPath: string, newContent: string): Promise<void>;
  realPath(fullPath: string): Promise<string>;
}

export class FileNotFoundError extends Error {
  name = 'FileNotFoundError';

  cause: unknown;

  constructor(path: string, cause: unknown) {
    super(`File not found: ${path}`);
    this.cause = cause;
  }
}

export const FileAccessService = createInterfaceId<FileAccessService>('FileAccessService');
