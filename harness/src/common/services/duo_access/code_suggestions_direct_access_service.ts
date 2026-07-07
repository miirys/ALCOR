import { EventEmitter } from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { doNotAwait, isFetchError } from '@gitlab-org/core';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { ConfigService } from '@gitlab-org/config';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { GitLabApiClient } from '../../api';

export type CodeSuggestionsDirectAccessResult =
  | { status: 'success' }
  | { status: 'credits_exceeded' }
  | { status: 'missing_default_namespace' }
  | { status: 'error'; error: unknown };

export interface CodeSuggestionsDirectAccessService {
  onResult(listener: (result: CodeSuggestionsDirectAccessResult) => void): Disposable;
}

export const CodeSuggestionsDirectAccessService =
  createInterfaceId<CodeSuggestionsDirectAccessService>('CodeSuggestionsDirectAccessService');

export function isUsageQuotaExceededError(error: unknown): boolean {
  if (isFetchError(error) && error.body) {
    return error.body.includes('USAGE_QUOTA_EXCEEDED');
  }

  return false;
}

function isMissingDefaultNamespaceError(error: unknown): boolean {
  if (isFetchError(error) && error.status === 422 && error.body) {
    return error.body.includes('missing_default_duo');
  }

  return false;
}

@Injectable(CodeSuggestionsDirectAccessService, [GitLabApiClient, ConfigService, Logger])
export class DefaultCodeSuggestionsDirectAccessService
  implements CodeSuggestionsDirectAccessService
{
  #subscriptions: Disposable[] = [];

  #emitter = new EventEmitter();

  #api: GitLabApiClient;

  #configService: ConfigService;

  #logger: Logger;

  #lastEmittedResult: CodeSuggestionsDirectAccessResult | undefined;

  #abortController: AbortController | undefined;

  constructor(api: GitLabApiClient, configService: ConfigService, logger: Logger) {
    this.#api = api;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[CodeSuggestionsDirectAccessService]');

    this.#subscriptions.push(
      api.onApiReconfigured(async (event, signal) => {
        if (!event.isInValidState) return;
        await this.#fetch(signal);
      }),
    );

    if (this.#api.isInValidState) {
      this.#abortController = new AbortController();
      doNotAwait(this.#fetch(this.#abortController.signal));
    }
  }

  async #fetch(signal: AbortSignal): Promise<void> {
    try {
      const projectPath = this.#configService.get('projectPath');

      await retry(
        this.#api.fetchOperation({
          type: 'rest',
          method: 'POST',
          path: '/api/v4/code_suggestions/direct_access',
          body: {
            projectPath: projectPath ?? '',
          },
        }),
        {
          signal,
          shouldRetry: [
            isNotAbort,
            (error) => !isUsageQuotaExceededError(error) && !isMissingDefaultNamespaceError(error),
          ],
        },
      );

      this.#emit({ status: 'success' });
    } catch (error) {
      if (error instanceof AbortError) return;

      if (error instanceof InvalidInstanceVersionError) {
        this.#logger.error('GitLab instance does not support usage quota checking.');
        return;
      }

      if (isMissingDefaultNamespaceError(error)) {
        this.#logger.warn('User has not selected a default GitLab Duo namespace');
        this.#emit({ status: 'missing_default_namespace' });
        return;
      }

      if (isUsageQuotaExceededError(error)) {
        this.#logger.warn('Usage quota exceeded for code suggestions');
        this.#emit({ status: 'credits_exceeded' });
        return;
      }

      this.#logger.error('Failed to call direct_access', error);
      this.#emit({ status: 'error', error });
    }
  }

  #emit(result: CodeSuggestionsDirectAccessResult) {
    // Dedup by status only; error payload variations are intentionally suppressed
    // to avoid re-notifying listeners for repeated errors of the same kind.
    if (this.#lastEmittedResult?.status === result.status) {
      return;
    }

    this.#lastEmittedResult = result;
    this.#emitter.emit('result', result);
  }

  onResult(listener: (result: CodeSuggestionsDirectAccessResult) => void): Disposable {
    this.#emitter.on('result', listener);
    return {
      dispose: () => this.#emitter.removeListener('result', listener),
    };
  }

  dispose() {
    this.#abortController?.abort();
    this.#subscriptions.forEach((s) => s.dispose());
    this.#emitter.removeAllListeners();
  }
}
