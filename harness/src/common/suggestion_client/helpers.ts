import { AIContextProviderType } from '@gitlab-org/ai-context';
import { InstanceFeatureFlags, FeatureFlagService } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { AdditionalContext } from '../api_types';
import { CodeSuggestionsAIContextItem } from './pre_processors/pre_processor_pipeline';

/**
 * Maps `AIContextProviderType` to the telemetry event name.
 * TODO: work with PDI so that we can remove this mapping and just use the `AIContextProviderType`
 * https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/769
 */
const AIContextProviderTelemetryMapping = {
  open_tab: 'open_tabs' as const,
  import: 'imports' as const,
  // Leave these undefined for now, as they are not Code Suggestion Context Providers yet
  dependency: undefined,
  local_git: undefined,
  issue: undefined,
  merge_request: undefined,
  snippet: undefined,
  local_file_search: undefined,
  repository: undefined,
  user_rule: undefined,
  directory: undefined,
  shell: undefined,
  os: undefined,
  mode: undefined,
  hook: undefined,
} satisfies Record<AIContextProviderType, string | undefined>;

/**
 * Maps `ContextResolution` to the request body format `AdditionalContext`.
 * Note: We intentionally keep these two separate to avoid coupling the request body
 * format to the advanced context resolver internal data.
 */
export function aiContextItemsToRequestBody(
  aiContextItems: CodeSuggestionsAIContextItem[],
): AdditionalContext[] {
  return aiContextItems.map((ac) => {
    const providerType = AIContextProviderTelemetryMapping[ac.metadata.subType];
    if (!providerType) {
      throw new Error(`Unknown AIContextProviderType: ${ac.metadata.subType}`);
    }

    const providerTypes = ac.metadata.allSources
      ?.map((source) => AIContextProviderTelemetryMapping[source])
      .filter((telemetryType) => telemetryType !== undefined) || [providerType];

    return {
      type: ac.category as 'file' | 'snippet',
      name: ac.id,
      content: ac.content ?? '',
      resolution_strategies: providerTypes,
    };
  });
}

/**
 * Determines if the advanced context resolver should be used for code suggestions.
 * Because the Code Suggestions API has other consumers than the language server,
 * we gate the advanced context resolver behind a feature flag separately.
 */
export const shouldUseOpenTabs = (
  featureFlagService: FeatureFlagService,
  configService: ConfigService,
) => {
  const isEditorAdvancedContextEnabled = featureFlagService.isInstanceFlagEnabled(
    InstanceFeatureFlags.EditorAdvancedContext,
  );
  const isGenericContextEnabled = featureFlagService.isInstanceFlagEnabled(
    InstanceFeatureFlags.CodeSuggestionsContext,
  );
  let isEditorOpenTabsContextEnabled = configService.get('openTabsContext');

  if (isEditorOpenTabsContextEnabled === undefined) {
    isEditorOpenTabsContextEnabled = true;
  }
  /**
   * TODO - when we introduce other context resolution strategies,
   * have `isEditorOpenTabsContextEnabled` only disable the corresponding resolver (`lruResolver`)
   * https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/298
   * https://gitlab.com/groups/gitlab-org/editor-extensions/-/epics/59#note_1981542181
   */
  return (
    isEditorAdvancedContextEnabled && isGenericContextEnabled && isEditorOpenTabsContextEnabled
  );
};

export const codeSuggestionsDisabledLog = 'code suggestion context is disabled';
