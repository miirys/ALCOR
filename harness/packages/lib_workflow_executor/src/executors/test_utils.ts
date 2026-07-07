import { GenerateTokenResponse } from '../api/types';

export function getMockWorkflowToken(): GenerateTokenResponse {
  return {
    gitlab_rails: {
      base_url: 'https://gitlab.example.com',
      token: 'gitlab-rails-token',
      token_expires_at: new Date(Date.now() + 1800 * 1000).toISOString(), // 30 minutes
    },
    duo_workflow_service: {
      base_url: 'workflow-service.url',
      token: 'workflow-service-token',
      token_expires_at: Date.now() + 3600000,
      secure: true,
      headers: {
        'X-Gitlab-Language-Server-Version': '7.43.0',
        'X-Gitlab-Host-Name': 'gitlab.example.com',
        'X-Gitlab-Instance-Id': 'test-instance-id',
        'X-Gitlab-Realm': 'test-realm',
        'X-Gitlab-Version': '17.5.0',
        'X-Gitlab-Global-User-Id': 'test-user-123',
        'X-Gitlab-Feature-Enabled-By-Namespace-Ids': '{ 1: ["duo-workflow"]}',
        'X-Gitlab-Agent-Platform-Model-Metadata': 'test-model-metadata',
      },
    },
    workflow_metadata: {
      extended_logging: true,
      is_team_member: true,
    },
  };
}
