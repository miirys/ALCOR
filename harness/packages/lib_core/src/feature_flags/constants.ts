export enum InstanceFeatureFlags {
  EditorAdvancedContext = 'advanced_context_resolver',
  CodeSuggestionsContext = 'code_suggestions_context',
  UseDuoContextExclusion = 'use_duo_context_exclusion',
  DuoWorkflow = 'duo_workflow',
  UserModelSwitching = 'ai_user_model_switching',
  SoftwareDevelopmentFlowRegistry = 'software_development_flow_registry',
}

// The milestone where a feature flag was added. Early versions
// most likely did not have the feature at all so we can default
// to hiding it from the user.
export const InstanceFeatureFlagIntroduced: Record<InstanceFeatureFlags, string> = {
  [InstanceFeatureFlags.DuoWorkflow]: '17.2.0',
  [InstanceFeatureFlags.EditorAdvancedContext]: '17.1.0',
  [InstanceFeatureFlags.CodeSuggestionsContext]: '17.1.0',
  [InstanceFeatureFlags.UseDuoContextExclusion]: '18.2.0',
  [InstanceFeatureFlags.UserModelSwitching]: '18.4.0',
  [InstanceFeatureFlags.SoftwareDevelopmentFlowRegistry]: '19.1.0',
};

// The milestone where a feature flag was enabled by default. Later
// instance versions should use an application setting, group setting,
// project setting, user preference etc. to disable the functionality
// which we should prefer to a feature flag when available.
export const InstanceFeatureFlagRollout: Partial<Record<InstanceFeatureFlags, string>> = {
  // https://gitlab.com/gitlab-org/gitlab/-/issues/468627
  [InstanceFeatureFlags.DuoWorkflow]: '18.2.0',
  // https://gitlab.com/gitlab-org/gitlab/-/issues/464767
  [InstanceFeatureFlags.EditorAdvancedContext]: '17.4.0',
  // https://gitlab.com/gitlab-org/gitlab/-/issues/462750
  [InstanceFeatureFlags.CodeSuggestionsContext]: '17.4.0',
  // https://gitlab.com/gitlab-org/gitlab/-/issues/548612
  [InstanceFeatureFlags.UseDuoContextExclusion]: '18.5.0',
  // See https://gitlab.com/gitlab-org/gitlab/-/issues/569140#note_2836076107
  [InstanceFeatureFlags.UserModelSwitching]: '18.7.0',
  // https://gitlab.com/gitlab-org/gitlab/-/work_items/600944
  [InstanceFeatureFlags.SoftwareDevelopmentFlowRegistry]: '19.2.0',
};
