import { NotificationType } from 'vscode-languageserver-protocol';
import { GetRepositoriesResponse, RepositoryEndpoints } from '@gitlab-org/core';

export const RepositoriesChangedNotificationType = new NotificationType<GetRepositoriesResponse>(
  RepositoryEndpoints.REPOSITORIES_CHANGED,
);
