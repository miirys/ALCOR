import { DefaultAgenticChatConfigurationValidator } from './agentic_chat_configuration_validation';
import { DefaultAuthenticationConfigurationValidator } from './authentication_configuration_validator';
import { DefaultChatConfigurationValidator } from './chat_configuration_validator';
import { DefaultCodeSuggestionsConfigurationValidator } from './code_suggestions_configuration_validator';
import { DefaultConfigurationValidationService } from './configuration_validation_service';
import { DefaultFlowsConfigurationValidator } from './flows_configuration_validation';

export const configurationValidationContributions = [
  DefaultAuthenticationConfigurationValidator,
  DefaultChatConfigurationValidator,
  DefaultCodeSuggestionsConfigurationValidator,
  DefaultAgenticChatConfigurationValidator,
  DefaultFlowsConfigurationValidator,
  DefaultConfigurationValidationService,
] as const;
