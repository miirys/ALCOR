import { EventEmitter } from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { SUGGESTIONS_NO_DEFAULT_NAMESPACE } from '@gitlab-org/core';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { CodeSuggestionsDirectAccessService } from '../services/duo_access';

export interface CodeSuggestionsMissingDefaultNamespaceCheck
  extends StateCheck<typeof SUGGESTIONS_NO_DEFAULT_NAMESPACE> {
  setMissingDefaultNamespace(value: boolean): void;
}

export const CodeSuggestionsMissingDefaultNamespaceCheck =
  createInterfaceId<CodeSuggestionsMissingDefaultNamespaceCheck>(
    'CodeSuggestionsMissingDefaultNamespaceCheck',
  );

@Injectable(CodeSuggestionsMissingDefaultNamespaceCheck, [CodeSuggestionsDirectAccessService])
export class DefaultCodeSuggestionsMissingDefaultNamespaceCheck
  implements CodeSuggestionsMissingDefaultNamespaceCheck
{
  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #missingDefaultNamespace = false;

  constructor(directAccessService: CodeSuggestionsDirectAccessService) {
    this.#subscriptions.push(
      directAccessService.onResult((result) => {
        this.setMissingDefaultNamespace(result.status === 'missing_default_namespace');
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
    return this.#missingDefaultNamespace;
  }

  id = SUGGESTIONS_NO_DEFAULT_NAMESPACE;

  details =
    'Code Suggestions cannot detect a namespace for this project. To continue, please set a default GitLab Duo namespace in your user preferences.';

  setMissingDefaultNamespace = (value: boolean): void => {
    if (this.#missingDefaultNamespace !== value) {
      this.#missingDefaultNamespace = value;
      this.#fireChange();
    }
  };

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#stateEmitter.removeAllListeners();
  }
}
