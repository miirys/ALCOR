/* eslint-disable prefer-destructuring */
import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  GitLabUser,
  GraphQLRequest,
  GitLabApiService,
  GitLabGID,
  tryParseGitLabGid,
  tryParseGitLabGidToString,
} from '../index';
import { getUserAvatarUrl } from './get_user_avatar_url';

export interface UserService {
  readonly user?: GitLabUser;
  getUser(): Promise<GitLabUser>;
}

export const UserService = createInterfaceId<UserService>('UserService');

interface GqlCurrentUser {
  currentUser: {
    id: GitLabGID;
    username: string;
    name: string;
    avatarUrl: string;
    webUrl: string;
    userPreferences: {
      duoDefaultNamespace: {
        id: GitLabGID;
        fullName: string;
        fullPath: string;
      } | null;
    } | null;
  };
}

const getCurrentUserQuery: GraphQLRequest<GqlCurrentUser> = {
  type: 'graphql',
  query: gql`
    query getUser {
      currentUser {
        id
        username
        name
        avatarUrl
        webUrl
        userPreferences @gl_introduced(version: "18.10.0") {
          duoDefaultNamespace {
            id
            fullName
            fullPath
          }
        }
      }
    }
  `,
  variables: {},
};

@Injectable(UserService, [Logger, GitLabApiService])
export class DefaultUserService implements UserService, Disposable {
  #apiService: GitLabApiService;

  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #userPromise!: Promise<GitLabUser>;

  #userResolve?: (user: GitLabUser) => void;

  #userReject?: (error: unknown) => void;

  user?: GitLabUser;

  constructor(logger: Logger, apiService: GitLabApiService) {
    this.#apiService = apiService;
    this.#logger = withPrefix(logger, '[UserService]');
    this.#createUserPromise();

    this.#subscriptions.push(
      this.#apiService.onApiReconfigured(async (data) => {
        if (!data.isInValidState) {
          this.user = undefined;
          this.#createUserPromise();
          return;
        }

        try {
          const gqlUser = await this.#apiService.fetchFromApi<GqlCurrentUser>(getCurrentUserQuery);
          const currentUser = gqlUser.currentUser;
          const id = currentUser.id;
          const username = currentUser.username;
          const name = currentUser.name;
          const avatarUrlOrig = currentUser.avatarUrl;
          const webUrl = currentUser.webUrl;

          const avatarUrl = getUserAvatarUrl(avatarUrlOrig, webUrl);
          const restId = tryParseGitLabGid(id);
          if (!restId) throw new Error(`Failed to parse user GID into REST ID: "${id}"`);

          this.user = {
            id,
            restId,
            username,
            name,
            avatarUrl,
            duoDefaultNamespacePath: currentUser.userPreferences?.duoDefaultNamespace?.fullPath,
            duoDefaultNamespaceId:
              tryParseGitLabGidToString(currentUser.userPreferences?.duoDefaultNamespace?.id) ||
              undefined,
          };
          this.#logger.debug(`New user fetched: ${JSON.stringify(this.user)}`);

          this.#userResolve?.(this.user);
        } catch (e) {
          this.#logger.error('Failed to get user from API', e);
          this.user = undefined;

          this.#userReject?.(e);
        }
      }),
    );
  }

  async getUser(): Promise<GitLabUser> {
    if (this.user) {
      return this.user;
    }

    return this.#userPromise;
  }

  #createUserPromise(): void {
    this.#userPromise = new Promise<GitLabUser>((resolve, reject) => {
      this.#userResolve = resolve;
      this.#userReject = reject;
    });
  }

  dispose = () => this.#subscriptions.forEach((d) => d.dispose());
}
