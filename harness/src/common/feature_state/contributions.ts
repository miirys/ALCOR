import {
  DefaultAgentPlatformEnabledCheck,
  DefaultAuthenticationRequiredCheck,
  DefaultChatEnabledCheck,
  DefaultCodeSuggestionsEnabledCheck,
  DefaultFlowsInstanceFlagCheck,
} from '@gitlab-org/feature-state';
import { sandboxFeatureStateContributions } from '@gitlab-org/sandbox/feature-state';
import { DefaultAgenticChatSupportCheck } from './agentic_chat/agentic_chat_support_check';
import { DefaultChatIncludeTerminalContextCheck } from './chat_include_terminal_context_check';
import { DefaultClassicChatLicenseCheck } from './classic_chat_license_check';
import { DefaultDuoChatLicenseCheck } from './duo_chat_license_check';
import { DefaultSuggestionApiErrorCheck } from './suggestion_api_error_check';
import { DefaultSuggestionApiErrorNotifier } from './suggestion_api_error_notifier';
import {
  DefaultFeatureStateManager,
  DefaultCodeSuggestionsSupportedLanguageCheck,
  DefaultCodeSuggestionsFileExclusionCheck,
  DefaultProjectDuoAccessCheck,
  DefaultCodeSuggestionsDuoLicenseCheck,
  DefaultCodeSuggestionsInstanceVersionCheck,
  DefaultCodeSuggestionsCreditsCheck,
  DefaultCodeSuggestionsMissingDefaultNamespaceCheck,
} from '.';

export const featureStateContributions = [
  DefaultCodeSuggestionsSupportedLanguageCheck,
  DefaultCodeSuggestionsFileExclusionCheck,
  DefaultProjectDuoAccessCheck,
  DefaultCodeSuggestionsDuoLicenseCheck,
  DefaultCodeSuggestionsInstanceVersionCheck,
  DefaultChatEnabledCheck,
  DefaultChatIncludeTerminalContextCheck,
  DefaultCodeSuggestionsEnabledCheck,
  DefaultCodeSuggestionsCreditsCheck,
  DefaultCodeSuggestionsMissingDefaultNamespaceCheck,
  DefaultClassicChatLicenseCheck,
  DefaultDuoChatLicenseCheck,
  DefaultAuthenticationRequiredCheck,
  DefaultFeatureStateManager,
  DefaultSuggestionApiErrorCheck,
  DefaultSuggestionApiErrorNotifier,
  DefaultAgentPlatformEnabledCheck,
  DefaultAgenticChatSupportCheck,
  DefaultFlowsInstanceFlagCheck,
  ...sandboxFeatureStateContributions,
] as const;
