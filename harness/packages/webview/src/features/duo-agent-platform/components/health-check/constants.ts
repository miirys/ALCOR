export const AUTHENTICATION_ERROR = 'authentication_error';
export const AGENTIC_FEATURES_DISABLED = 'agentic_features_disabled';
export const INVALID_GITLAB_PROJECT = 'invalid_gitlab_project';
export const PERMISSIONS_ERROR = 'permissions_error';
export const USER_PERMISSIONS_ERROR = 'user_permissions_error';
export const UNKNOWN_ERROR = 'unknown_error';

export const LOADING = 'loading';
export const READY = 'ready';

export const DEVELOPER_ACCESS_CHECK = 'developer_access';

export type HealthCheckErrorState =
  | typeof AUTHENTICATION_ERROR
  | typeof AGENTIC_FEATURES_DISABLED
  | typeof INVALID_GITLAB_PROJECT
  | typeof PERMISSIONS_ERROR
  | typeof USER_PERMISSIONS_ERROR
  | typeof UNKNOWN_ERROR;

export type HealthCheckState = HealthCheckErrorState | typeof LOADING | typeof READY;
