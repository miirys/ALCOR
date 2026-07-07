import type { ConfigurationEntry } from '@gitlab-org/tui';

export type ConfigFieldKey = 'gitlabBaseUrl' | 'gitlabAuthToken';

type ConfigFieldMetadata = Pick<
  ConfigurationEntry,
  'displayName' | 'description' | 'defaultValue' | 'isSensitive'
>;

export const CONFIG_FIELD_METADATA: Record<ConfigFieldKey, ConfigFieldMetadata> = {
  gitlabBaseUrl: {
    displayName: '🔗 GitLab Instance URL',
    description: 'The URL of the GitLab instance to connect to.',
    defaultValue: 'https://gitlab.com',
    isSensitive: false,
  },
  gitlabAuthToken: {
    displayName: '🔖 GitLab Token',
    description: 'Personal Access Token (PAT) with `api` scope.',
    defaultValue: '',
    isSensitive: true,
  },
};
