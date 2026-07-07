import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { gql } from 'graphql-request';
import { GitLabApiService } from '../gitlab_api/service';
import type { GitLabGID } from '../utils/gid_utils';
import type { ProjectDetails } from './types/gitlab_project_details';

export interface ProjectService {
  getProjectFromPathWithNamespace(projectPathWithNamespace: string): Promise<ProjectDetails>;
  getProjectIdsFromPaths(projectPaths: string[]): Promise<{ id: GitLabGID; fullPath: string }[]>;
  filterToProjectsWithDuoEligible(
    projectIds: GitLabGID[],
  ): Promise<{ id: GitLabGID; fullPath: string }[]>;
}

export const ProjectService = createInterfaceId<ProjectService>('ProjectService');

@Injectable(ProjectService, [Logger, GitLabApiService])
export class DefaultProjectService {
  #gitlabApiService: GitLabApiService;

  #logger: Logger;

  constructor(logger: Logger, gitlabApi: GitLabApiService) {
    this.#gitlabApiService = gitlabApi;
    this.#logger = withPrefix(logger, '[ProjectService]');
  }

  async getProjectFromPathWithNamespace(projectPathWithNamespace: string): Promise<ProjectDetails> {
    this.#logger.debug(`Fetching details for project: ${projectPathWithNamespace}`);

    type GqlProjectDetailsResponse = {
      project: ProjectDetails;
    };

    const response = await this.#gitlabApiService.fetchFromApi<GqlProjectDetailsResponse>({
      type: 'graphql',
      query: gql`
        query getProjectDetails($fullPath: ID!) {
          project(fullPath: $fullPath) {
            id
            namespace {
              id
              rootNamespace {
                id
              }
            }
          }
        }
      `,
      variables: {
        fullPath: projectPathWithNamespace,
      },
    });

    return response.project;
  }

  /**
   * Fetches project IDs from GitLab API using project full paths.
   * @param projectPaths Array of project full paths (e.g., ['gitlab-org/gitlab'])
   * @returns Array of projects with their GitLab IDs and full paths
   */
  async getProjectIdsFromPaths(
    projectPaths: string[],
  ): Promise<{ id: GitLabGID; fullPath: string }[]> {
    type GqlProjectIdsResponse = {
      projects: {
        nodes: {
          id: GitLabGID;
          fullPath: string;
        }[];
      };
    };

    const response = await this.#gitlabApiService.fetchFromApi<GqlProjectIdsResponse>({
      type: 'graphql',
      query: gql`
        query getProjectIds($fullPaths: [String!]!) {
          projects(fullPaths: $fullPaths) {
            nodes {
              id
              fullPath
            }
          }
        }
      `,
      variables: {
        fullPaths: projectPaths,
      },
    });

    return response.projects.nodes;
  }

  /**
   * Checks which projects are duo eligible and returns only those projects.
   * @param projectIds Array of GitLab project IDs
   * @returns Array of projects that are duo eligible
   */
  async filterToProjectsWithDuoEligible(
    projectIds: GitLabGID[],
  ): Promise<{ id: GitLabGID; fullPath: string }[]> {
    type GqlDuoEligibleProjectsResponse = {
      projects: {
        nodes: {
          id: GitLabGID;
          fullPath: string;
        }[];
      };
    };

    try {
      const response = await this.#gitlabApiService.fetchFromApi<GqlDuoEligibleProjectsResponse>({
        type: 'graphql',
        query: gql`
          query getDuoEligibleProjects($ids: [ID!]!, $withDuoEligible: Boolean!) {
            projects(ids: $ids, withDuoEligible: $withDuoEligible) {
              nodes {
                id
                fullPath
              }
            }
          }
        `,
        variables: {
          ids: projectIds,
          withDuoEligible: true,
        },
      });

      return response.projects.nodes;
    } catch (error) {
      this.#logger.debug('Failed to filter duo eligible projects, returning empty array', error);
      return [];
    }
  }
}
