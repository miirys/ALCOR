import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FixedTimeCircuitBreaker } from '@gitlab-org/core';
import {
  ConfigService,
  ClientConfig,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  ITelemetryOptions,
} from '@gitlab-org/config';
import {
  GC_TIME,
  IClientContext,
  TelemetryService,
  buildSnowplowClientContextData,
} from '@gitlab-org/telemetry';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { GitLabApiClient } from '../../api';
import { SuggestionOptionText } from '../../api_types';
import { ProjectService } from '../../core/services/project_service';
import { GitlabRealm, getGitlabRealm } from '../../utils/realm_detection';
import {
  INSTANCE_TRACKING_EVENTS_MAP,
  TELEMETRY_DISABLED_WARNING_MSG,
  TELEMETRY_ENABLED_MSG,
  TELEMETRY_ENABLED_SELF_MANAGED_MSG,
} from './constants';
import {
  CodeSuggestionsTelemetryEvent,
  CodeSuggestionsTelemetryEventContext,
  CodeSuggestionsTelemetryTrackingContext,
  ICodeSuggestionContextUpdate,
} from './code_suggestions_tracking_types';
import { canClientTrackEvent } from './utils';
import { CodeSuggestionTelemetryState } from './code_suggestions_telemetry_state_manager';

interface СodeSuggestionContext {
  language?: string;
  branch_name?: string;
  suggestion_size?: number;
  timestamp: string;
  is_streaming?: boolean;
  projectId?: number;
  model_engine?: string;
  model_name?: string;
}

export interface CodeSuggestionsInstanceTracker
  extends TelemetryService<
    CodeSuggestionsTelemetryEvent,
    CodeSuggestionsTelemetryEventContext,
    CodeSuggestionsTelemetryTrackingContext
  > {}
export const CodeSuggestionsInstanceTracker = createInterfaceId<CodeSuggestionsInstanceTracker>(
  'CodeSuggestionsInstanceTracker',
);

@Injectable(CodeSuggestionsInstanceTracker, [
  GitLabApiClient,
  ConfigService,
  Logger,
  ProjectService,
  CodeSuggestionTelemetryState,
])
export class DefaultCodeSuggestionsInstanceTracker implements CodeSuggestionsInstanceTracker {
  #api: GitLabApiClient;

  #codeSuggestionsContextMap = new Map<string, СodeSuggestionContext>();

  #circuitBreaker = new FixedTimeCircuitBreaker();

  #configService: ConfigService;

  #logger: Logger;

  #projectService: ProjectService;

  #options: ITelemetryOptions = {
    enabled: true,
    actions: [],
  };

  #clientContext: IClientContext = {};

  #suggestionStateManager: CodeSuggestionTelemetryState;

  // API used for tracking events is available since GitLab v17.2.0.
  // Given the track request is done for each CS request
  // we need to  make sure we do not log the unsupported instance message many times
  #invalidInstanceMsgLogged = false;

  constructor(
    api: GitLabApiClient,
    configService: ConfigService,
    logger: Logger,
    projectService: ProjectService,
    suggestionStateManager: CodeSuggestionTelemetryState,
  ) {
    this.#configService = configService;
    this.#configService.onConfigChange((config) => this.#reconfigure(config));
    this.#api = api;
    this.#logger = withPrefix(logger, '[CodeSuggestionsInstanceTelemetry]');
    this.#circuitBreaker.onClose(() =>
      this.#logger.info(
        'Warning: Too many failures when sending telemetry to your GitLab instance. Please retry later.',
      ),
    );
    this.#circuitBreaker.onOpen(() =>
      this.#logger.warn('From now on, we will try to send telemetry to your GitLab instance again'),
    );
    this.#projectService = projectService;
    this.#suggestionStateManager = suggestionStateManager;
    this.#suggestionStateManager.init(this.#logger);
  }

  #reconfigure(config: ClientConfig) {
    const actions = config.telemetry?.actions;
    if (actions) {
      this.#options.actions = actions;
    }

    this.#options.baseUrl = config.baseUrl || '';

    if (getGitlabRealm(this.#options.baseUrl) === GitlabRealm.selfManaged) {
      this.#options.enabled = true;
      this.#logger.info(`Instance Telemetry: ${TELEMETRY_ENABLED_SELF_MANAGED_MSG}`);
    } else {
      const enabled = config.telemetry?.enabled;

      if (typeof enabled !== 'undefined' && this.#options.enabled !== enabled) {
        this.#options.enabled = enabled;

        if (enabled === false) {
          this.#logger.warn(`Instance Telemetry: ${TELEMETRY_DISABLED_WARNING_MSG}`);
        } else if (enabled === true) {
          this.#logger.info(`Instance Telemetry: ${TELEMETRY_ENABLED_MSG}`);
        }
      }
    }

    this.#setClientContext({
      extension: config.telemetry?.extension,
      ide: config.telemetry?.ide,
    });
  }

  #setClientContext(context: IClientContext) {
    this.#clientContext = context;
  }

  isEnabled(): boolean {
    return Boolean(this.#options.enabled);
  }

  setTrackingContext({ uniqueTrackingId, context }: CodeSuggestionsTelemetryTrackingContext) {
    if (this.#codeSuggestionsContextMap.get(uniqueTrackingId)) {
      this.updateCodeSuggestionsContext(uniqueTrackingId, context);
    } else {
      this.setCodeSuggestionsContext(uniqueTrackingId, context);
    }
  }

  setCodeSuggestionsContext(
    uniqueTrackingId: string,
    context: Partial<ICodeSuggestionContextUpdate>,
  ) {
    if (this.#circuitBreaker.isOpen()) {
      return;
    }

    const { model, isStreaming, suggestionOptions, branchName, documentContext } = context;

    // Only auto-reject if client is set up to track accepted and not rejected events.
    if (
      canClientTrackEvent(this.#options.actions, CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED) &&
      !canClientTrackEvent(this.#options.actions, CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED)
    ) {
      this.#rejectOpenedSuggestions();
    }

    setTimeout(() => {
      if (this.#codeSuggestionsContextMap.has(uniqueTrackingId)) {
        this.#codeSuggestionsContextMap.delete(uniqueTrackingId);
        this.#suggestionStateManager.deleteSuggestion(uniqueTrackingId);
      }
    }, GC_TIME);

    this.#codeSuggestionsContextMap.set(uniqueTrackingId, {
      is_streaming: isStreaming,
      language: model?.lang,
      branch_name: branchName,
      timestamp: new Date().toISOString(),
      suggestion_size: calculateSuggestionSize(suggestionOptions),
      model_engine: model?.engine,
      model_name: model?.name,
    });

    if (this.#isStreamingSuggestion(uniqueTrackingId)) return;

    this.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED, uniqueTrackingId);

    // All async context should be collected after the 'REQUESTED' event is tracked
    // to ensure the event is sent immediately without blocking on async operations
    const documentURI = documentContext?.uri;
    if (documentURI) {
      this.#fetchAndUpdateProjectId(uniqueTrackingId, documentURI).catch((error) => {
        this.#logger.debug('Failed to fetch project ID for telemetry', error);
      });
    }
  }

  async #fetchAndUpdateProjectId(uniqueTrackingId: string, documentURI: string) {
    const project = await this.#projectService.getProjectByFileURI(documentURI);
    const context = this.#codeSuggestionsContextMap.get(uniqueTrackingId);

    if (context && project?.id) {
      context.projectId = project.id;
      this.#codeSuggestionsContextMap.set(uniqueTrackingId, context);
    }
  }

  updateCodeSuggestionsContext(
    uniqueTrackingId: string,
    contextUpdate: Partial<ICodeSuggestionContextUpdate>,
  ) {
    if (this.#circuitBreaker.isOpen()) {
      return;
    }

    if (this.#isStreamingSuggestion(uniqueTrackingId)) return;

    const context = this.#codeSuggestionsContextMap.get(uniqueTrackingId);
    const { model, suggestionOptions, isStreaming, branchName } = contextUpdate;

    if (context) {
      if (model) {
        context.language = model?.lang;
        context.model_engine = model?.engine;
        context.model_name = model?.name;
      }

      if (suggestionOptions?.length) {
        context.suggestion_size = calculateSuggestionSize(suggestionOptions);
      }

      if (typeof isStreaming === 'boolean') {
        context.is_streaming = isStreaming;
      }

      if (branchName) {
        context.branch_name = branchName;
      }

      this.#codeSuggestionsContextMap.set(uniqueTrackingId, context);
    }
  }

  trackEvent(
    event: CodeSuggestionsTelemetryEvent,
    uniqueTrackingId: CodeSuggestionsTelemetryEventContext,
  ): void {
    if (!this.isEnabled()) return;

    const isStreaming = this.#isStreamingSuggestion(uniqueTrackingId);

    if (isStreaming) return;

    if (this.#suggestionStateManager.canUpdateState(uniqueTrackingId, event, isStreaming)) {
      this.#suggestionStateManager.updateSuggestionState(uniqueTrackingId, event, isStreaming);
      this.#trackCodeSuggestionsEvent(event, uniqueTrackingId).catch((e) =>
        this.#logger.warn('Instance Telemetry: Could not track telemetry', e),
      );
    }
  }

  async #trackCodeSuggestionsEvent(
    eventType: CODE_SUGGESTIONS_TRACKING_EVENTS,
    uniqueTrackingId: string,
  ) {
    const event = INSTANCE_TRACKING_EVENTS_MAP[eventType];

    if (!event) {
      return;
    }

    try {
      const { language, suggestion_size, branch_name, projectId, model_name, model_engine } =
        this.#codeSuggestionsContextMap.get(uniqueTrackingId) ?? {};

      const clientContextData = buildSnowplowClientContextData(this.#clientContext);

      await this.#api.fetchFromApi({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/usage_data/track_event',
        body: {
          event,
          project_id: projectId,
          additional_properties: {
            unique_tracking_id: uniqueTrackingId,
            timestamp: new Date().toISOString(),
            language,
            suggestion_size,
            branch_name,
            model_name,
            model_engine,
            ...clientContextData,
          },
        },
        supportedSinceInstanceVersion: {
          resourceName: 'track instance telemetry',
          version: '17.2.0',
        },
      });

      this.#circuitBreaker.success();
    } catch (error) {
      if (error instanceof InvalidInstanceVersionError) {
        if (this.#invalidInstanceMsgLogged) return;

        this.#invalidInstanceMsgLogged = true;
      }

      this.#logger.warn(`Instance telemetry: Failed to track event: ${eventType}`, error);
      this.#circuitBreaker.error();
    }
  }

  #rejectOpenedSuggestions() {
    this.#logger.debug(`Instance Telemetry: Reject all opened suggestions`);
    this.#suggestionStateManager
      .getOpenedSuggestions()
      .forEach((uniqueTrackingId) =>
        this.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId),
      );
  }

  #isStreamingSuggestion(uniqueTrackingId: string): boolean {
    return Boolean(this.#codeSuggestionsContextMap.get(uniqueTrackingId)?.is_streaming);
  }
}

function calculateSuggestionSize(options: SuggestionOptionText[] = []): number {
  const countLines = (text: string) => (text ? text.split('\n').length : 0);

  return Math.max(0, ...options.map(({ text }) => countLines(text)));
}
