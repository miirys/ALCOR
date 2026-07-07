import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Notifier, NotifyFn } from '@gitlab-org/core';
import { GitLabApiClient } from '../../api';
import { TokenCheckNotificationParams } from '../../notifications';

export interface TokenCheckNotifier extends Notifier<TokenCheckNotificationParams> {}

export const TokenCheckNotifier = createInterfaceId<TokenCheckNotifier>('TokenCheckNotifier');

@Injectable(TokenCheckNotifier, [GitLabApiClient])
export class DefaultTokenCheckNotifier implements TokenCheckNotifier {
  #notify: NotifyFn<TokenCheckNotificationParams> | undefined;

  constructor(api: GitLabApiClient) {
    api.onApiReconfigured(async (event) => {
      if (!event.isInValidState) {
        if (!this.#notify) {
          throw new Error(
            'The DefaultTokenCheckNotifier has not been initialized. Call init first.',
          );
        }
        await this.#notify({
          message: event.validationMessage,
        });
      }
    });
  }

  init(callback: NotifyFn<TokenCheckNotificationParams>) {
    this.#notify = callback;
  }
}
