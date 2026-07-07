import { Disposable } from '@gitlab-org/disposable';
import {
  ApiRequest,
  doNotAwait,
  EventEmitterImpl,
  isNot4xxFailure,
  StateCheckId,
  diffEmitter,
} from '@gitlab-org/core';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { ClientConfig } from '@gitlab-org/config';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { log } from '../log';
import { GitLabApiClient } from '../api';

/**
 * ApiStateCheck represents a result of a single API boolean request.
 * Every time we change the API configuration, this check will make a `query`
 * to the API and then uses the `checkSuccessful` callback to verify whether the
 * response is successful or not.
 */
export class ApiStateCheck<T> implements Disposable {
  #subscriptions: Disposable[] = [];

  #stateEmitter = diffEmitter(new EventEmitterImpl<StateCheckChangedEventData>());

  #api: GitLabApiClient;

  protected isSuccessful = false;

  #query: ApiRequest<T>;

  #checkSuccessful: (x: T) => boolean;

  checkId: StateCheckId;

  #baseDetails: string;

  #lastErrorMessage: string | undefined;

  /** Base description, optionally enriched with the most recent fetch error. */
  get details(): string {
    return this.#lastErrorMessage
      ? `${this.#baseDetails} (${this.#lastErrorMessage})`
      : this.#baseDetails;
  }

  constructor(
    api: GitLabApiClient,
    checkId: StateCheckId,
    details: string,
    query: ApiRequest<T>,
    checkSuccessful: (x: T) => boolean,
    options?: { failOpen?: boolean },
  ) {
    this.#api = api;
    this.#checkSuccessful = checkSuccessful;
    this.#query = query;
    this.checkId = checkId;
    this.#baseDetails = details;
    if (options?.failOpen) {
      this.isSuccessful = true;
    }

    this.#subscriptions.push(
      this.#api.onApiReconfigured(async (data, signal) => {
        if (!data.isInValidState) return;
        await this.#checkIfLicenseAvailable(signal);
      }),
    );

    if (this.#api.isInValidState) {
      const abortController = new AbortController();
      doNotAwait(this.#checkIfLicenseAvailable(abortController.signal));
    }
  }

  async #checkIfLicenseAvailable(signal: AbortSignal): Promise<void> {
    try {
      const response = await retry(this.#api.fetchOperation(this.#query), {
        signal,
        shouldRetry: [isNotAbort, isNot4xxFailure],
        onRetry: (count, error) => {
          log.warn(
            `Failed to fetch api status information for ${this.checkId}. Retrying (attempt number ${count})`,
            error,
          );
          this.isSuccessful = false;
          this.#stateEmitter.fire(this);
        },
      });

      this.isSuccessful = this.#checkSuccessful(response);
      this.#lastErrorMessage = undefined;
    } catch (error) {
      if (error instanceof AbortError) return;

      log.error(`Failed to request api status information.`, error);

      if (error instanceof InvalidInstanceVersionError) {
        return;
      }

      this.isSuccessful = false;
      this.#lastErrorMessage = error instanceof Error ? error.message : undefined;
    }

    this.#stateEmitter.fire(this);
  }

  onChanged = this.#stateEmitter.event;

  get engaged() {
    return !this.isSuccessful;
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  async validate(config: ClientConfig): Promise<boolean> {
    const baseUrl = config.baseUrl ?? '';
    const token = config.token ?? '';

    try {
      const response = await this.#api.getSimpleClient(baseUrl, token).fetchFromApi<T>(this.#query);

      return this.#checkSuccessful(response);
    } catch (error) {
      log.error(`Failed to validate api status for configuration.`, error);
      return false;
    }
  }
}
