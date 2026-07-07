import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { isMissingDefaultDuoGroupError, NotifyFn } from '@gitlab-org/core';
import { ErrorNotifier } from '@gitlab-org/errors';
import { log } from '../log';
import { SuggestionApiErrorCheck } from './suggestion_api_error_check';

export interface SuggestionApiErrorNotifier {
  setErrorNotifyFn(errorNotifyFn: NotifyFn<void>): void;
  setRecoveryNotifyFn(recoveryNotifyFn: NotifyFn<void>): void;
}

export const SuggestionApiErrorNotifier = createInterfaceId<SuggestionApiErrorNotifier>(
  'SuggestionApiErrorNotifier',
);

@Injectable(SuggestionApiErrorNotifier, [SuggestionApiErrorCheck, ErrorNotifier])
export class DefaultSuggestionApiErrorNotifier implements SuggestionApiErrorNotifier, Disposable {
  #errorNotifyFn?: NotifyFn<void>;

  #recoveryNotifyFn?: NotifyFn<void>;

  #subscriptions: Disposable[] = [];

  constructor(apiErrorCheck: SuggestionApiErrorCheck, errorNotifier: ErrorNotifier) {
    this.#subscriptions.push(apiErrorCheck.onOpen(this.#sendErrorNotification));
    this.#subscriptions.push(apiErrorCheck.onClose(this.#sendRecoveryNotification));
    this.#subscriptions.push(
      apiErrorCheck.onChanged(async (data) => {
        if (isMissingDefaultDuoGroupError(data.error)) {
          await errorNotifier.showErrorMessage({
            message:
              'Multiple GitLab Duo namespaces detected. In your user preferences, select a default GitLab Duo namespace.',
            docUrl:
              'https://docs.gitlab.com/user/profile/preferences/#set-a-default-gitlab-duo-namespace',
          });
        }
      }),
    );
  }

  #sendErrorNotification = () => {
    if (!this.#errorNotifyFn) {
      // Only logging an error because this misconfiguration issue won't show instantly on startup.
      // If we forget to add the notify functions, these listeners would start failing only if there are 4 consecutive
      // api errors.
      log.error(
        'errorNotifyFn is missing in the ApiErrorNotifier. It has not been initialized during application startup. This is a bug that user cannot fix.',
      );
      return;
    }
    this.#errorNotifyFn().catch((e) => log.error('Error when sending API error notification:', e));
  };

  #sendRecoveryNotification = () => {
    if (!this.#recoveryNotifyFn) {
      log.error(
        'recoveryNotifyFn is missing in the ApiErrorNotifier. It has not been initialized during application startup. This is a bug that user cannot fix.',
      );
      throw new Error('test');
    }
    this.#recoveryNotifyFn().catch((e) =>
      log.error('Error when sending API recovery notification:', e),
    );
  };

  setErrorNotifyFn(errorNotifyFn: NotifyFn<void>): void {
    this.#errorNotifyFn = errorNotifyFn;
  }

  setRecoveryNotifyFn(recoveryNotifyFn: NotifyFn<void>): void {
    this.#recoveryNotifyFn = recoveryNotifyFn;
  }

  dispose(): void {
    this.#subscriptions.forEach((s) => s.dispose());
  }
}
