export const DEFAULT_DOCKER_IMAGE =
  'registry.gitlab.com/gitlab-org/duo-workflow/default-docker-image/workflow-generic-image:v0.0.4';

export const INVALID_GITLAB_PROJECT = 'invalid_gitlab_project';
export const PERMISSIONS_ERROR = 'permissions_error';
export const USER_PERMISSIONS_ERROR = 'user_permissions_error';
export const AUTHENTICATION_ERROR = 'authentication_error';
export const DOCKER_CONFIGURATION_ERROR = 'docker_configuration_error';
export const AGENTIC_FEATURES_DISABLED = 'agentic_features_disabled';
export const UNKNOWN_ERROR = 'unknown_error';

export const DEVELOPER_ACCESS_CHECK = 'developer_access';

export const toolApprovalTypes = {
  APPROVE_TOOL_ONCE: 'approve-tool-once',
  APPROVE_FOR_SESSION: 'approve-for-session',
  APPROVE_PATTERN_FOR_SESSION: 'approve-pattern-for-session',
};

export const MODE_PARAM = 'mode';
export const CHAT_MODE = 'chat-mode';
export const FLOW_MODE = 'flow-mode';
export const ALLOWED_MODES = [CHAT_MODE, FLOW_MODE];

export const predefinedChatPrompts = [
  'How do I change my password in GitLab?',
  'Can you summarize the code in this file?',
  'How can I make this code more efficient?',
  'Are there any bugs in this code',
  'Create documentation for this code',
  'Explain this function step by step',
  'Write unit tests for this function',
  'Add error handling to this code',
  'Make this code more readable',
  'Find performance bottlenecks in this code',
  'Generate a commit message for these changes',
  'Optimize this SQL query',
  'Suggest improvements for this code',
  'How can I organize projects effectively in GitLab?',
  'How do I manage environment variables?',
  'How do I securely store secrets in GitLab CI/CD?',
  'How do I make my CI pipelines run faster?',
  'How do I debug issues with GitLab runners?',
  'How do I set up quality gates in my pipeline?',
  'How should I structure complex epics?',
];

export const predefinedFlowPrompts = [
  'Are there any bugs in this code?',
  'Create documentation for this code',
  'Explain this file step by step',
  'Write unit tests for this file',
  'Ensure we have thorough error handling for this code',
  'Make this code more readable',
  'Find top performance bottlenecks in this repository',
  'Suggest improvements for this code',
];
