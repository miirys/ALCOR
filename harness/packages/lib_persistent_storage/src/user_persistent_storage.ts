import { z } from 'zod';
import { ConfigService } from '@gitlab-org/config';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { UserService, withTimeout } from '@gitlab-org/core';
import { PersistentStorage } from './persistent_storage';
import { GlobalSettings, ClientSettings } from './types';
import { globalSettingSchema, clientSettingSchema } from './schemas';

const USER_RESOLVE_TIMEOUT_MS = 10_000;

export interface UserPersistentStorage {
  // Client-specific settings (VSCode/JetBrains/CLI)
  get<K extends keyof ClientSettings>(key: K): Promise<ClientSettings[K] | undefined>;
  set<K extends keyof ClientSettings>(key: K, value: ClientSettings[K]): Promise<void>;
  delete(key: keyof ClientSettings): Promise<void>;

  // Global settings (shared across all clients)
  getGlobal<K extends keyof GlobalSettings>(key: K): Promise<GlobalSettings[K] | undefined>;
  setGlobal<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): Promise<void>;
  deleteGlobal(key: keyof GlobalSettings): Promise<void>;
}

export const UserPersistentStorage =
  createInterfaceId<UserPersistentStorage>('UserPersistentStorage');

const GLOBAL_CLIENT = '__global__';

@Injectable(UserPersistentStorage, [PersistentStorage, ConfigService, UserService, Logger])
export class DefaultUserPersistentStorage implements UserPersistentStorage {
  #genericStorage: PersistentStorage;

  #configService: ConfigService;

  #userService: UserService;

  #logger: Logger;

  constructor(
    genericStorage: PersistentStorage,
    configService: ConfigService,
    userService: UserService,
    logger: Logger,
  ) {
    this.#genericStorage = genericStorage;
    this.#configService = configService;
    this.#userService = userService;
    this.#logger = withPrefix(logger, '[UserPersistentStorage]');
  }

  #validateValue(key: string, value: unknown, schema: z.ZodTypeAny): unknown {
    const result = schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    this.#logger.warn(
      `Validation failed for key: ${key} - error: ${JSON.stringify(result.error.format())}, value: ${JSON.stringify(value)}`,
    );
    return undefined;
  }

  #buildStorageKey(userId: string, client: string, key: string): string {
    return `${userId}:${client}:${key}`;
  }

  async #resolveUserId(): Promise<string | undefined> {
    try {
      const user = await withTimeout(this.#userService.getUser(), USER_RESOLVE_TIMEOUT_MS);
      return user.id;
    } catch (error) {
      this.#logger.warn('Failed to resolve user ID', error);
      return undefined;
    }
  }

  async #getValue(client: string, key: string, schema: z.ZodTypeAny): Promise<unknown> {
    try {
      const userId = await this.#resolveUserId();

      if (!userId) {
        this.#logger.warn('No user ID available');
        return undefined;
      }

      const storageKey = this.#buildStorageKey(userId, client, key);
      this.#logger.debug(`Getting value for key: ${key} - userId: ${userId}, client: ${client}`);

      const value = await this.#genericStorage.get(storageKey);

      if (value === undefined) {
        this.#logger.debug(`No value found for key: ${key}`);
        return undefined;
      }

      const validated = this.#validateValue(key, value, schema);
      if (validated === undefined) {
        this.#logger.warn(`Stored value failed validation for key: ${key}`);
      }
      return validated;
    } catch (error) {
      this.#logger.error(`Storage get error for key: ${key}`, error);
      return undefined;
    }
  }

  async #setValue(
    client: string,
    key: string,
    value: unknown,
    schema: z.ZodTypeAny,
  ): Promise<void> {
    const userId = await this.#resolveUserId();

    if (!userId) {
      this.#logger.warn('No user ID available, cannot set value');
      return;
    }

    let parsedValue;
    try {
      parsedValue = schema.parse(value);
    } catch (error) {
      this.#logger.error(`Validation failed for key: ${key}`, error);
      throw new Error(`Invalid value for key ${key}: ${error}`);
    }

    const storageKey = this.#buildStorageKey(userId, client, key);
    this.#logger.debug(`Setting value for key: ${key} - userId: ${userId}, client: ${client}`);

    await this.#genericStorage.set(storageKey, parsedValue);
    this.#logger.debug(`Successfully set value for key: ${key}`);
  }

  async #deleteValue(client: string, key: string): Promise<void> {
    const userId = await this.#resolveUserId();

    if (!userId) {
      this.#logger.warn('No user ID available, cannot delete value');
      return;
    }

    const storageKey = this.#buildStorageKey(userId, client, key);
    this.#logger.debug(`Deleting value for key: ${key} - userId: ${userId}, client: ${client}`);

    await this.#genericStorage.delete(storageKey);
    this.#logger.debug(`Successfully deleted value for key: ${key}`);
  }

  async get<K extends keyof ClientSettings>(key: K): Promise<ClientSettings[K] | undefined> {
    const client = this.#client;
    if (!client) {
      return undefined;
    }
    return (await this.#getValue(client, key, clientSettingSchema[key])) as
      | ClientSettings[K]
      | undefined;
  }

  async set<K extends keyof ClientSettings>(key: K, value: ClientSettings[K]): Promise<void> {
    const client = this.#client;
    if (!client) {
      this.#logger.warn('No client name available, cannot set value');
      return;
    }
    await this.#setValue(client, key as string, value, clientSettingSchema[key]);
  }

  async delete(key: keyof ClientSettings): Promise<void> {
    const client = this.#client;
    if (!client) {
      this.#logger.warn('No client name available, cannot delete value');
      return;
    }
    await this.#deleteValue(client, key as string);
  }

  // Global methods
  async getGlobal<K extends keyof GlobalSettings>(key: K): Promise<GlobalSettings[K] | undefined> {
    return (await this.#getValue(GLOBAL_CLIENT, key as string, globalSettingSchema[key])) as
      | GlobalSettings[K]
      | undefined;
  }

  async setGlobal<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): Promise<void> {
    return this.#setValue(GLOBAL_CLIENT, key as string, value, globalSettingSchema[key]);
  }

  async deleteGlobal(key: keyof GlobalSettings): Promise<void> {
    return this.#deleteValue(GLOBAL_CLIENT, key as string);
  }

  get #client(): string | undefined {
    const client = this.#configService.get('clientInfo.name');
    if (!client) {
      this.#logger.warn('No client name in config');
      return undefined;
    }
    return client;
  }
}
