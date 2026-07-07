import type { Logger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import type { RuntimeContext } from '../../runtime_context';
import { IssueDescriptionBuilder } from '../issue_description_builder';
import type {
  FeedbackSubmissionHandler,
  FeedbackSubmissionParams,
  SubmissionResult,
} from './feedback_submission_handler';

interface CreateIssueResponse {
  iid: number;
  web_url: string;
}

interface LogInfo {
  content: string;
  filePath: string;
}

/**
 * Handles feedback submission via GitLab API.
 * Used for gitlab.com users with valid credentials.
 */
export class ApiSubmissionHandler implements FeedbackSubmissionHandler {
  #apiService: GitLabApiService;

  #runtimeContext: RuntimeContext;

  #logger: Logger;

  #getRecentLogs: () => LogInfo | null;

  #projectId: string;

  constructor(
    apiService: GitLabApiService,
    runtimeContext: RuntimeContext,
    logger: Logger,
    getRecentLogs: () => LogInfo | null,
    projectId: string,
  ) {
    this.#apiService = apiService;
    this.#runtimeContext = runtimeContext;
    this.#logger = logger;
    this.#getRecentLogs = getRecentLogs;
    this.#projectId = projectId;
  }

  async submit(params: FeedbackSubmissionParams): Promise<SubmissionResult> {
    // Get logs if needed
    let logContent: string | undefined;
    if (params.type === 'bug' && params.includeLogs) {
      const logInfo = this.#getRecentLogs();
      if (logInfo) {
        logContent = logInfo.content;
      }
    }

    // Build description using shared builder
    const enrichedDescription = IssueDescriptionBuilder.build({
      description: params.description,
      type: params.type,
      systemInfo: {
        cliVersion: this.#runtimeContext.cliVersion,
        distribution: this.#runtimeContext.envInfo.distribution,
        osPlatform: this.#runtimeContext.envInfo.osPlatform,
        osVersion: this.#runtimeContext.envInfo.osVersion,
        terminalName: this.#runtimeContext.envInfo.terminalName,
        shell: this.#runtimeContext.envInfo.shell,
      },
      logContent,
    });

    this.#logger.debug(`Creating issue via API for project ${this.#projectId}`);

    const issue = await this.#apiService.fetchFromApi<CreateIssueResponse>({
      type: 'rest',
      method: 'POST',
      path: `/api/v4/projects/${this.#projectId}/issues`,
      body: {
        title: params.title,
        description: enrichedDescription,
        labels: params.labels.join(','),
        confidential: params.includeLogs,
      },
    });

    this.#logger.info(`Issue created successfully via API: #${issue.iid}`);

    return {
      method: 'api',
      issueNumber: issue.iid,
      issueUrl: issue.web_url,
    };
  }
}
