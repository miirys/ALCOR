import { createInterfaceId, Injectable } from '@gitlab/needle';
import { FeatureState } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';
import { ChatConfigurationValidator } from './chat_configuration_validator';
import { AuthenticationConfigurationValidator } from './authentication_configuration_validator';
import { CodeSuggestionsConfigurationValidator } from './code_suggestions_configuration_validator';
import { AgenticChatConfigurationValidator } from './agentic_chat_configuration_validation';
import { FlowsConfigurationValidator } from './flows_configuration_validation';

export const CONFIGURATION_VALIDATION_REQUEST = '$/gitlab/validateConfiguration';

export type ConfigurationValidationRequest = ClientConfig;
export type ConfigurationValidationResponse = FeatureState[];

export interface ConfigurationValidationService {
  validate(request: ConfigurationValidationRequest): Promise<ConfigurationValidationResponse>;
}

export const ConfigurationValidationService = createInterfaceId<ConfigurationValidationService>(
  'ConfigurationValidationService',
);

@Injectable(ConfigurationValidationService, [
  AuthenticationConfigurationValidator,
  ChatConfigurationValidator,
  CodeSuggestionsConfigurationValidator,
  AgenticChatConfigurationValidator,
  FlowsConfigurationValidator,
])
export class DefaultConfigurationValidationService implements ConfigurationValidationService {
  #authenticationChecks: AuthenticationConfigurationValidator;

  #chatConfigurationValidator: ChatConfigurationValidator;

  #codeSuggestionsConfigurationValidator: CodeSuggestionsConfigurationValidator;

  #agenticChatConfigurationValidator: AgenticChatConfigurationValidator;

  #flowsConfigurationValidator: FlowsConfigurationValidator;

  constructor(
    authenticationConfigValidator: AuthenticationConfigurationValidator,
    chatConfigurationValidator: ChatConfigurationValidator,
    codeSuggestionsConfigurationValidator: CodeSuggestionsConfigurationValidator,
    agenticChatConfigurationValidator: AgenticChatConfigurationValidator,
    flowsConfigurationValidator: FlowsConfigurationValidator,
  ) {
    this.#authenticationChecks = authenticationConfigValidator;
    this.#chatConfigurationValidator = chatConfigurationValidator;
    this.#codeSuggestionsConfigurationValidator = codeSuggestionsConfigurationValidator;
    this.#agenticChatConfigurationValidator = agenticChatConfigurationValidator;
    this.#flowsConfigurationValidator = flowsConfigurationValidator;
  }

  async validate(
    settings: ConfigurationValidationRequest,
  ): Promise<ConfigurationValidationResponse> {
    const authResults = await this.#authenticationChecks.validate(settings);
    if (authResults.engagedChecks.length !== 0) {
      return [authResults];
    }

    const [duoResults, dapResults] = await Promise.all([
      Promise.all([
        this.#chatConfigurationValidator.validate(settings),
        this.#codeSuggestionsConfigurationValidator.validate(settings),
      ]),
      Promise.all([
        this.#agenticChatConfigurationValidator.validate(settings),
        this.#flowsConfigurationValidator.validate(settings),
      ]),
    ]);
    return [authResults, ...duoResults, ...dapResults];
  }
}
