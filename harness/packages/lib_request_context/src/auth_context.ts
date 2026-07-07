import { createInterfaceId, Injectable } from '@gitlab/needle';
import { LogContext, logCtxItem } from '@gitlab-org/logging';
import { GitLabApiService, TokenInfo, UserService } from '@gitlab-org/core';

export interface AuthContext extends LogContext {
  user?: {
    name: string;
    username: string;
    id: number;
  };
  tokenInfo?: TokenInfo;
}

export const AuthContext = createInterfaceId<AuthContext>('AuthContext');

@Injectable(AuthContext, [UserService, GitLabApiService])
export class DefaultAuthContext implements AuthContext {
  #userService: UserService;

  #apiClient: GitLabApiService;

  constructor(userService: UserService, apiService: GitLabApiService) {
    this.#userService = userService;
    this.#apiClient = apiService;
  }

  get user() {
    // FIXME: using destructuring breaks the api-extractor
    // eslint-disable-next-line prefer-destructuring
    const user = this.#userService.user;
    if (!user) return undefined;
    return {
      name: user.name,
      username: user.username,
      id: user.restId,
    };
  }

  get tokenInfo() {
    return this.#apiClient.tokenInfo;
  }

  readonly name = 'Authentication';

  get children() {
    const userInfo = this.user
      ? `${this.user.name} (@${this.user.username}, id: ${this.user.id})`
      : 'not authenticated';
    const tokenInfo = this.tokenInfo
      ? `type: ${this.tokenInfo.type}, scopes: ${this.tokenInfo.scopes.join(',')}`
      : 'invalid or not present';
    return [logCtxItem('User', userInfo), logCtxItem('Token', tokenInfo)];
  }
}
