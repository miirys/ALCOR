import { z } from 'zod';
import { err, ok, Result } from 'neverthrow';
import { doNotAwait, DefaultSimpleApiClient, checkToken } from '@gitlab-org/core';
import { DefaultLogger, Logger } from '@gitlab-org/logging';
import { DefaultPersistentStorage, PersistentStorage } from '@gitlab-org/persistent-storage';
import { LsFetch } from '@gitlab-org/fetch';
import { Fetch } from '@gitlab-org/fetch/node';
import { isGlab, ConfigurationModel, ConfigurationAppController } from '@gitlab-org/tui';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ParsedCliInput } from '../../parse';
import type { ExitHandler } from '../../utils/exit';
import { DefaultLogLevelProvider } from '../log/cli_log_level_provider';
import { CliFileLogWriter } from '../log/cli_file_log_writer';
import { CONFIG_FIELD_METADATA } from './config_metadata';

const duoConfigurationSchema = z.object({
  gitlabBaseUrl: z.string().optional(),
  gitlabAuthToken: z.string().optional(),
});

type DuoConfigurationStorageModel = z.infer<typeof duoConfigurationSchema>;

export type DuoConfiguration = Required<DuoConfigurationStorageModel>;

const DUO_CLI_CONFIG_KEY = 'duo-cli-config';

type CliConfigOverrides = Partial<DuoConfiguration> & { cwd?: string };

export interface ConfigurationController extends ConfigurationAppController {
  initialize(): Promise<void>;
  getDuoConfiguration(): DuoConfiguration;
  isMissingConfiguration(): boolean;
  getConfigurationModel(): ConfigurationModel;
  setExitHandler(handler: ExitHandler): void;
}

export const ConfigurationController =
  createInterfaceId<ConfigurationController>('ConfigurationController');

@Injectable(ConfigurationController, [ParsedCliInput, PersistentStorage, Logger, LsFetch])
export class DefaultConfigurationController implements ConfigurationController {
  #duoConfiguration: CliConfigOverrides;

  #persistentStorage: PersistentStorage;

  #logger: Logger;

  #lsFetch: LsFetch;

  #exitHandler?: ExitHandler;

  constructor(
    duoConfiguration: CliConfigOverrides,
    storage: PersistentStorage,
    logger: Logger,
    lsFetch: LsFetch,
  ) {
    this.#duoConfiguration = duoConfiguration;
    this.#logger = logger;
    this.#persistentStorage = storage;
    this.#lsFetch = lsFetch;
  }

  setExitHandler(handler: ExitHandler): void {
    this.#exitHandler = handler;
  }

  async saveConfig(configurationModel: ConfigurationModel): Promise<Result<void, Error>> {
    try {
      const { configurationEntries } = configurationModel;

      const newDuoConfiguration: DuoConfiguration = {
        gitlabAuthToken: '',
        gitlabBaseUrl: '',
      };

      for (const entry of configurationEntries) {
        const key = entry.key as keyof DuoConfiguration;
        if (key in newDuoConfiguration) {
          newDuoConfiguration[key] = entry.value;
        }
      }

      this.#duoConfiguration = newDuoConfiguration;
      await this.#persistentStorage.set(DUO_CLI_CONFIG_KEY, newDuoConfiguration);
      return ok();
    } catch (error) {
      this.#logger.error('Failed to save configuration:', error);
      return err(error as Error);
    }
  }

  async validateToken(baseUrl: string, token: string): Promise<Result<void, Error>> {
    try {
      const simpleClient = new DefaultSimpleApiClient(
        this.#logger,
        this.#lsFetch,
        undefined,
        baseUrl,
        token,
      );
      const response = await checkToken(simpleClient, token);
      if (response.valid) {
        return ok();
      }
      return err(new Error(response.message));
    } catch (error) {
      this.#logger.error('Token validation request failed:', error as Error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  exit(): void {
    if (this.#exitHandler) {
      doNotAwait(this.#exitHandler.exit(0));
    } else {
      process.exit(0);
    }
  }

  getDuoConfiguration(): DuoConfiguration {
    return {
      gitlabBaseUrl: this.#duoConfiguration.gitlabBaseUrl || 'https://gitlab.com',
      gitlabAuthToken: this.#duoConfiguration.gitlabAuthToken || '',
    };
  }

  async initialize() {
    if (isGlab()) {
      // Under glab distribution, skip loading the entire config file.
      // glab manages credentials via its credential helper and base URL via its own config.
      this.#logger.debug('Skipping config file loading under glab distribution');
      return;
    }

    const duoCliConfig = await this.#persistentStorage.get(DUO_CLI_CONFIG_KEY);
    const parsedConfig = duoConfigurationSchema.safeParse(duoCliConfig);

    if (parsedConfig.success) {
      const cliArgOverrides = this.#filterValidArgOverrides(this.#duoConfiguration);
      this.#duoConfiguration = {
        ...parsedConfig.data,
        ...cliArgOverrides,
      };
    }
  }

  isMissingConfiguration() {
    const { gitlabAuthToken, gitlabBaseUrl } = this.getDuoConfiguration();
    return !gitlabAuthToken || !gitlabBaseUrl;
  }

  getConfigurationModel(): ConfigurationModel {
    return {
      configurationEntries: [
        {
          key: 'gitlabBaseUrl',
          value: this.#duoConfiguration.gitlabBaseUrl ?? '',
          ...CONFIG_FIELD_METADATA.gitlabBaseUrl,
        },
        {
          key: 'gitlabAuthToken',
          value: this.#duoConfiguration.gitlabAuthToken ?? '',
          ...CONFIG_FIELD_METADATA.gitlabAuthToken,
        },
      ],
      configFilePath: this.#persistentStorage.getStoragePath(),
    };
  }

  #filterValidArgOverrides(config: CliConfigOverrides): CliConfigOverrides {
    return Object.fromEntries(
      Object.entries(config).filter(([, value]) => value != null && value !== ''),
    );
  }
}

/**
 * This factory method should be used to get an instance of ConfigurationController
 * for the `config edit` command (outside of DI).
 *
 * @param programConfigOverrides - command args/env vars to override stored configuration
 * @returns A promise that resolves to a ConfigurationController instance.
 */
export const getDefaultConfigurationController = async (
  programConfigOverrides: CliConfigOverrides = {},
) => {
  const logWriter = new CliFileLogWriter();
  const logLevelProvider = new DefaultLogLevelProvider('info');
  const logger = new DefaultLogger(logWriter, logLevelProvider);

  const storage = new DefaultPersistentStorage(logger);

  const lsFetch = new Fetch(logger);
  await lsFetch.initialize();

  const controller = new DefaultConfigurationController(
    programConfigOverrides,
    storage,
    logger,
    lsFetch,
  );
  await controller.initialize();
  return controller;
};
