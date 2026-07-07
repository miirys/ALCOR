import { createInterfaceId, Injectable } from '@gitlab/needle';
import { gql } from 'graphql-request';
import { uniq } from 'lodash';
import { GitLabGID, toGitLabGid, tryParseGitLabGid } from '@gitlab-org/core';
import { GitLabApiClient } from '../../api';
import { GitLabProjectId } from '../../api_types';
import { log } from '../../log';

export interface DuoApiProjectAccessGqlResponse {
  projects: {
    edges: {
      node: {
        id: GitLabGID;
        duoFeaturesEnabled: boolean;
      };
    }[];
  };
}

export interface DuoApiProjectAccessCache {
  getEnabledForProjects(projectIds: GitLabProjectId[]): Promise<Record<GitLabProjectId, boolean>>;
}

export const DuoApiProjectAccessCache = createInterfaceId<DuoApiProjectAccessCache>(
  'DuoApiProjectAccessCache',
);

@Injectable(DuoApiProjectAccessCache, [GitLabApiClient])
export class DefaultDuoApiProjectAccessCache implements DuoApiProjectAccessCache {
  #duoProjects: Record<GitLabProjectId, boolean>;

  #gitlabApiClient: GitLabApiClient;

  constructor(gitlabApiClient: GitLabApiClient) {
    this.#gitlabApiClient = gitlabApiClient;
    this.#duoProjects = {};

    // Ensure switching GitLab instances / tokens etc does not result in stale cache data
    this.#gitlabApiClient.onApiReconfigured(() => {
      this.#duoProjects = {};
    });
  }

  async getEnabledForProjects(
    projectIds: GitLabProjectId[],
  ): Promise<Record<GitLabProjectId, boolean>> {
    const missingFromCache = uniq(projectIds.filter((id) => !this.#duoProjects[id]));
    if (missingFromCache.length) {
      log.debug(
        `[DuoApiProjectAccessCache] checking the following projects for Duo Access: ${JSON.stringify(missingFromCache)}`,
      );
      const statuses = await this.#checkDuoFeaturesEnabled(missingFromCache);
      this.#duoProjects = { ...this.#duoProjects, ...statuses };
    }

    return projectIds.reduce(
      (result, projectId) => {
        return {
          ...result,
          [projectId]: this.#duoProjects[projectId] || false,
        };
      },
      {} satisfies Record<GitLabProjectId, boolean>,
    );
  }

  async #checkDuoFeaturesEnabled(
    projectIds: GitLabProjectId[],
  ): Promise<Record<GitLabProjectId, boolean>> {
    try {
      const { projects } = await this.#gitlabApiClient.fetchFromApi<DuoApiProjectAccessGqlResponse>(
        {
          type: 'graphql',
          query: gql`
            query GetProjectsDuoEnabledStatusById($projectIds: [ID!]!) {
              projects(ids: $projectIds) {
                edges {
                  node {
                    id
                    duoFeaturesEnabled
                  }
                }
              }
            }
          `,
          variables: {
            projectIds: projectIds.map((id) => toGitLabGid('Project', id)),
          },
        },
      );

      return projects.edges.reduce((acc, edge) => {
        const id = tryParseGitLabGid(edge.node.id);
        // unexpected/invalid ID. Exclude this project from statuses (project will not be enabled)
        if (!id) return acc;

        return {
          ...acc,
          [id]: edge.node.duoFeaturesEnabled,
        };
      }, {});
    } catch (error) {
      log.error(
        `[DuoApiProjectAccessCache] Failed to check if Duo features are enabled for projects: ${projectIds}`,
        error,
      );
      return {};
    }
  }
}
