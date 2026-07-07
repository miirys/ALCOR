import { errAsync, okAsync } from 'neverthrow';
import { z } from 'zod';
import { AuthStorage, StorageKind } from '../types';
import { StorageError } from '../errors';

// A lightweight, schema-driven in-memory storage.
// Not decorated with @Service directly since we’ll supply schema via DI factories.
export class MemoryAuthStorage<T> implements AuthStorage<T> {
  #byServer = new Map<string, T>();

  #schema: z.ZodType<T>;

  #storageType: StorageKind;

  constructor(schema: z.ZodType<T>, storageType: StorageKind) {
    this.#schema = schema;
    this.#storageType = storageType;
  }

  store(serverName: string, data: T) {
    try {
      const parsed = this.#schema.safeParse(data);
      if (!parsed.success) {
        return errAsync(StorageError.validation(serverName, this.#storageType, parsed.error));
      }
      this.#byServer.set(serverName, { ...parsed.data });
      return okAsync(undefined);
    } catch (cause) {
      return errAsync(StorageError.io(serverName, this.#storageType, cause));
    }
  }

  load(serverName: string) {
    try {
      const val = this.#byServer.get(serverName);
      if (!val) {
        return errAsync(StorageError.notFound(serverName, this.#storageType));
      }
      return okAsync({ ...(val as T) });
    } catch (cause) {
      return errAsync(StorageError.io(serverName, this.#storageType, cause));
    }
  }

  clear(serverName: string) {
    try {
      this.#byServer.delete(serverName);
      return okAsync(undefined);
    } catch (cause) {
      return errAsync(StorageError.io(serverName, this.#storageType, cause));
    }
  }
}
