import { createInterfaceId, Injectable } from '@gitlab/needle';
import { gql } from 'graphql-request';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RepositoryService } from '@gitlab-org/repositories';
import type { GitLabGID } from '@gitlab-org/core';
import type { IssuableDetails } from './index';

// Note this is an incomplete type definition, only properties actually in use are included.
// See: https://docs.gitlab.com/api/search/#scope-merge_requests for full schema
export type RestMergeRequestSearchResult = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  web_url: string;
};

export type MergeRequestDiffDetails = {
  oldPath: string;
  newPath: string;
  diff: string;
};

type MergeRequestCommit = {
  diffs: MergeRequestDiffDetails[];
};

export interface MergeRequestDetails extends IssuableDetails {
  commits: {
    nodes: MergeRequestCommit[];
  };
}

export interface MergeRequestService {
  searchMergeRequests(searchTerm: string, limit?: number): Promise<RestMergeRequestSearchResult[]>;
  getCurrentUsersMergeRequests(limit?: number): Promise<RestMergeRequestSearchResult[]>;
  getMergeRequestDetails(mergeRequestId: GitLabGID): Promise<MergeRequestDetails>;
  getMergeRequestForCurrentBranch(limit?: number): Promise<RestMergeRequestSearchResult[]>;
}

export const MergeRequestService = createInterfaceId<MergeRequestService>('MergeRequestService');

@Injectable(MergeRequestService, [Logger, GitLabApiService, RepositoryService])
export class DefaultMergeRequestService {
  #gitlabApiService: GitLabApiService;

  #repositoryService: RepositoryService;

  #logger: Logger;

  constructor(logger: Logger, gitlabApi: GitLabApiService, repositoryService: RepositoryService) {
    this.#gitlabApiService = gitlabApi;
    this.#repositoryService = repositoryService;
    this.#logger = withPrefix(logger, '[MergeRequestService]');
  }

  async searchMergeRequests(
    searchTerm: string,
    limit: number = 25,
  ): Promise<RestMergeRequestSearchResult[]> {
    this.#logger.debug(`Searching mergeRequests with query: ${searchTerm}`);

    try {
      const mergeRequests = await this.#gitlabApiService.fetchFromApi<
        RestMergeRequestSearchResult[]
      >({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/search',
        searchParams: {
          scope: 'merge_requests',
          search: searchTerm,
          fields: 'title',
        },
      });

      this.#logger.debug(`Search found ${mergeRequests.length} results. Max allowed: ${limit}`);

      return mergeRequests.slice(0, limit);
    } catch (error) {
      this.#logger.error(`Error searching mergeRequests with query "${searchTerm}"`, error);
      throw error;
    }
  }

  async getMergeRequestForCurrentBranch(limit = 25): Promise<RestMergeRequestSearchResult[]> {
    this.#logger.debug(`Fetching MRs for current branch`);
    const repository = this.#repositoryService.getRepositoryForActiveDocument();
    if (!repository) {
      this.#logger.debug(`No repository for current document, skipping search.`);
      return [];
    }

    const currentBranch = await repository.getTrackingBranchName();
    if (!currentBranch) {
      this.#logger.debug(`Could not determine current branch, skipping search.`);
      return [];
    }

    return this.#getOpenMergeRequestsForBranch(currentBranch, limit);
  }

  async #getOpenMergeRequestsForBranch(
    branchName: string,
    limit: number = 25,
  ): Promise<RestMergeRequestSearchResult[]> {
    this.#logger.debug(`Fetching MRs for branch "${branchName}"`);

    try {
      const mergeRequests = await this.#gitlabApiService.fetchFromApi<
        RestMergeRequestSearchResult[]
      >({
        type: 'rest',
        method: 'GET',
        path: `/api/v4/merge_requests`,
        searchParams: { state: 'opened', source_branch: branchName },
      });

      this.#logger.debug(`Found ${mergeRequests.length} results for branch. Max allowed: ${limit}`);

      return mergeRequests.slice(0, limit);
    } catch (error) {
      this.#logger.error('Error fetching MRs for branch', error);
      throw error;
    }
  }

  async getCurrentUsersMergeRequests(limit: number = 25): Promise<RestMergeRequestSearchResult[]> {
    this.#logger.debug('Fetching MRs assigned to current user');

    try {
      const mergeRequests = await this.#gitlabApiService.fetchFromApi<
        RestMergeRequestSearchResult[]
      >({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/merge_requests',
        searchParams: {
          scope: 'assigned_to_me',
          state: 'opened',
          order_by: 'updated_at',
          sort: 'desc',
          per_page: limit.toString(),
        },
      });

      this.#logger.debug(`Found ${mergeRequests.length} results. Max allowed: ${limit}`);

      return mergeRequests;
    } catch (error) {
      this.#logger.error('Error fetching MRs for current user', error);
      throw error;
    }
  }

  async getMergeRequestDetails(mergeRequestId: GitLabGID): Promise<MergeRequestDetails> {
    this.#logger.debug(`Fetching MR details: ${mergeRequestId}`);

    try {
      const { mergeRequest } = await this.#gitlabApiService.fetchFromApi<{
        mergeRequest: MergeRequestDetails;
      }>({
        type: 'graphql',
        query: gql`
          query getMergeRequestDetails($id: MergeRequestID!) {
            mergeRequest(id: $id) {
              title
              description
              state
              webUrl
              commits(first: 1) {
                nodes {
                  diffs {
                    oldPath
                    newPath
                    diff
                  }
                }
              }
              discussions(first: 100) {
                nodes {
                  notes(first: 100) {
                    nodes {
                      body
                      author {
                        username
                      }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          id: mergeRequestId,
        },
      });

      this.#logger.debug(`Found MR details:\n${JSON.stringify(mergeRequest)}`);

      return mergeRequest;
    } catch (error) {
      this.#logger.error(`Error fetching MR details: ${mergeRequestId}`, error);
      throw error;
    }
  }
}
