import { createInterfaceId, Injectable } from '@gitlab/needle';
import { LsConnection } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';

export type ShowErrorMessageParams = {
  message: string;
  docUrl?: string;
};

export interface ErrorNotifier {
  showErrorMessage({ message, docUrl }: ShowErrorMessageParams): Promise<void>;
}

export const ErrorNotifier = createInterfaceId<ErrorNotifier>('ErrorNotifier');

@Injectable(ErrorNotifier, [LsConnection, Logger])
export class DefaultErrorNotifier implements ErrorNotifier {
  #connection: LsConnection;

  #logger: Logger;

  #isErrorMessageShown = false;

  constructor(connection: LsConnection, logger: Logger) {
    this.#connection = connection;
    this.#logger = logger;
  }

  async showErrorMessage({ message, docUrl }: { message: string; docUrl: string }) {
    if (!this.#isErrorMessageShown) {
      await this.#connection.window.showErrorMessage(`${message} View the logs for more details.`);
    }

    this.#isErrorMessageShown = true;

    const withDocUrl = docUrl ? `See ${docUrl} for more details.` : '';

    this.#logger.error(`${message} ${withDocUrl}`);
  }
}
