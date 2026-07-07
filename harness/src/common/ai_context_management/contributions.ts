import { DefaultAiContextTransformerService } from '@gitlab-org/ai-context';
import { DefaultCodeSuggestionContextManager } from './code_suggestion_context_manager';
import { DefaultDuoExclusionFilePolicyProvider } from './context_policies/duo_exclusion_file_policy';
import { DefaultFilePolicyProvider } from './context_policies/file_policy';
import { DefaultOpenTabContextProvider } from './context_providers/open_tabs/open_tabs_provider';

export const aiContextManagementContributions = [
  DefaultAiContextTransformerService,
  DefaultCodeSuggestionContextManager,
  DefaultOpenTabContextProvider,
  DefaultFilePolicyProvider,
  DefaultDuoExclusionFilePolicyProvider,
] as const;
