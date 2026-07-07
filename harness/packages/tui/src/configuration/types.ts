import { Result } from 'neverthrow';

export interface ConfigurationModel {
  configurationEntries: ConfigurationEntry[];
  configFilePath?: string;
}

export interface ConfigurationEntry {
  key: string;
  value: string;
  displayName: string;
  description: string;
  defaultValue: string;
  isSensitive: boolean;
}

export interface ConfigurationAppController {
  exit(): void;
  saveConfig(configurationModel: ConfigurationModel): Promise<Result<void, Error>>;
  validateToken(baseUrl: string, token: string): Promise<Result<void, Error>>;
}
