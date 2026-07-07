import type { Logger } from '@gitlab-org/logging';
import type { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import type { RuntimeContext } from '../../runtime_context';
import { IssueDescriptionBuilder } from '../issue_description_builder';
import type {
  FeedbackSubmissionHandler,
  FeedbackSubmissionParams,
  SubmissionResult,
} from './feedback_submission_handler';

/**
 * Handles feedback submission via prefilled GitLab issue URL.
 * Used for self-managed instances or when users don't have credentials.
 * Opens a browser with a prefilled issue form.
 */
export class UrlSubmissionHandler implements FeedbackSubmissionHandler {
  #urlOpener: WorkflowUrlOpenerService;

  #runtimeContext: RuntimeContext;

  #logger: Logger;

  #baseUrl: string;

  #projectPath: string;

  constructor(
    urlOpener: WorkflowUrlOpenerService,
    runtimeContext: RuntimeContext,
    logger: Logger,
    baseUrl: string,
    projectPath: string,
  ) {
    this.#urlOpener = urlOpener;
    this.#runtimeContext = runtimeContext;
    this.#logger = logger;
    this.#baseUrl = baseUrl;
    this.#projectPath = projectPath;
  }

  async submit(params: FeedbackSubmissionParams): Promise<SubmissionResult> {
    // Build description with URL-specific features
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
      includeLogPlaceholder: params.type === 'bug',
      labels: params.labels,
    });

    // Build the prefilled issue URL
    const issueUrl = new URL(`${this.#baseUrl}/${this.#projectPath}/-/issues/new`);
    issueUrl.searchParams.set('issue[title]', params.title);
    issueUrl.searchParams.set('issue[description]', enrichedDescription);
    // Set issuable_template to empty string to prevent Default.md from overwriting our description
    issueUrl.searchParams.set('issuable_template', '');

    this.#logger.debug(`Opening prefilled issue URL: ${issueUrl.toString()}`);

    // Open the URL in the browser
    await this.#urlOpener.openUrl(issueUrl.toString());

    this.#logger.info('Feedback form opened in browser');

    return {
      method: 'url',
    };
  }
}
