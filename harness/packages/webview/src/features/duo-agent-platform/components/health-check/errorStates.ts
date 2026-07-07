import type { Component } from 'vue';
import { CircleAlert, FolderGit2, LogIn, Settings, UserX } from 'lucide-vue-next';
import {
  AGENTIC_FEATURES_DISABLED,
  AUTHENTICATION_ERROR,
  INVALID_GITLAB_PROJECT,
  PERMISSIONS_ERROR,
  UNKNOWN_ERROR,
  USER_PERMISSIONS_ERROR,
  type HealthCheckErrorState,
} from './constants';

interface ErrorStateView {
  icon: Component;
  title: string;
  description: string[];
}

// Keyed by the full error-state union so a new state is a compile error until its copy is added.
export const ERROR_STATES: Record<HealthCheckErrorState, ErrorStateView> = {
  [AUTHENTICATION_ERROR]: {
    icon: LogIn,
    title: 'Authentication required',
    description: [
      'Your GitLab authentication token is invalid, expired, or not set.',
      'Sign in to use GitLab Duo Agent Platform.',
    ],
  },
  [AGENTIC_FEATURES_DISABLED]: {
    icon: Settings,
    title: 'GitLab Duo Agentic features are disabled',
    description: [
      'GitLab Duo Agent Platform is not available. Make sure Duo Features are enabled in your project settings.',
    ],
  },
  [INVALID_GITLAB_PROJECT]: {
    icon: FolderGit2,
    title: 'Use with a GitLab project',
    description: [
      'GitLab Duo Agent Platform only works with GitLab projects that belong to a group namespace. To link your workspace folder to a GitLab project, open the Source Control view.',
    ],
  },
  [PERMISSIONS_ERROR]: {
    icon: Settings,
    title: 'Turn on for this project',
    description: ['Before you can use GitLab Duo Agent Platform, turn on the following settings.'],
  },
  [USER_PERMISSIONS_ERROR]: {
    icon: UserX,
    title: 'Unavailable to you',
    description: ['You must have at least the Developer role in this project.'],
  },
  [UNKNOWN_ERROR]: {
    icon: CircleAlert,
    title: 'GitLab Duo Agent Platform is disabled',
    description: [
      'Unable to validate the project permissions. This could be due to a network error or a misconfiguration. Please contact your GitLab administrator to fix this.',
    ],
  },
};
