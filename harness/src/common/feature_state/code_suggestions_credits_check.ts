import { EventEmitter } from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { SUGGESTIONS_NO_CREDITS } from '@gitlab-org/core';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { CodeSuggestionsDirectAccessService } from '../services/duo_access';

export interface CodeSuggestionsCreditsCheck extends StateCheck<typeof SUGGESTIONS_NO_CREDITS> {
  setCreditsExceeded(value: boolean): void;
}

export const CodeSuggestionsCreditsCheck = createInterfaceId<CodeSuggestionsCreditsCheck>(
  'CodeSuggestionsCreditsCheck',
);

@Injectable(CodeSuggestionsCreditsCheck, [CodeSuggestionsDirectAccessService])
export class DefaultCodeSuggestionsCreditsCheck implements CodeSuggestionsCreditsCheck {
  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #creditsExceeded = false;

  constructor(directAccessService: CodeSuggestionsDirectAccessService) {
    this.#subscriptions.push(
      directAccessService.onResult((result) => {
        const exceeded = result.status === 'credits_exceeded';
        if (this.#creditsExceeded !== exceeded) {
          this.#creditsExceeded = exceeded;
          this.#fireChange();
        }
      }),
    );
  }

  #fireChange = () => {
    const data: StateCheckChangedEventData = {
      checkId: this.id,
      details: this.details,
      engaged: this.engaged,
    };
    this.#stateEmitter.emit('change', data);
  };

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  get engaged() {
    return this.#creditsExceeded;
  }

  id = SUGGESTIONS_NO_CREDITS;

  details =
    'No GitLab Credits remain for this billing period. To continue using Code Suggestions, contact your administrator. When you have more credits, reload the extension.';

  setCreditsExceeded = (value: boolean): void => {
    this.#creditsExceeded = value;
    this.#fireChange();
  };

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#stateEmitter.removeAllListeners();
  }
}
