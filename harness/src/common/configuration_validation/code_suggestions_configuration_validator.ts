import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  CODE_SUGGESTIONS,
  Feature,
  FeatureState,
  FeatureStateCheck,
  StateCheckId,
} from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { CodeSuggestionsEnabledCheck, StateConfigCheck } from '@gitlab-org/feature-state';
import {
  CodeSuggestionsDuoLicenseCheck,
  CodeSuggestionsInstanceVersionCheck,
  ProjectDuoAccessCheck,
} from '../feature_state';
import { ConfigurationValidator } from './configuration_validator';

export type CodeSuggestionsConfigurationValidator = ConfigurationValidator;

export const CodeSuggestionsConfigurationValidator =
  createInterfaceId<CodeSuggestionsConfigurationValidator>('CodeSuggestionsConfigurationValidator');

@Injectable(CodeSuggestionsConfigurationValidator, [
  CodeSuggestionsInstanceVersionCheck,
  ProjectDuoAccessCheck,
  CodeSuggestionsDuoLicenseCheck,
  CodeSuggestionsEnabledCheck,
])
export class DefaultCodeSuggestionsConfigurationValidator
  implements CodeSuggestionsConfigurationValidator
{
  #orderedChecks: StateConfigCheck[] = [];

  #allChecks: FeatureStateCheck<StateCheckId>[] = [];

  #engagedChecks: FeatureStateCheck<StateCheckId>[] = [];

  constructor(
    codeSuggestionsInstanceVersionCheck: CodeSuggestionsInstanceVersionCheck,
    duoProjectAccessChecker: ProjectDuoAccessCheck,
    codeSuggestionsDuoLicenseCheck: CodeSuggestionsDuoLicenseCheck,
    codeSuggestionsEnabledCheck: CodeSuggestionsEnabledCheck,
  ) {
    this.#orderedChecks = [
      codeSuggestionsInstanceVersionCheck,
      duoProjectAccessChecker,
      codeSuggestionsDuoLicenseCheck,
      codeSuggestionsEnabledCheck,
    ];
  }

  feature: Feature = CODE_SUGGESTIONS;

  async validate(config: ClientConfig): Promise<FeatureState> {
    this.#allChecks = (await Promise.all(
      this.#orderedChecks.map((check) => check.validate(config)),
    )) as FeatureStateCheck<StateCheckId>[];

    this.#engagedChecks = this.#allChecks.filter((check) => check.engaged);

    return {
      featureId: CODE_SUGGESTIONS,
      engagedChecks: this.#engagedChecks,
      allChecks: this.#allChecks,
    };
  }
}
