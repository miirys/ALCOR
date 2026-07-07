import type { FeatureState } from '@gitlab-org/core';

export type GitLabConnectionStatus = 'connecting' | 'connected' | 'error';

export interface GitLabInstanceInfo {
  instanceUrl: string;
  instanceVersion: string;
}

export interface GitLabProjectContext {
  projectPath: string;
  namespacePath: string;
}

export interface GitLabConnectionInfo {
  status: GitLabConnectionStatus;
  instance: GitLabInstanceInfo | null;
  project: GitLabProjectContext | null;
  /** Human-readable reason when status is 'disconnected' or 'error' */
  reason: string | null;
  /** Per-feature state checks (authentication, licensing, feature flags, etc.) */
  featureStates: FeatureState[];
}
