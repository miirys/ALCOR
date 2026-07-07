import { EventEmitter } from 'events';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  FeatureStateCheck,
  StateCheckId,
  UNSUPPORTED_GITLAB_VERSION,
  UnsupportedGitLabVersionCheckContext,
  ifVersionGte,
  versionRequest,
} from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import {
  StateCheck,
  StateCheckChangedEventData,
  StateConfigCheck,
} from '@gitlab-org/feature-state';
import { GitLabApiClient } from '../api';

export const MINIMUM_CODE_SUGGESTIONS_VERSION = '16.8.0';

export type CodeSuggestionsInstanceVersionCheck = StateCheck<typeof UNSUPPORTED_GITLAB_VERSION> &
  StateConfigCheck;

export const CodeSuggestionsInstanceVersionCheck =
  createInterfaceId<CodeSuggestionsInstanceVersionCheck>('CodeSuggestionsInstanceVersionCheck');

@Injectable(CodeSuggestionsInstanceVersionCheck, [GitLabApiClient])
export class DefaultCodeSuggestionsInstanceVersionCheck
  implements CodeSuggestionsInstanceVersionCheck
{
  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #api: GitLabApiClient;

  #isVersionDeprecated = false;

  #baseUrl?: string;

  #instanceVersion?: string;

  details?: string;

  context?: UnsupportedGitLabVersionCheckContext;

  constructor(api: GitLabApiClient) {
    this.#api = api;

    this.#subscriptions.push(
      api.onApiReconfigured(async (event) => {
        if (event.isInValidState === false) {
          this.#instanceVersion = undefined;
          this.#baseUrl = undefined;
          return;
        }
        this.#instanceVersion = event.instanceInfo.instanceVersion;
        this.#baseUrl = event.instanceInfo.instanceUrl.toString();
        await this.#checkInstanceVersion(this.#instanceVersion);
      }),
    );
  }

  async #checkInstanceVersion(version: string): Promise<void> {
    ifVersionGte(
      version,
      MINIMUM_CODE_SUGGESTIONS_VERSION,
      () => {
        this.#isVersionDeprecated = false;
        this.#stateEmitter.emit('change', this);
      },
      () => {
        this.#isVersionDeprecated = true;
        this.details = `GitLab Duo Code Suggestions requires GitLab version 16.8 or later. GitLab instance located at: ${this.#baseUrl} is currently using ${this.#instanceVersion}`;
        this.context = {
          // we check that baseUrl is available before calling current method
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          baseUrl: this.#baseUrl!,
          version,
        };
        this.#stateEmitter.emit('change', this);
      },
    );
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  get engaged() {
    return this.#isVersionDeprecated;
  }

  id = UNSUPPORTED_GITLAB_VERSION;

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId>> {
    if (!config.baseUrl) {
      return {
        checkId: this.id,
        details: 'Config is missing GitLab API URL (`baseUrl` parameter)',
        engaged: true,
      };
    }
    if (!config.token) {
      return {
        checkId: this.id,
        details: 'Config is missing GitLab API token (`token` parameter)',
        engaged: true,
      };
    }

    const { version } = await this.#api
      .getSimpleClient(config.baseUrl, config.token)
      .fetchFromApi(versionRequest);

    return ifVersionGte<FeatureStateCheck<StateCheckId>>(
      version,
      MINIMUM_CODE_SUGGESTIONS_VERSION,
      () => ({
        checkId: this.id,
        details: `GitLab Duo Code Suggestions requires GitLab version 16.8 or later. Current version is ${version}.`,
        engaged: false,
      }),
      () => ({
        checkId: this.id,
        details: `GitLab Duo Code Suggestions requires GitLab version 16.8 or later. Current version is ${version}.`,
        engaged: true,
      }),
    );
  }
}
