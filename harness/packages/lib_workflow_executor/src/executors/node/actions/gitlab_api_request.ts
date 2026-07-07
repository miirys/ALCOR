// for Headers to behave properly
/// <reference lib="dom.iterable" />
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { HttpResponse } from '@gitlab-org/duo-workflow-service';
import { WorkflowAction } from '../clients/types';
import { WorkflowActionContext, WorkflowActionHandler, WorkflowActionOf } from './index';

export type GitlabApiRequestAction = WorkflowActionOf<'runHTTPRequest'>;

@Injectable(WorkflowActionHandler, [Logger, GitLabApiService])
export class GitlabApiRequestActionHandler
  implements WorkflowActionHandler<GitlabApiRequestAction>
{
  #logger: Logger;

  #gitLabApiService: GitLabApiService;

  constructor(logger: Logger, gitLabApiService: GitLabApiService) {
    this.#logger = withPrefix(logger, '[GitlabApiRequestActionHandler]');
    this.#gitLabApiService = gitLabApiService;
  }

  name = 'gitlab_api_request';

  canHandle(action: WorkflowAction): action is GitlabApiRequestAction {
    return Boolean(action.runHTTPRequest);
  }

  async execute(
    { runHTTPRequest }: GitlabApiRequestAction,
    { workflowToken, abortSignal }: WorkflowActionContext,
  ): Promise<HttpResponse> {
    try {
      this.#logger.debug(
        `Making GitLab API request: ${runHTTPRequest.method} ${runHTTPRequest.path}`,
      );

      const apiClient = this.#gitLabApiService.getSimpleClient(
        workflowToken.gitlab_rails.base_url,
        workflowToken.gitlab_rails.token,
      );

      const response = await apiClient.fetchFromApiRaw({
        type: 'rest',
        method: runHTTPRequest.method as 'GET' | 'POST' | 'PATCH' | 'PUT',
        path: runHTTPRequest.path,
        body: runHTTPRequest.body && JSON.parse(runHTTPRequest.body),
        signal: abortSignal,
      });

      const headers = Object.fromEntries(response.headers.entries()) as HttpResponse['headers'];
      const body = await response.text();

      return {
        statusCode: response.status,
        headers,
        body,
        error: '',
      };
    } catch (err) {
      this.#logger.error(
        `Error making GitLab API request: ${err instanceof Error ? err.message : String(err)}`,
      );
      const error = err instanceof Error ? err.message : String(err);
      return { error, body: '', statusCode: 0, headers: {} };
    }
  }
}
