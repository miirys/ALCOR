// eslint-disable-next-line max-classes-per-file
import { crc32 } from 'node:zlib';
import { join } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';

export class DuoFileNotReadError extends Error {
  name = 'DuoFileNotReadError';

  constructor(relativeFilePath: string) {
    super(`You must read the file "${relativeFilePath}" before modifying it.`);
  }
}

export class DuoFileModifiedSinceLastReadError extends Error {
  name = 'DuoFileModifiedSinceLastReadError';

  constructor(relativeFilePath: string) {
    super(
      `File "${relativeFilePath}" has been modified since it was last read. You must read the file again before modifying it.`,
    );
  }
}

export interface FileStateTracker {
  recordFileRead(fullFilePath: string, content: string): void;

  /** @throws DuoFileNotReadError | DuoFileModifiedSinceLastReadError if the file has been modified since Duo last read it */
  assertFileNotModifiedSinceLastRead(
    workspaceFolderPath: string,
    filePath: string,
    currentContent: string,
  ): void;
}

export const FileStateTracker = createInterfaceId<FileStateTracker>('FileStateTracker');

@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Transient,
})
@Implements(FileStateTracker)
export class DefaultFileStateTracker implements FileStateTracker {
  #fileContentHashes = new Map<string, string>();

  recordFileRead(fullFilePath: string, content: string): void {
    const contentHash = this.#generateContentHash(content);
    this.#fileContentHashes.set(fullFilePath, contentHash);
  }

  assertFileNotModifiedSinceLastRead(
    workspaceFolderPath: string,
    filePath: string,
    currentContent: string,
  ): void {
    const fullFilePath = join(workspaceFolderPath, filePath);
    const lastContentHash = this.#fileContentHashes.get(fullFilePath);

    if (lastContentHash === undefined) {
      throw new DuoFileNotReadError(filePath);
    }

    const currentContentHash = this.#generateContentHash(currentContent);
    if (currentContentHash !== lastContentHash) {
      throw new DuoFileModifiedSinceLastReadError(filePath);
    }
  }

  #generateContentHash(content: string): string {
    // Using CRC32, approx 10x faster than sha256 hashing, good enough collision resistance since this is not some important crypto scenario
    return crc32(Buffer.from(content, 'utf8')).toString(16);
  }
}
