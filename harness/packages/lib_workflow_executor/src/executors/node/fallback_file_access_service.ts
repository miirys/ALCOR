import { FileAccessService } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import { sortBy } from 'lodash-es';
import { DocumentUri, TextEdit } from 'vscode-languageserver-protocol';

/**
 * Generic utility function that tries a sequence of async functions in order
 * and returns the first successful result or throws the last error
 * @param fns Array of async functions to try
 * @param args Arguments to pass to each function
 * @returns Result from the first successful function
 * @throws Last error encountered if all functions fail
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fallback<T, F extends (...args: any[]) => Promise<T>>(
  logger: Logger,
  fns: F[],
  ...args: Parameters<F>
): Promise<T> {
  if (fns.length === 0) {
    throw new Error('No functions provided');
  }

  let lastError: Error | null = null;

  for (const fn of fns) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn(...args);
    } catch (error) {
      logger.debug(
        `failed to call function ${fn?.name ?? 'unknown'}, will try to fall back`,
        error,
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('All functions failed');
}

export type FallbackFileAccessService = Omit<FileAccessService, 'priority'>;

export const FallbackFileAccessService = createInterfaceId<FallbackFileAccessService>(
  'FallbackFileAccessService',
);

@Injectable(FallbackFileAccessService, [Logger, collection(FileAccessService)])
export class DefaultFallbackFileAccessService implements FallbackFileAccessService {
  #logger: Logger;

  #services: FileAccessService[];

  constructor(logger: Logger, services: FileAccessService[]) {
    this.#logger = withPrefix(logger, '[FallbackFileAccessService]');
    this.#services = sortBy(services, (s) => s.priority).reverse();
  }

  getText(uri: DocumentUri): Promise<string> {
    return fallback(
      this.#logger,
      this.#services.map((s) => s.getText.bind(s)),
      uri,
    );
  }

  updateFile(uri: DocumentUri, textEdits: TextEdit[]): Promise<void> {
    return fallback(
      this.#logger,
      this.#services.map((s) => s.updateFile.bind(s)),
      uri,
      textEdits,
    );
  }

  writeFile(uri: DocumentUri, newContent: string): Promise<void> {
    return fallback(
      this.#logger,
      this.#services.map((s) => s.writeFile.bind(s)),
      uri,
      newContent,
    );
  }

  realPath(uri: DocumentUri): Promise<string> {
    return fallback(
      this.#logger,
      this.#services.map((s) => s.realPath.bind(s)),
      uri,
    );
  }
}
