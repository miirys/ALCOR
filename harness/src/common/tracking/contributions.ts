import { DefaultDuoWorkflowInstanceTracker } from '@gitlab-org/workflow-executor';
import {
  DefaultExtensionActivitySnowplowTracker,
  DefaultSnowplowService,
  DefaultStandardContext,
  DefaultDuoAgentPlatformTracker,
} from '@gitlab-org/telemetry';
import { DefaultCodeSuggestionsSnowplowTracker } from './code_suggestions/code_suggestions_snowplow_tracker';
import { DefaultCodeSuggestionsMultiTracker } from './code_suggestions/code_suggestions_multi_tracker';
import { DefaultCodeSuggestionsInstanceTracker } from './code_suggestions/code_suggestions_instance_tracker';
import { DefaultCodeSuggestionTelemetryState } from './code_suggestions/code_suggestions_telemetry_state_manager';
import { DefaultQuickChatSnowplowTracker } from './quick_chat/quick_chat_snowplow_tracker';
import { DefaultSecurityDiagnosticsTracker } from './security_scan/security_diagnostics_tracker';
import { DefaultDuoChatSnowplowTracker } from './duo_chat/duo_chat_snowplow_tracker';

export const telemetryContributions = [
  DefaultSnowplowService,
  DefaultCodeSuggestionTelemetryState,
  DefaultCodeSuggestionsMultiTracker,
  DefaultCodeSuggestionsSnowplowTracker,
  DefaultCodeSuggestionsInstanceTracker,
  DefaultQuickChatSnowplowTracker,
  DefaultStandardContext,
  DefaultSecurityDiagnosticsTracker,
  DefaultDuoChatSnowplowTracker,
  DefaultDuoWorkflowInstanceTracker,
  DefaultDuoAgentPlatformTracker,
  DefaultExtensionActivitySnowplowTracker,
] as const;
