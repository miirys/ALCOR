import { join, dirname } from 'path';
import { mkdirSync, existsSync, writeFileSync, accessSync, constants, promises as fs } from 'fs';
import { homedir } from 'node:os';
import * as lockfile from 'proper-lockfile';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';

export interface PersistentStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  close(): void;
  isInitialized(): boolean;
  getStoragePath(): string;
}

export const PersistentStorage = createInterfaceId<PersistentStorage>('PersistentStorage');

interface StorageData {
  [key: string]: unknown;
}

@Injectable(PersistentStorage, [Logger])
export class DefaultPersistentStorage implements PersistentStorage {
  readonly #storagePath!: string;

  #logger: Logger;

  #state?: { status: 'initialized' } | { status: 'failed'; error: Error } | { status: 'closed' };

  constructor(logger: Logger, storagePath?: string) {
    this.#logger = withPrefix(logger, '[PersistentStorage]');

    try {
      if (storagePath) {
        this.#storagePath = storagePath;
      } else {
        const baseDir = process.env.GITLAB_LSP_STORAGE_DIR || homedir();
        this.#storagePath = join(baseDir, '.gitlab', 'storage.json');
      }

      this.#logger.info(`Initializing storage at: ${this.#storagePath}`);
      this.#initialize();
    } catch (error) {
      this.#logger.error('Failed to construct PersistentStorage:', error);
      this.#state = { status: 'failed', error: error as Error };
    }
  }

  #initialize(): void {
    try {
      const dir = dirname(this.#storagePath);
      this.#logger.debug(`Creating directory: ${dir}`);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.#logger.debug(`Directory created: ${dir}`);
      }

      try {
        accessSync(dir, constants.W_OK);
      } catch (err) {
        const error = new Error(`Cannot write to directory: ${dir}`);
        this.#logger.error('Directory write permission error:', err);
        throw error;
      }

      // Initialize the file if it doesn't exist
      if (!existsSync(this.#storagePath)) {
        this.#logger.debug('Creating initial storage file');
        writeFileSync(this.#storagePath, JSON.stringify({}), {
          encoding: 'utf8',
          // NOTE: Windows will use 0o666 mode.
          mode: 0o600,
        });
        this.#logger.debug('Set file permissions to 0600 (owner read/write only)');
      } else {
        // Verify we can read and write
        try {
          // eslint-disable-next-line no-bitwise
          accessSync(this.#storagePath, constants.R_OK | constants.W_OK);
          this.#logger.debug('Storage file is accessible');
        } catch (err) {
          const error = new Error(`Cannot access storage file: ${this.#storagePath}`);
          this.#logger.error('Storage access error:', err);
          throw error;
        }
      }

      this.#state = { status: 'initialized' };
      this.#logger.info('Persistent storage initialized successfully');
    } catch (error) {
      this.#state = { status: 'failed', error: error as Error };
      this.#logger.error('Failed to initialize persistent storage', error);
    }
  }

  isInitialized(): boolean {
    return this.#state?.status === 'initialized';
  }

  getStoragePath(): string {
    return this.#storagePath;
  }

  async #readStorage(): Promise<StorageData> {
    try {
      const content = await fs.readFile(this.#storagePath, 'utf8');
      return JSON.parse(content) as StorageData;
    } catch (error) {
      this.#logger.error('Failed to read storage file, recreating with empty data', error);
      try {
        // Remove corrupted file if it exists
        if (existsSync(this.#storagePath)) {
          await fs.unlink(this.#storagePath);
          this.#logger.info('Corrupted storage file removed');
        }

        // Recreate the file with empty data
        const emptyData = {};
        await fs.writeFile(this.#storagePath, JSON.stringify(emptyData, null, 2), {
          encoding: 'utf8',
          // NOTE: Windows will use 0o666 mode.
          mode: 0o600,
        });
        this.#logger.info('Storage file recreated with empty data and restrictive permissions');

        return emptyData;
      } catch (recreateError) {
        this.#logger.error('Failed to recreate storage file', recreateError);
        return {};
      }
    }
  }

  async #writeStorage(data: StorageData): Promise<void> {
    try {
      await fs.writeFile(this.#storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      this.#logger.error('Failed to write storage file', error);
      throw error;
    }
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    let releaseLock: (() => Promise<void>) | null = null;

    try {
      // Ensure the file exists before trying to lock it
      if (!existsSync(this.#storagePath)) {
        this.#logger.debug('Storage file does not exist, creating it before locking');
        await fs.writeFile(this.#storagePath, JSON.stringify({}), {
          encoding: 'utf8',
          // NOTE: Windows will use 0o666 mode.
          mode: 0o600,
        });
      }

      // Acquire lock with timeout
      releaseLock = await lockfile.lock(this.#storagePath, {
        retries: {
          retries: 5,
          minTimeout: 100,
          maxTimeout: 1000,
        },
        stale: 5000, // Consider lock stale after 5 seconds
      });

      // Perform the operation
      return await operation();
    } catch (error) {
      this.#logger.error('Lock operation failed', error);
      throw error;
    } finally {
      // Always release the lock
      if (releaseLock) {
        try {
          await releaseLock();
        } catch (error) {
          this.#logger.error('Failed to release lock', error);
        }
      }
    }
  }

  async get(key: string): Promise<unknown> {
    try {
      if (!this.isInitialized()) {
        this.#logger.error(
          `Storage is not initialized: ${(this.#state?.status === 'failed' && this.#state.error.message) || 'unknown error'}`,
        );
        throw new Error('Storage is not initialized');
      }

      this.#logger.debug(`Getting value for key: ${key}`);

      const data = await this.#readStorage();
      const value = data[key];

      if (value === undefined) {
        this.#logger.debug(`No value found for key: ${key}`);
        return undefined;
      }

      return value;
    } catch (error) {
      this.#logger.error(`Storage get error for key: ${key}`, error);
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Storage is not initialized');
    }

    this.#logger.debug(`Setting value for key: ${key}`);

    await this.#withLock(async () => {
      const data = await this.#readStorage();
      data[key] = value;
      await this.#writeStorage(data);
      this.#logger.debug(`Successfully set value for key: ${key}`);
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Storage is not initialized');
    }

    this.#logger.debug(`Deleting value for key: ${key}`);

    await this.#withLock(async () => {
      const data = await this.#readStorage();

      if (data[key] !== undefined) {
        delete data[key];
        await this.#writeStorage(data);
        this.#logger.debug(`Successfully deleted value for key: ${key}`);
      } else {
        this.#logger.debug(`Key not found for deletion: ${key}`);
      }
    });
  }

  close(): void {
    this.#logger.info('Storage closed');
    this.#state = { status: 'closed' };
  }
}
