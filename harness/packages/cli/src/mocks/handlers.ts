import { http, graphql, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://registry.npmjs.org/@gitlab%2Fduo-cli/latest', () =>
    HttpResponse.json({ version: '0.0.0' }),
  ),

  http.get('https://gitlab.example.com/api/v4/personal_access_tokens/self', () =>
    HttpResponse.json({ scopes: ['api'] }),
  ),
  http.get('https://gitlab.example.com/oauth/token/info', () =>
    HttpResponse.json({ scope: ['api'] }),
  ),
  http.get('https://gitlab.example.com/api/v4/version', () =>
    HttpResponse.json({ version: '18.1.0' }),
  ),
  graphql.query('getUser', () => {
    return HttpResponse.json({
      data: {
        currentUser: {
          id: 'gid://gitlab/gitlab-org/gitlab/1234',
          username: 'johndoe',
          name: 'J. Ohn Doe',
          avatarUrl: 'https://gitlab.example.com/johndoe.jpg',
          webUrl: 'https://gitlab.example.com/johndoe',
          userPreferences: {
            duoDefaultNamespace: {
              id: 'gid://gitlab/Group/12345',
              fullPath: 'johndoe-namespace',
            },
          },
        },
      },
    });
  }),
  http.get('https://gitlab.example.com/api/v4/groups/:namespace', () =>
    HttpResponse.json({ experiment_features_enabled: true }),
  ),
  graphql.query('featureFlagEnabled', () => {
    return HttpResponse.json({
      data: {
        featureFlagEnabled: true,
      },
    });
  }),
  graphql.query('featureFlagsEnabled', ({ variables }) => {
    const { names } = variables as { names: string[] };
    return HttpResponse.json({
      data: {
        metadata: {
          featureFlags: names.map((name) => ({
            name,
            enabled: true,
          })),
        },
      },
    });
  }),
  graphql.query('agenticChatAvailable', () => {
    return HttpResponse.json({
      data: {
        project: {
          duoAgenticChatAvailable: true,
        },
      },
    });
  }),
  http.post('https://gitlab.example.com/api/v4/ai/duo_workflows/direct_access', () =>
    HttpResponse.json({
      gitlab_rails: {
        base_url: 'https://gitlab.example.com',
        token: 'test-gitlab-rails-token',
        token_expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
      },
      duo_workflow_service: {
        base_url: 'workflow-service.url',
        token: 'test-workflow-service-token',
        token_expires_at: Date.now() + 3600000,
        secure: true,
        headers: {},
      },
    }),
  ),
  http.post('https://gitlab.example.com/api/v4/ai/duo_workflows/workflows', () =>
    HttpResponse.json({
      id: 'test-workflow-id',
      project_id: 'gitlab-org/gitlab',
      goal: '',
      workflow_definition: 'chat',
      environment: 'ide',
    }),
  ),
  http.post('https://snowplowprd.trx.gitlab.net/com.snowplowanalytics.snowplow/tp2', () =>
    HttpResponse.json(),
  ),
];
