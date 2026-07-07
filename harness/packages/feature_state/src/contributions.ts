import { DefaultChatEnabledConfigCheck } from './chat_enabled_check';
import { DefaultCodeSuggestionsEnabledConfigCheck } from './code_suggestions_enabled_check';
import { DefaultAgentPlatformEnabledConfigCheck } from './agent_platform/agent_platform_enabled_check';
import { DefaultFlowsInstanceFlagConfigCheck } from './flows/flows_instance_flag_check';
import { DefaultFeatureStateValidator } from './feature_state_validator';

export const statelessFeatureStateContributions = [
  DefaultChatEnabledConfigCheck,
  DefaultCodeSuggestionsEnabledConfigCheck,
  DefaultAgentPlatformEnabledConfigCheck,
  DefaultFlowsInstanceFlagConfigCheck,
  DefaultFeatureStateValidator,
] as const;
