import { createInterfaceId, Injectable } from '@gitlab/needle';
import { gql } from 'graphql-request';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { GitLabGID } from '@gitlab-org/core';
import type { IssuableDetails } from './index';

// Note this is an incomplete type definition, only properties actually in use are included.
// See: https://docs.gitlab.com/api/search/#scope-issues for full schema
export type RestIssueSearchResult = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  web_url: string;
};

export interface IssueDetails extends IssuableDetails {
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  confidential: boolean;
  userNotesCount: number;
  weight: number | null;
  milestone: {
    title: string;
  } | null;
  assignees: {
    nodes: {
      username: string;
    }[];
  };
  labels: {
    nodes: {
      title: string;
    }[];
  };
}

export interface IssueService {
  searchIssues(searchTerm: string, limit?: number): Promise<RestIssueSearchResult[]>;
  getCurrentUsersIssues(limit?: number): Promise<RestIssueSearchResult[]>;
  getIssueDetails(issueId: GitLabGID): Promise<IssueDetails>;
}

export const IssueService = createInterfaceId<IssueService>('IssueService');

@Injectable(IssueService, [Logger, GitLabApiService])
export class DefaultIssueService {
  #gitlabApiService: GitLabApiService;

  #logger: Logger;

  constructor(logger: Logger, gitlabApi: GitLabApiService) {
    this.#gitlabApiService = gitlabApi;
    this.#logger = withPrefix(logger, '[IssueService]');
  }

  async searchIssues(searchTerm: string, limit: number = 25): Promise<RestIssueSearchResult[]> {
    this.#logger.debug(`Searching issues with query: ${searchTerm}`);

    try {
      const issues = await this.#gitlabApiService.fetchFromApi<RestIssueSearchResult[]>({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/search',
        searchParams: {
          scope: 'issues',
          search: searchTerm,
          fields: 'title',
        },
      });

      this.#logger.debug(`Search found ${issues.length} results. Max allowed: ${limit}`);

      return issues.slice(0, limit);
    } catch (error) {
      this.#logger.error(`Error searching issues with query "${searchTerm}"`, error);
      throw error;
    }
  }

  async getCurrentUsersIssues(limit: number = 25): Promise<RestIssueSearchResult[]> {
    this.#logger.debug('Fetching issues assigned to current user');

    try {
      const issues = await this.#gitlabApiService.fetchFromApi<RestIssueSearchResult[]>({
        type: 'rest',
        method: 'GET',
        path: '/api/v4/issues',
        searchParams: {
          scope: 'assigned_to_me',
          state: 'opened',
          order_by: 'updated_at',
          sort: 'desc',
          per_page: limit.toString(),
        },
      });

      this.#logger.debug(`Found ${issues.length} results. Max allowed: ${limit}`);

      return issues;
    } catch (error) {
      this.#logger.error('Error fetching issues for current user', error);
      throw error;
    }
  }

  async getIssueDetails(issueId: GitLabGID): Promise<IssueDetails> {
    this.#logger.debug(`Fetching issue details: ${issueId}`);

    try {
      const { issue } = await this.#gitlabApiService.fetchFromApi<{
        issue: IssueDetails;
      }>({
        type: 'graphql',
        query: gql`
          query getIssueDetails($id: IssueID!) {
            issue(id: $id) {
              title
              description
              state
              createdAt
              updatedAt
              closedAt
              confidential
              userNotesCount
              weight
              webUrl
              milestone {
                title
              }
              assignees(first: 10) {
                nodes {
                  username
                }
              }
              labels(first: 10) {
                nodes {
                  title
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
          id: issueId,
        },
      });

      this.#logger.debug(`Found issue details:\n${JSON.stringify(issue)}`);

      return issue;
    } catch (error) {
      this.#logger.error(`Error fetching issue details: ${issueId}`, error);
      throw error;
    }
  }
}
