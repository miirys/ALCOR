import { ServiceCollection } from '@gitlab/needle';
import { GitLabConnectionService } from './service';

export { GitLabConnectionService } from './service';
export type {
  GitLabConnectionInfo,
  GitLabConnectionStatus,
  GitLabInstanceInfo,
  GitLabProjectContext,
} from './types';
export { GITLAB_CONNECTION_WEBVIEW_ID, type GitLabConnectionMessages } from './contract';

export function registerWebviewGitLabConnectionServices(
  services: ServiceCollection,
): ServiceCollection {
  services.addClass(GitLabConnectionService);
  return services;
}
