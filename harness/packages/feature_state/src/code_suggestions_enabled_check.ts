/* eslint-disable max-classes-per-file */
import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { FeatureStateCheck, StateCheckId, SUGGESTIONS_DISABLED_BY_USER } from '@gitlab-org/core';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { StateCheck, StateCheckChangedEventData, StateConfigCheck } from './state_check';

const SUGGESTIONS_DISABLED_DETAILS = 'Code Suggestions manually disabled.';

export const CodeSuggestionsEnabledConfigCheck = createInterfaceId<StateConfigCheck>(
  'CodeSuggestionsEnabledConfigCheck',
);

@Injectable(CodeSuggestionsEnabledConfigCheck, [])
export class DefaultCodeSuggestionsEnabledConfigCheck implements StateConfigCheck {
  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return {
      checkId: SUGGESTIONS_DISABLED_BY_USER,
      details: SUGGESTIONS_DISABLED_DETAILS,
      engaged: config.codeCompletion?.enabled === false,
    };
  }
}

export type CodeSuggestionsEnabledCheck = StateCheck<typeof SUGGESTIONS_DISABLED_BY_USER> &
  StateConfigCheck;

export const CodeSuggestionsEnabledCheck = createInterfaceId<CodeSuggestionsEnabledCheck>(
  'CodeSuggestionsEnabledCheck',
);

@Injectable(CodeSuggestionsEnabledCheck, [ConfigService])
export class DefaultCodeSuggestionsEnabledCheck implements CodeSuggestionsEnabledCheck {
  #configCheck = new DefaultCodeSuggestionsEnabledConfigCheck();

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #isEnabledByUser = true;

  constructor(configService: ConfigService) {
    this.#subscriptions.push(
      configService.onConfigChange((config) => {
        const codeSuggestionsEnabled = config.codeCompletion?.enabled;

        if (codeSuggestionsEnabled !== undefined) {
          this.#isEnabledByUser = codeSuggestionsEnabled;
          this.#stateEmitter.emit('change', this);
        }
      }),
    );
  }

  id = SUGGESTIONS_DISABLED_BY_USER;

  details = SUGGESTIONS_DISABLED_DETAILS;

  get engaged() {
    return !this.#isEnabledByUser;
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);

    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return this.#configCheck.validate(config);
  }
}
