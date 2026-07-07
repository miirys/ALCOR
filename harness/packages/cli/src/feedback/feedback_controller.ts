import fs from 'fs';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { CLI_INPUT_TYPES, defaultInputState, type FeedbackCallbacks } from '@gitlab-org/tui';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { doNotAwait, GitLabApiService } from '@gitlab-org/core';
import { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import type { ControllerApi } from '../commands/tui/controller_api';
import { CredentialProvider } from '../utils/credential_provider';
import { RuntimeContext } from '../runtime_context';
import { getLogFilesWithStats } from '../commands/log/last_log';
import { LogPreviewController } from './log_preview_controller';
import { ApiSubmissionHandler } from './submission_handlers/api_submission_handler';
import { UrlSubmissionHandler } from './submission_handlers/url_submission_handler';
import type {
  FeedbackSubmissionHandler,
  SubmissionResult,
} from './submission_handlers/feedback_submission_handler';

// GitLab.com base URL (always used for feedback submissions)
const GITLAB_COM_BASE_URL = 'https://gitlab.com';
// GitLab project ID for gitlab-org/editor-extensions/gitlab-lsp (for API submissions)
const GITLAB_LSP_PROJECT_ID = '46519181';
// GitLab project path for prefilled issue URLs
const GITLAB_LSP_PROJECT_PATH = 'gitlab-org/editor-extensions/gitlab-lsp';

/**
 * Holds transient state for a single feedback submission.
 * This data persists across the multi-step flow but is discarded when complete.
 */
export interface FeedbackSubmission {
  description: string;
  title: string;
  type: 'bug' | 'feature';
  includeLogs: boolean;
}

export interface FeedbackController {
  openFeedback(api: ControllerApi): Promise<void>;
  selectType(type: 'bug' | 'feature', api: ControllerApi): void;
  submitDescription(description: string, api: ControllerApi): void;
  submitTitle(title: string, api: ControllerApi): Promise<void>;
  cancelTitle(api: ControllerApi): void;
  confirmLogInclusion(includeLog: boolean, api: ControllerApi): void;
  cancelLogConfirmation(api: ControllerApi): void;
  previewLogs(api: ControllerApi): Promise<void>;
  cancelFeedback(api: ControllerApi): void;
  closeFeedbackSuccess(api: ControllerApi): void;
  getCallbacks(api: ControllerApi): FeedbackCallbacks;
}

export const FeedbackController = createInterfaceId<FeedbackController>('FeedbackController');

@Implements(FeedbackController)
@Service({
  dependencies: [
    CredentialProvider,
    RuntimeContext,
    Logger,
    SecretRedactor,
    WorkflowUrlOpenerService,
    LogPreviewController,
    GitLabApiService,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultFeedbackController implements FeedbackController {
  #credentialProvider: CredentialProvider;

  #runtimeContext: RuntimeContext;

  #logger: Logger;

  #secretRedactor: SecretRedactor;

  #apiService: GitLabApiService;

  #urlHandler: FeedbackSubmissionHandler;

  #logPreviewController: LogPreviewController;

  #currentFeedbackSubmission: FeedbackSubmission | null = null;

  #cachedCredentials: { baseUrl: string; token?: string } | null = null;

  constructor(
    credentialProvider: CredentialProvider,
    runtimeContext: RuntimeContext,
    logger: Logger,
    secretRedactor: SecretRedactor,
    urlOpener: WorkflowUrlOpenerService,
    logPreviewController: LogPreviewController,
    apiService: GitLabApiService,
  ) {
    this.#credentialProvider = credentialProvider;
    this.#runtimeContext = runtimeContext;
    this.#logger = withPrefix(logger, '[FeedbackController]');
    this.#secretRedactor = secretRedactor;
    this.#apiService = apiService;
    this.#logPreviewController = logPreviewController;

    this.#urlHandler = new UrlSubmissionHandler(
      urlOpener,
      runtimeContext,
      this.#logger,
      GITLAB_COM_BASE_URL,
      GITLAB_LSP_PROJECT_PATH,
    );
  }

  async openFeedback(api: ControllerApi): Promise<void> {
    this.#logger.debug('Opening feedback flow');

    // Reset state - submission will be created when type is selected
    this.#currentFeedbackSubmission = null;
    this.#cachedCredentials = null;

    try {
      const credentials = await this.#credentialProvider.getCredentials();
      this.#cachedCredentials = credentials;
      const isGitLabDotCom =
        this.#isGitLabDotCom(credentials.baseUrl) && Boolean(credentials.token);

      api.mutateState((state) => ({
        ...state,
        input: {
          inputType: CLI_INPUT_TYPES.FEEDBACK,
          step: 'type-selection',
          isGitLabDotCom,
        },
      }));
    } catch (error) {
      this.#logger.warn('Failed to fetch credentials during feedback initialization', error);
      this.#cachedCredentials = null;
      api.mutateState((state) => ({
        ...state,
        input: {
          inputType: CLI_INPUT_TYPES.FEEDBACK,
          step: 'type-selection',
          isGitLabDotCom: false,
        },
      }));
    }
  }

  selectType(type: 'bug' | 'feature', api: ControllerApi): void {
    this.#logger.debug(`Feedback type selected: ${type}`);

    // Create submission object now that we know the type
    this.#currentFeedbackSubmission = {
      description: '',
      title: '',
      type,
      includeLogs: type === 'bug', // Default: bugs include logs
    };

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }

      return {
        ...state,
        input: {
          ...state.input,
          step: 'description',
          selectedType: type,
          includeLogs: type === 'bug',
        },
      };
    });
  }

  confirmLogInclusion(includeLog: boolean, api: ControllerApi): void {
    this.#logger.debug(`Log inclusion confirmed: ${includeLog}`);

    if (!this.#currentFeedbackSubmission) {
      this.#logger.error('No active feedback session');
      return;
    }

    // Update the submission with user's log preference
    this.#currentFeedbackSubmission.includeLogs = includeLog;

    doNotAwait(this.#performSubmission(this.#currentFeedbackSubmission, api));
  }

  submitDescription(description: string, api: ControllerApi): void {
    this.#logger.debug('Description submitted, moving to title step');

    if (!this.#currentFeedbackSubmission) {
      this.#logger.error('No active feedback session');
      return;
    }

    this.#currentFeedbackSubmission.description = description;

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }
      return {
        ...state,
        input: {
          ...state.input,
          step: 'title',
        },
      };
    });
  }

  async submitTitle(title: string, api: ControllerApi): Promise<void> {
    this.#logger.debug('Title submitted');

    if (!this.#currentFeedbackSubmission) {
      this.#logger.error('No active feedback session');
      api.showError('Failed to submit feedback: invalid state');
      return;
    }

    this.#currentFeedbackSubmission.title = title;

    const currentState = api.mutateState((state) => state);
    if (currentState.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
      this.#logger.error('Invalid state: expected feedback input');
      api.showError('Failed to submit feedback: invalid state');
      return;
    }

    const { isGitLabDotCom } = currentState.input;

    if (this.#currentFeedbackSubmission.type === 'bug' && isGitLabDotCom) {
      this.#logger.debug('Bug report on gitlab.com: showing log confirmation');
      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
          return state;
        }
        return {
          ...state,
          input: {
            ...state.input,
            step: 'log-confirmation',
          },
        };
      });
      return; // Wait for log confirmation
    }

    // For feature requests or self-managed, proceed with submission (no logs)
    // Note: includeLogs already set to false for feature requests in selectType
    await this.#performSubmission(this.#currentFeedbackSubmission, api);
  }

  cancelTitle(api: ControllerApi): void {
    this.#logger.debug('Title cancelled, returning to description');

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }
      return {
        ...state,
        input: {
          ...state.input,
          step: 'description',
        },
      };
    });
  }

  async #performSubmission(submission: FeedbackSubmission, api: ControllerApi): Promise<void> {
    this.#logger.debug('Performing actual submission');

    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }
      return {
        ...state,
        input: {
          ...state.input,
          step: 'submitting',
        },
      };
    });

    try {
      // Use cached credentials
      const credentials = this.#cachedCredentials;

      const { title: issueTitle, labels } = this.#buildIssueMetadata(
        submission.description,
        submission.title,
        submission.type,
      );

      const isGitLabDotCom = credentials ? this.#isGitLabDotCom(credentials.baseUrl) : false;

      let result: SubmissionResult;
      if (isGitLabDotCom && credentials && credentials.token) {
        // API submission (gitlab.com with token)
        const apiHandler = new ApiSubmissionHandler(
          this.#apiService,
          this.#runtimeContext,
          this.#logger,
          () => this.#getRecentLogs(200),
          GITLAB_LSP_PROJECT_ID,
        );

        result = await apiHandler.submit({
          ...submission,
          title: issueTitle, // Override with enriched title
          labels,
        });
      } else {
        // URL submission (self-managed or no token)
        result = await this.#urlHandler.submit({
          ...submission,
          title: issueTitle, // Override with enriched title
          labels,
        });
      }

      // Update state to success with result data
      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
          return state;
        }
        return {
          ...state,
          input: {
            ...state.input,
            step: 'success',
            issueNumber: result.issueNumber,
            issueUrl: result.issueUrl,
            submissionMethod: result.method,
          },
        };
      });
    } catch (error) {
      this.#logger.error('Failed to submit feedback', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      api.showError(`Failed to submit feedback: ${errorMessage}`);

      // Return to description step
      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
          return state;
        }
        return {
          ...state,
          input: {
            ...state.input,
            step: 'description',
            error: errorMessage,
          },
        };
      });
    }
  }

  cancelLogConfirmation(api: ControllerApi): void {
    this.#logger.debug('Log confirmation cancelled, returning to title');
    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.FEEDBACK) {
        return state;
      }
      return {
        ...state,
        input: {
          ...state.input,
          step: 'title',
        },
      };
    });
  }

  async previewLogs(api: ControllerApi): Promise<void> {
    this.#logger.debug('Opening log preview dialog');

    const logInfo = this.#getRecentLogs(200);

    if (!logInfo) {
      this.#logger.warn('No logs available for preview');
      return;
    }

    await this.#logPreviewController.openLogPreview(api, logInfo.filePath, logInfo.content);
  }

  cancelFeedback(api: ControllerApi): void {
    this.#logger.debug('Cancelling feedback flow');
    this.#currentFeedbackSubmission = null;
    this.#cachedCredentials = null;
    api.mutateState((state) => ({
      ...state,
      input: defaultInputState,
    }));
  }

  closeFeedbackSuccess(api: ControllerApi): void {
    this.#logger.debug('Closing feedback success screen');
    this.#currentFeedbackSubmission = null;
    this.#cachedCredentials = null;
    api.mutateState((state) => ({
      ...state,
      input: defaultInputState,
    }));
  }

  getCallbacks(api: ControllerApi): FeedbackCallbacks {
    return {
      onSelectFeedbackType: (type: 'bug' | 'feature') => this.selectType(type, api),
      onSubmitDescription: (description: string) => this.submitDescription(description, api),
      onSubmitTitle: async (title: string) => {
        await this.submitTitle(title, api).catch((error) => {
          this.#logger.error('Unhandled error in onSubmitTitle', error);
          api.showError('Failed to submit feedback: unexpected error');
        });
      },
      onCancelTitle: () => this.cancelTitle(api),
      onConfirmLogInclusion: (includeLog: boolean) => this.confirmLogInclusion(includeLog, api),
      onCancelLogConfirmation: () => this.cancelLogConfirmation(api),
      onPreviewLogs: () => this.previewLogs(api),
      onCancelFeedback: () => this.cancelFeedback(api),
      onCloseFeedbackSuccess: () => this.closeFeedbackSuccess(api),
      onCloseLogPreview: () => this.#logPreviewController.closeLogPreview(api),
    };
  }

  /**
   * Retrieves the last N lines from the most recent log file.
   * Returns sanitized log content with secrets redacted.
   *
   * @param lineCount Number of lines to retrieve from the end of the log
   * @returns Sanitized log content and file path, or null if logs unavailable
   */
  #getRecentLogs(lineCount: number = 200): { content: string; filePath: string } | null {
    try {
      const result = getLogFilesWithStats();

      if (result.isErr() || result.value.length === 0) {
        this.#logger.warn('No log files available for feedback submission');
        return null;
      }

      const mostRecentLog = result.value[0];
      const logContent = fs.readFileSync(mostRecentLog.path, 'utf-8');
      const lines = logContent.split('\n');
      const recentLines = lines.slice(-lineCount).join('\n');

      const sanitized = this.#secretRedactor.redactSecrets(recentLines, 'feedback-log-capture');

      return {
        content: sanitized,
        filePath: mostRecentLog.path,
      };
    } catch (error) {
      this.#logger.error('Failed to read log file for feedback', error);
      return null;
    }
  }

  #generateTitle(description: string, type: 'bug' | 'feature'): string {
    const lines = description.split('\n').map((line) => line.trim());
    const firstLine = lines.find((line) => line.length > 0);

    if (!firstLine) {
      return type === 'bug' ? 'ALCOR Feedback: Bug Report' : 'ALCOR Feedback: Feature Request';
    }

    // Truncate at 100 characters
    if (firstLine.length > 100) {
      return `${firstLine.substring(0, 97)}...`;
    }

    return firstLine;
  }

  /**
   * Builds issue metadata (title and labels) from user input.
   * This is shared between API and URL submission paths to ensure consistency.
   */
  #buildIssueMetadata(
    description: string,
    title: string,
    selectedType: 'bug' | 'feature',
  ): {
    title: string;
    labels: string[];
  } {
    const rawTitle = title.trim() || this.#generateTitle(description, selectedType);
    const issueTitle = `[LS][CLI][Feedback] ${rawTitle}`;
    const labels =
      selectedType === 'bug'
        ? [
            'duo-cli',
            'type::bug',
            'feedback-form',
            'Editor Extensions::Duo CLI',
            'group::editor extensions',
          ]
        : [
            'duo-cli',
            'type::feature',
            'feedback-form',
            'Editor Extensions::Duo CLI',
            'group::editor extensions',
          ];

    return { title: issueTitle, labels };
  }

  /**
   * Checks if the given base URL is gitlab.com
   */
  #isGitLabDotCom(baseUrl: string): boolean {
    try {
      const url = new URL(baseUrl);
      return url.hostname === 'gitlab.com';
    } catch {
      return false;
    }
  }
}
