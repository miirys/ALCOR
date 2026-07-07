/*
 * Disabling prefer-as-const rule because API Extractor throws
 * "Unable to follow symbol for const" errors when using 'as const'.
 * Using explicit type annotations as a workaround.
 */
/* eslint-disable @typescript-eslint/prefer-as-const */
export const AUTHENTICATION: 'authentication' = 'authentication';
export const CODE_SUGGESTIONS: 'code_suggestions' = 'code_suggestions';
export const CHAT: 'chat' = 'chat';
export const CHAT_TERMINAL_CONTEXT: 'chat_terminal_context' = 'chat_terminal_context';
export const AGENTIC_CHAT: 'agentic_chat' = 'agentic_chat';
export const AGENT_PLATFORM: 'agent_platform' = 'agent_platform';
export const FLOWS: 'flows' = 'flows';
export const SANDBOX: 'sandbox' = 'sandbox';

export type Feature =
  | typeof AUTHENTICATION
  | typeof CODE_SUGGESTIONS
  | typeof CHAT
  | typeof CHAT_TERMINAL_CONTEXT
  | typeof AGENTIC_CHAT
  | typeof AGENT_PLATFORM
  | typeof FLOWS
  | typeof SANDBOX;

export interface UnsupportedGitLabVersionCheckContext {
  version: string;
  baseUrl: string;
}

export type SandboxPlatform = 'macos' | 'linux' | 'windows' | 'unsupported';

export interface SandboxMissingDependency {
  name: string;
  installHint: string;
}

export interface SandboxUnsupportedPlatformCheckContext {
  platform: 'windows' | 'unsupported';
}

export interface SandboxMissingDependenciesCheckContext {
  platform: SandboxPlatform;
  missingDependencies: SandboxMissingDependency[];
  providerVersion?: string;
}

export const AUTHENTICATION_REQUIRED: 'authentication-required' = 'authentication-required';
export const INVALID_TOKEN: 'invalid-token' = 'invalid-token';
export const SUGGESTIONS_AUTHENTICATION_REQUIRED: 'code-suggestions-authentication-required' =
  'code-suggestions-authentication-required';
export const SUGGESTIONS_NO_LICENSE: 'code-suggestions-no-license' = 'code-suggestions-no-license';
export const CHAT_AUTHENTICATION_REQUIRED: 'chat-authentication-required' =
  'chat-authentication-required';
export const CHAT_NO_LICENSE: 'chat-no-license' = 'chat-no-license';
export const DUO_DISABLED_FOR_PROJECT: 'duo-disabled-for-project' = 'duo-disabled-for-project';
export const UNSUPPORTED_GITLAB_VERSION: 'code-suggestions-unsupported-gitlab-version' =
  'code-suggestions-unsupported-gitlab-version';
export const UNSUPPORTED_LANGUAGE: 'code-suggestions-document-unsupported-language' =
  'code-suggestions-document-unsupported-language';
export const DISABLED_LANGUAGE: 'code-suggestions-document-disabled-language' =
  'code-suggestions-document-disabled-language';
export const SUGGESTIONS_API_ERROR: 'code-suggestions-api-error' = 'code-suggestions-api-error';
export const SUGGESTIONS_NO_DEFAULT_NAMESPACE: 'code-suggestions-no-default-namespace' =
  'code-suggestions-no-default-namespace';
export const SUGGESTIONS_NO_CREDITS: 'code-suggestions-no-credits' = 'code-suggestions-no-credits';
export const CHAT_DISABLED_BY_USER: 'chat-disabled-by-user' = 'chat-disabled-by-user';
export const SUGGESTIONS_DISABLED_BY_USER: 'code-suggestions-disabled-by-user' =
  'code-suggestions-disabled-by-user';
export const SUGGESTIONS_FILE_EXCLUDED: 'code-suggestions-file-excluded' =
  'code-suggestions-file-excluded';
export const CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE: 'chat-include-terminal-context-unavailable' =
  'chat-include-terminal-context-unavailable';
export const AGENT_PLATFORM_DISABLED_BY_USER: 'agent-platform-disabled-by-user' =
  'agent-platform-disabled-by-user';
export const AGENTIC_CHAT_NO_SUPPORT: 'agentic-chat-no-support' = 'agentic-chat-no-support';
export const CLASSIC_CHAT_NO_LICENSE: 'classic-chat-no-license' = 'classic-chat-no-license';
export const FLOWS_INSTANCE_FLAG_DISABLED: 'flows-instance-flag-disabled' =
  'flows-instance-flag-disabled';
export const SANDBOX_DISABLED_BY_USER: 'sandbox-disabled-by-user' = 'sandbox-disabled-by-user';
export const SANDBOX_UNSUPPORTED_PLATFORM: 'sandbox-unsupported-platform' =
  'sandbox-unsupported-platform';
export const SANDBOX_MISSING_DEPENDENCIES: 'sandbox-missing-dependencies' =
  'sandbox-missing-dependencies';

export type StateCheckContextMap = {
  [UNSUPPORTED_GITLAB_VERSION]: UnsupportedGitLabVersionCheckContext;
  [SANDBOX_UNSUPPORTED_PLATFORM]: SandboxUnsupportedPlatformCheckContext;
  [SANDBOX_MISSING_DEPENDENCIES]: SandboxMissingDependenciesCheckContext;
};

export type StateCheckId =
  | typeof AUTHENTICATION_REQUIRED
  | typeof SUGGESTIONS_AUTHENTICATION_REQUIRED
  | typeof CHAT_AUTHENTICATION_REQUIRED
  | typeof INVALID_TOKEN
  | typeof SUGGESTIONS_NO_LICENSE
  | typeof CHAT_NO_LICENSE
  | typeof DUO_DISABLED_FOR_PROJECT
  | typeof UNSUPPORTED_GITLAB_VERSION
  | typeof UNSUPPORTED_LANGUAGE
  | typeof SUGGESTIONS_API_ERROR
  | typeof SUGGESTIONS_NO_DEFAULT_NAMESPACE
  | typeof SUGGESTIONS_NO_CREDITS
  | typeof DISABLED_LANGUAGE
  | typeof CHAT_DISABLED_BY_USER
  | typeof SUGGESTIONS_DISABLED_BY_USER
  | typeof SUGGESTIONS_FILE_EXCLUDED
  | typeof CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE
  | typeof AGENT_PLATFORM_DISABLED_BY_USER
  | typeof CLASSIC_CHAT_NO_LICENSE
  | typeof AGENTIC_CHAT_NO_SUPPORT
  | typeof FLOWS_INSTANCE_FLAG_DISABLED
  | typeof SANDBOX_DISABLED_BY_USER
  | typeof SANDBOX_UNSUPPORTED_PLATFORM
  | typeof SANDBOX_MISSING_DEPENDENCIES;

export type StateCheckContext<T extends StateCheckId> = T extends keyof StateCheckContextMap
  ? StateCheckContextMap[T]
  : never;

export interface FeatureStateCheck<T extends StateCheckId> {
  checkId: T;
  label?: string;
  disabledLabel?: string;
  details?: string;
  context?: StateCheckContext<T>;
  engaged: boolean;
}

export interface FeatureState {
  featureId: Feature;
  // @deprecated this prop is deprecated. Use `allChecks` instead
  engagedChecks: FeatureStateCheck<StateCheckId>[];
  allChecks: FeatureStateCheck<StateCheckId>[];
}

// the first item in the array will have the highest priority
export const AUTHENTICATION_CHECK_PRIORITY_ORDERED = [AUTHENTICATION_REQUIRED];

export const CODE_SUGGESTIONS_CHECKS_PRIORITY_ORDERED = [
  ...AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  SUGGESTIONS_DISABLED_BY_USER,
  SUGGESTIONS_API_ERROR, // TODO: remove this once we have a proper API health check
  UNSUPPORTED_GITLAB_VERSION,
  SUGGESTIONS_NO_LICENSE,
  SUGGESTIONS_NO_DEFAULT_NAMESPACE,
  SUGGESTIONS_NO_CREDITS,
  DUO_DISABLED_FOR_PROJECT,
  SUGGESTIONS_FILE_EXCLUDED,
  UNSUPPORTED_LANGUAGE,
  DISABLED_LANGUAGE,
];
export const CHAT_CHECKS_PRIORITY_ORDERED = [
  ...AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  CHAT_DISABLED_BY_USER,
  CLASSIC_CHAT_NO_LICENSE,
  CHAT_NO_LICENSE,
  DUO_DISABLED_FOR_PROJECT,
];

export const AGENTIC_CHAT_CHECKS_PRIORITY_ORDERED = [
  ...AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  AGENTIC_CHAT_NO_SUPPORT,
];

export const FLOWS_CHECKS_PRIORITY_ORDERED = [
  ...AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  FLOWS_INSTANCE_FLAG_DISABLED,
];

export const AGENT_PLATFORM_CHECKS_PRIORITY_ORDERED = [
  ...AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  AGENT_PLATFORM_DISABLED_BY_USER,
];

// Sandbox runs locally and its availability is independent of GitLab auth,
// so we deliberately omit AUTHENTICATION_CHECK_PRIORITY_ORDERED here. Order
// is most-fundamental-first so Windows users don't see "disabled" as the
// primary state when the real blocker is platform support.
export const SANDBOX_CHECKS_PRIORITY_ORDERED = [
  SANDBOX_UNSUPPORTED_PLATFORM,
  SANDBOX_MISSING_DEPENDENCIES,
  SANDBOX_DISABLED_BY_USER,
];

export const CHECKS_PER_FEATURE: { [key in Feature]: StateCheckId[] } = {
  [AUTHENTICATION]: AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  [CODE_SUGGESTIONS]: CODE_SUGGESTIONS_CHECKS_PRIORITY_ORDERED,
  [CHAT]: CHAT_CHECKS_PRIORITY_ORDERED,
  [CHAT_TERMINAL_CONTEXT]: [
    ...CHAT_CHECKS_PRIORITY_ORDERED,
    CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
  ],
  [AGENTIC_CHAT]: AGENTIC_CHAT_CHECKS_PRIORITY_ORDERED,
  [AGENT_PLATFORM]: AGENT_PLATFORM_CHECKS_PRIORITY_ORDERED,
  [FLOWS]: FLOWS_CHECKS_PRIORITY_ORDERED,
  [SANDBOX]: SANDBOX_CHECKS_PRIORITY_ORDERED,
};

export const STATE_CHECK_USER_READABLE_LABELS: Record<StateCheckId, string> = {
  [AUTHENTICATION_REQUIRED]: 'User is authenticated',
  [INVALID_TOKEN]: 'Token is valid',
  [SUGGESTIONS_AUTHENTICATION_REQUIRED]: 'User is authenticated',
  [SUGGESTIONS_NO_LICENSE]: 'Valid GitLab license',
  [CHAT_AUTHENTICATION_REQUIRED]: 'User is authenticated',
  [CHAT_NO_LICENSE]: 'Valid GitLab license',
  [DUO_DISABLED_FOR_PROJECT]: 'GitLab Duo is enabled for the open project(s)',
  [UNSUPPORTED_GITLAB_VERSION]: 'The GitLab instance version supports Code Suggestions',
  [UNSUPPORTED_LANGUAGE]: "Code suggestions are supported for the current file's language",
  [DISABLED_LANGUAGE]: "Code suggestions are enabled for the current file's language",
  [SUGGESTIONS_API_ERROR]: 'Code Suggestions API connection is working',
  [SUGGESTIONS_NO_DEFAULT_NAMESPACE]: 'User has selected a default GitLab Duo namespace',
  [SUGGESTIONS_NO_CREDITS]:
    'User has enough credits to continue Code Suggestions usage for this billing period',
  [CHAT_DISABLED_BY_USER]: 'Non-Agentic Chat is enabled in settings',
  [SUGGESTIONS_DISABLED_BY_USER]: 'Code Suggestions is enabled in settings',
  [SUGGESTIONS_FILE_EXCLUDED]: 'Current file is not excluded by project exclusion rules',
  [CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE]: 'Include terminal context is enabled for user',
  [AGENT_PLATFORM_DISABLED_BY_USER]: 'Agent Platform is enabled in settings',
  [AGENTIC_CHAT_NO_SUPPORT]: 'Agentic Chat is supported for the current project',
  [CLASSIC_CHAT_NO_LICENSE]: 'Classic Chat is available with the current GitLab Duo license',
  [FLOWS_INSTANCE_FLAG_DISABLED]: 'Flows feature flag is enabled on the GitLab instance',
  [SANDBOX_DISABLED_BY_USER]: 'Process sandboxing is enabled in settings',
  [SANDBOX_UNSUPPORTED_PLATFORM]: 'Process sandboxing is supported on this platform',
  [SANDBOX_MISSING_DEPENDENCIES]:
    'System dependencies required for process sandboxing are installed',
};

export const STATE_CHECK_DISABLED_LABELS: Partial<Record<StateCheckId, string>> = {
  [AUTHENTICATION_REQUIRED]: 'Authentication Required',
  [SUGGESTIONS_AUTHENTICATION_REQUIRED]: 'Authentication Required',
  [CHAT_AUTHENTICATION_REQUIRED]: 'Authentication Required',
  [INVALID_TOKEN]: 'Invalid Token',
  [SUGGESTIONS_NO_LICENSE]: 'Invalid License',
  [CHAT_NO_LICENSE]: 'Invalid License',
  [CLASSIC_CHAT_NO_LICENSE]: 'Invalid License',
  [SUGGESTIONS_NO_DEFAULT_NAMESPACE]: 'No Default Namespace Selected',
  [SUGGESTIONS_NO_CREDITS]: 'Out of GitLab Credits',
  [DUO_DISABLED_FOR_PROJECT]: 'GitLab Duo Disabled for Project',
  [UNSUPPORTED_GITLAB_VERSION]: 'Unsupported GitLab Version',
  [UNSUPPORTED_LANGUAGE]: 'Unsupported Language',
  [SUGGESTIONS_API_ERROR]: 'API Error',
  [DISABLED_LANGUAGE]: 'Disabled for Language',
  [SUGGESTIONS_DISABLED_BY_USER]: 'Disabled by User',
  [SUGGESTIONS_FILE_EXCLUDED]: 'File Excluded',
};
