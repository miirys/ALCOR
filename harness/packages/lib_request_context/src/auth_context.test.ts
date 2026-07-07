import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabUser, UserService, GitLabApiService } from '@gitlab-org/core';
import { DefaultAuthContext } from './auth_context';

describe('AuthContext', () => {
  it('returns user info', () => {
    const userService = createFakePartial<UserService>({
      user: createFakePartial<GitLabUser>({
        name: 'Test User',
        username: 'testuser',
        restId: 123,
      }),
    });

    const apiClient = createFakePartial<GitLabApiService>({
      tokenInfo: {
        scopes: ['api', 'read-user'],
        type: 'pat',
      },
    });

    const context = new DefaultAuthContext(userService, apiClient);

    expect(context.name).toBe('Authentication');
    expect(context.children).toEqual([
      {
        name: 'User',
        value: 'Test User (@testuser, id: 123)',
      },
      {
        name: 'Token',
        value: 'type: pat, scopes: api,read-user',
      },
    ]);
  });
});
