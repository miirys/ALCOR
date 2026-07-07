import { Injectable } from '@gitlab/needle';
import { DuoChatAIRequest } from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  type GitLabGID,
  GitLabApiService,
  ifVersionGte,
  tryParseGitLabGid,
} from '@gitlab-org/core';
import { gql } from 'graphql-request';
import { GitLabProjectId } from '../../../api_types';
import {
  type RepositoryContextItemResult,
  RepositoryContextItemStrategy,
} from './workspace_repository_context_item_strategy';

interface GqlAiChatIncludedProjectsResponse {
  aiChatIncludedProjects: {
    nodes: {
      id: GitLabGID;
      name: string;
      fullPath: string;
      webUrl: string;
      description: string;
    }[];
  };
}

/**
 * Strategy for retrieving repository data from the GitLab API using aiChatIncludedProjects.
 * This strategy is available for GitLab instances version 18.8 and above.
 * It fetches projects directly from the API instead of searching local workspace repositories.
 */
@Injectable(RepositoryContextItemStrategy, [GitLabApiService, Logger])
export class RemoteRepositoryContextItemStrategy implements RepositoryContextItemStrategy {
  readonly #gitlabApiService: GitLabApiService;

  readonly #logger: Logger;

  constructor(gitlabApiService: GitLabApiService, logger: Logger) {
    this.#gitlabApiService = gitlabApiService;
    this.#logger = withPrefix(logger, '[RemoteRepositoryContextItemStrategy]');
  }

  getMinimumVersion(): string | null {
    return '18.8.0';
  }

  /**
   * Remote strategy is supported only on GitLab instances version 18.8 and above.
   * The aiChatIncludedProjects query was introduced in GitLab 18.8.
   */
  isSupported(): boolean {
    const instanceVersion = this.#gitlabApiService.instanceInfo?.instanceVersion;
    if (!instanceVersion) {
      this.#logger.debug('Instance version not available, remote strategy not supported');
      return false;
    }

    const minimumVersion = this.getMinimumVersion();
    if (!minimumVersion) {
      return false;
    }

    const isSupported = ifVersionGte(
      instanceVersion,
      minimumVersion,
      () => true,
      () => false,
    );
    this.#logger.debug(
      `Instance version ${instanceVersion}, remote strategy supported: ${isSupported}`,
    );

    return isSupported;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getInitialRepositories(_query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]> {
    this.#logger.debug('getting initial repositories from remote API');
    return this.#fetchProjectsFromApi('');
  }

  async searchRepositories(query: DuoChatAIRequest): Promise<RepositoryContextItemResult[]> {
    this.#logger.debug('searching repositories remotely with query:', query.query);
    const searchTerm = query.query.trim() || '';
    return this.#fetchProjectsFromApi(searchTerm);
  }

  /**
   * Fetches projects from the GitLab API using the aiChatIncludedProjects query.
   * @param searchTerm Search string to filter projects (empty string returns all)
   * @returns Array of repository context item results
   */
  async #fetchProjectsFromApi(searchTerm: string): Promise<RepositoryContextItemResult[]> {
    try {
      const response = await this.#gitlabApiService.fetchFromApi<GqlAiChatIncludedProjectsResponse>(
        {
          type: 'graphql',
          query: gql`
            query DuoIncludedProjects($search: String!) {
              aiChatIncludedProjects(search: $search) {
                nodes {
                  id
                  name
                  fullPath
                  webUrl
                  description
                }
              }
            }
          `,
          variables: {
            search: searchTerm,
          },
        },
      );

      const projects = response.aiChatIncludedProjects.nodes;
      this.#logger.debug(`Found ${projects.length} projects from remote API`);

      return projects
        .map((project) => {
          const numericId = tryParseGitLabGid(project.id);
          if (typeof numericId !== 'number') {
            this.#logger.warn(`Failed to parse project ID: ${project.id}`);
            return null;
          }

          return {
            id: project.id,
            name: project.name,
            pathWithNamespace: project.fullPath,
            webUrl: project.webUrl,
            description: project.description || '',
            numericId: numericId as GitLabProjectId,
          };
        })
        .filter((project): project is RepositoryContextItemResult => project !== null);
    } catch (error) {
      this.#logger.error('Failed to fetch projects from remote API', error);
      return [];
    }
  }
}
