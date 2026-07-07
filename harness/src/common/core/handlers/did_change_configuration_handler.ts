import { NotificationHandler } from 'vscode-languageserver-protocol';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { fromError } from 'zod-validation-error';
import {
  ConfigService,
  ClientConfig,
  CodeSuggestionsConfig,
  exampleConfig,
} from '@gitlab-org/config';
import { HandlesNotification } from '../../handler';

export type ChangeConfigOptions = { settings: ClientConfig };

export interface DidChangeConfigurationHandler extends HandlesNotification<ChangeConfigOptions> {}

export const DidChangeConfigurationHandler = createInterfaceId<DidChangeConfigurationHandler>(
  'DidChangeConfigurationHandler',
);

@Injectable(DidChangeConfigurationHandler, [ConfigService, Logger])
export class DefaultDidChangeConfigurationHandler implements DidChangeConfigurationHandler {
  #configService: ConfigService;

  #logger: Logger;

  constructor(configService: ConfigService, logger: Logger) {
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[DidChangeConfiguration]');
  }

  notificationHandler: NotificationHandler<ChangeConfigOptions> = async (
    { settings }: ChangeConfigOptions = { settings: {} },
  ): Promise<void> => {
    const validationError = this.#validateConfig(settings);
    if (validationError) {
      this.#logger.error('The configuration is not valid and will be ignored', validationError);
      return;
    }

    if (this.#configService.get('token') && 'token' in settings && !settings.token) {
      this.#logger.warn('[auth]: Client has reset authentication token.');
    }
    this.#configService.merge(settings);
  };

  #validateConfig(config: ClientConfig): Error | undefined {
    // TODO: validate more configuration than just the code suggestions config
    if (!config.codeCompletion) {
      return undefined;
    }
    const parsedCSConfig = CodeSuggestionsConfig.safeParse(config.codeCompletion);
    if (!parsedCSConfig.error) {
      return undefined;
    }
    const validationErrorMessage = fromError(parsedCSConfig.error, {
      prefix: 'settings.codeCompletion',
    }).message;
    const originalConfig = JSON.stringify(config.codeCompletion);
    const validFormatExample = JSON.stringify(exampleConfig.codeCompletion);

    return new Error(
      `Validation error: ${validationErrorMessage}\nConfig received ${originalConfig}\nExample of a correct format: ${validFormatExample}`,
    );
  }
}
