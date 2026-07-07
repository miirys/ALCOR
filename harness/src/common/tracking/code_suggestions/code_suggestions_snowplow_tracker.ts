import { SelfDescribingJson, StructuredEvent } from '@snowplow/tracker-core';
import { InlineCompletionTriggerKind } from 'vscode-languageserver';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FeatureFlagService, getByteSize } from '@gitlab-org/core';
import { mergeWith, isArray } from 'lodash';
import {
  ConfigService,
  ClientConfig,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  ITelemetryOptions,
  SuggestionSource,
} from '@gitlab-org/config';
import {
  TelemetryService,
  SnowplowService,
  ISnowplowClientContext,
  IClientContext,
  SAAS_INSTANCE_URL,
  GC_TIME,
  IdeExtensionContextSchema,
  buildSnowplowClientContextData,
  createSnowplowClientContext,
} from '@gitlab-org/telemetry';
import {
  ConnectionDetailsService,
  IConnectionDetails,
} from '../../suggestion/connection_details_service';
import { DirectConnectionDetailsService } from '../../suggestion/direct_connection_details_service';
import { AdditionalContext, ResolutionStrategy } from '../../api_types';
import { shouldUseOpenTabs } from '../../suggestion_client/helpers';
import { IDocContext } from '../../document_transformer_service';
import { GitLabApiClient } from '../../api';
import { SUGGESTIONS_DEBOUNCE_INTERVAL_MS } from '../../constants';
import { DefaultSupportedLanguagesService } from '../../suggestion/supported_languages_service';
import { transformHeadersToSnowplowOptions } from '../../utils/headers_to_snowplow_options';
import { GitlabRealm, getGitlabRealm } from '../../utils/realm_detection';
import * as CodeSuggestionContextSchema from './schemas/code_suggestion_context-3-8-0.json';
import {
  CODE_SUGGESTIONS_CATEGORY,
  TELEMETRY_DISABLED_WARNING_MSG,
  TELEMETRY_ENABLED_MSG,
} from './constants';
import {
  CodeSuggestionsTelemetryEvent,
  CodeSuggestionsTelemetryEventContext,
  CodeSuggestionsTelemetryTrackingContext,
  ICodeSuggestionContextUpdate,
} from './code_suggestions_tracking_types';
import { canClientTrackEvent } from './utils';
import { CodeSuggestionTelemetryState } from './code_suggestions_telemetry_state_manager';

interface ContextItem {
  file_extension: string;
  type: AdditionalContext['type'];
  resolution_strategies: ResolutionStrategy[];
  byte_size: number;
}

export interface ISnowplowCodeSuggestionContext {
  schema: string;
  data: {
    prefix_length?: number;
    suffix_length?: number;
    language?: string | null;
    gitlab_realm?: GitlabRealm;
    model_engine?: string | null;
    model_name?: string | null;
    api_status_code?: number | null;
    debounce_interval?: number | null;
    suggestion_source?: SuggestionSource;
    gitlab_global_user_id?: string | null;
    gitlab_instance_id?: string | null;
    gitlab_host_name?: string | null;
    gitlab_saas_duo_pro_namespace_ids: number[] | null;
    gitlab_feature_enablement_type: string | null;
    gitlab_instance_version: string | null;
    is_streaming?: boolean;
    is_invoked?: boolean | null;
    options_count?: number | null;
    accepted_option?: number | null;
    /**
     * boolean indicating whether the feature is enabled
     * and we sent context in the request
     */
    has_advanced_context?: boolean | null;
    /**
     * boolean indicating whether request is direct to cloud connector
     */
    is_direct_connection?: boolean | null;
    total_context_size_bytes?: number;
    content_above_cursor_size_bytes?: number;
    content_below_cursor_size_bytes?: number;
    /**
     * set of final context items sent to AI Gateway
     */
    context_items?: ContextItem[] | null;
    /**
     * aggregated and deduplicated list of context item resolution strategies
     */
    context_items_resolution_strategies_summary?: ResolutionStrategy[] | null;
    /**
     * total tokens used in request to model provider
     */
    input_tokens?: number | null;
    /**
     * total output tokens received from model provider
     */
    output_tokens?: number | null;
    /**
     * total tokens sent as context to AI Gateway
     */
    context_tokens_sent?: number | null;
    /**
     * total context tokens used in request to model provider
     */
    context_tokens_used?: number | null;
    /**
     * GCP location where the code suggestions request was processed
     */
    region?: string | null;
  };
}

export interface CodeSuggestionsSnowplowTracker
  extends TelemetryService<
    CodeSuggestionsTelemetryEvent,
    CodeSuggestionsTelemetryEventContext,
    CodeSuggestionsTelemetryTrackingContext
  > {}

export const CodeSuggestionsSnowplowTracker = createInterfaceId<CodeSuggestionsSnowplowTracker>(
  'CodeSuggestionsSnowplowTracker',
);

@Injectable(CodeSuggestionsSnowplowTracker, [
  ConfigService,
  ConnectionDetailsService,
  DirectConnectionDetailsService,
  FeatureFlagService,
  GitLabApiClient,
  SnowplowService,
  Logger,
  CodeSuggestionTelemetryState,
])
export class DefaultCodeSuggestionsSnowplowTracker implements CodeSuggestionsSnowplowTracker {
  #snowplowService: SnowplowService;

  #configService: ConfigService;

  #connectionDetailsService: ConnectionDetailsService;

  #directConnectionDetailsService: DirectConnectionDetailsService;

  #api: GitLabApiClient;

  #suggestionStateManager: CodeSuggestionTelemetryState;

  #logger: Logger;

  #options: ITelemetryOptions = {
    enabled: true,
    baseUrl: SAAS_INSTANCE_URL,
    // the list of events that the client can track themselves
    actions: [],
  };

  #clientContext: ISnowplowClientContext = createSnowplowClientContext();

  #featureFlagService: FeatureFlagService;

  #gitlabRealm: GitlabRealm = GitlabRealm.saas;

  #codeSuggestionsContextMap = new Map<string, ISnowplowCodeSuggestionContext>();

  constructor(
    configService: ConfigService,
    connectionDetailsService: ConnectionDetailsService,
    directConnectionDetailsService: DirectConnectionDetailsService,
    featureFlagService: FeatureFlagService,
    api: GitLabApiClient,
    snowplowService: SnowplowService,
    logger: Logger,
    suggestionStateManager: CodeSuggestionTelemetryState,
  ) {
    this.#snowplowService = snowplowService;
    this.#connectionDetailsService = connectionDetailsService;
    this.#directConnectionDetailsService = directConnectionDetailsService;
    this.#configService = configService;
    this.#configService.onConfigChange((config) => this.#reconfigure(config));
    this.#api = api;
    this.#featureFlagService = featureFlagService;
    this.#logger = withPrefix(logger, '[CodeSuggestionsSnowplowTelemetry]');
    this.#suggestionStateManager = suggestionStateManager;
    this.#suggestionStateManager.init(this.#logger);
  }

  isEnabled(): boolean {
    return Boolean(this.#options.enabled);
  }

  async #reconfigure(config: ClientConfig) {
    const { baseUrl } = config;
    const enabled = config.telemetry?.enabled;
    const actions = config.telemetry?.actions;

    if (typeof enabled !== 'undefined' && this.#options.enabled !== enabled) {
      this.#options.enabled = enabled;

      if (enabled === false) {
        this.#logger.warn(TELEMETRY_DISABLED_WARNING_MSG);
      } else if (enabled === true) {
        this.#logger.info(TELEMETRY_ENABLED_MSG);
      }
    }

    if (baseUrl) {
      this.#options.baseUrl = baseUrl;
      this.#gitlabRealm = getGitlabRealm(baseUrl);
    }

    if (actions) {
      this.#options.actions = actions;
    }

    this.#setClientContext({
      extension: config.telemetry?.extension,
      ide: config.telemetry?.ide,
    });
  }

  #setClientContext(context: IClientContext) {
    this.#clientContext.data = buildSnowplowClientContextData(context);
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
    const {
      documentContext,
      source = SuggestionSource.network,
      isStreaming,
      triggerKind,
      optionsCount,
      additionalContexts,
      isDirectConnection,
      model,
      region,
    } = context;

    if (source === SuggestionSource.cache) {
      this.#logger.debug(`Retrieved suggestion from cache`);
    } else {
      this.#logger.debug(`Received request to create a new suggestion`);
    }

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

    // Use the language provided by the model, if present.
    // Otherwise, determine the language from the file extension.
    const language =
      model?.lang ??
      DefaultSupportedLanguagesService.getLanguageForFile(documentContext?.fileRelativePath) ??
      null;

    const advancedContextData = this.#getAdvancedContextData({
      additionalContexts,
      documentContext,
    });

    this.#codeSuggestionsContextMap.set(uniqueTrackingId, {
      schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
      data: {
        suffix_length: documentContext?.suffix.length ?? 0,
        prefix_length: documentContext?.prefix.length ?? 0,
        gitlab_realm: this.#gitlabRealm,
        model_engine: model?.engine ?? null,
        model_name: model?.name ?? null,
        language,
        api_status_code: null,
        debounce_interval: source === SuggestionSource.cache ? 0 : SUGGESTIONS_DEBOUNCE_INTERVAL_MS,
        suggestion_source: source,
        gitlab_global_user_id: null,
        gitlab_host_name: null,
        gitlab_instance_id: null,
        gitlab_saas_duo_pro_namespace_ids: null,
        gitlab_feature_enablement_type: null,
        gitlab_instance_version: null,
        is_streaming: isStreaming ?? false,
        is_invoked: this.#getIsInvoked(triggerKind),
        options_count: optionsCount ?? null,
        has_advanced_context: advancedContextData.hasAdvancedContext,
        is_direct_connection: isDirectConnection ?? null,
        total_context_size_bytes: advancedContextData.totalContextSizeBytes,
        content_above_cursor_size_bytes: advancedContextData.contentAboveCursorSizeBytes,
        content_below_cursor_size_bytes: advancedContextData.contentBelowCursorSizeBytes,
        context_items: advancedContextData.contextItems,
        context_items_resolution_strategies_summary:
          advancedContextData.contextItemsResolutionStrategiesSummary,
        region: region ?? model?.region ?? null,
      },
    });

    this.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED, uniqueTrackingId);

    // All async context should be collected after the 'REQUESTED' event is tracked
    // to ensure the event is sent immediately without blocking on async operations
    this.#fetchAndUpdateConnectionDetails(uniqueTrackingId).catch((error) => {
      this.#logger.debug('Failed to fetch connection details for telemetry', error);
    });
  }

  async #fetchAndUpdateConnectionDetails(uniqueTrackingId: string) {
    await this.#connectionDetailsService.fetch();

    const {
      realm,
      instance_id: gitlabInstanceId,
      host_name: gitlabHostName,
      global_user_id: gitlabGlobalUserId,
      feature_enablement_type: gitlabFeatureEnablementType,
      instance_version: gitlabInstanceVersion,
      saas_duo_pro_namespace_ids: gitlaSaasDuoProNamespaceIds,
    } = this.#getConnectionDetails();

    const context = this.#codeSuggestionsContextMap.get(uniqueTrackingId);

    if (context) {
      context.data.gitlab_realm = realm;
      context.data.gitlab_instance_id = gitlabInstanceId;
      context.data.gitlab_host_name = gitlabHostName;
      context.data.gitlab_global_user_id = gitlabGlobalUserId;
      context.data.gitlab_feature_enablement_type = gitlabFeatureEnablementType;
      context.data.gitlab_instance_version = gitlabInstanceVersion;
      context.data.gitlab_saas_duo_pro_namespace_ids = gitlaSaasDuoProNamespaceIds;
      this.#codeSuggestionsContextMap.set(uniqueTrackingId, context);
    }
  }

  // FIXME: the set and update context methods have similar logic and they should have to grow linearly with each new attribute
  // the solution might be some generic update method used by both
  updateCodeSuggestionsContext(
    uniqueTrackingId: string,
    contextUpdate: Partial<ICodeSuggestionContextUpdate>,
  ) {
    const context = this.#codeSuggestionsContextMap.get(uniqueTrackingId);
    const { model, region, status, optionsCount, acceptedOption, isDirectConnection } =
      contextUpdate;

    if (context) {
      if (model) {
        if (model.lang) {
          context.data.language = model.lang;
        }
        context.data.model_engine = model.engine ?? null;
        context.data.model_name = model.name ?? null;
        context.data.input_tokens = model?.tokens_consumption_metadata?.input_tokens ?? null;
        context.data.output_tokens = model.tokens_consumption_metadata?.output_tokens ?? null;
        context.data.context_tokens_sent =
          model.tokens_consumption_metadata?.context_tokens_sent ?? null;
        context.data.context_tokens_used =
          model.tokens_consumption_metadata?.context_tokens_used ?? null;
      }

      context.data.region = region ?? model?.region ?? null;

      if (status) {
        context.data.api_status_code = status;
      }

      if (optionsCount) {
        context.data.options_count = optionsCount;
      }

      if (isDirectConnection !== undefined) {
        context.data.is_direct_connection = isDirectConnection;
      }

      if (acceptedOption) {
        context.data.accepted_option = acceptedOption;
      }

      this.#codeSuggestionsContextMap.set(uniqueTrackingId, context);
    }
  }

  async #trackCodeSuggestionsEvent(
    eventType: CODE_SUGGESTIONS_TRACKING_EVENTS,
    uniqueTrackingId: string,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const event: StructuredEvent = {
      category: CODE_SUGGESTIONS_CATEGORY,
      action: eventType,
      label: uniqueTrackingId,
    };

    try {
      const contexts: SelfDescribingJson[] = [this.#clientContext];
      const codeSuggestionContext = this.#codeSuggestionsContextMap.get(uniqueTrackingId);

      if (codeSuggestionContext) {
        contexts.push(codeSuggestionContext);
      }

      const suggestionContextValid = this.#snowplowService.validateContext(
        CodeSuggestionContextSchema,
        codeSuggestionContext?.data,
      );

      if (!suggestionContextValid) {
        return;
      }
      const ideExtensionContextValid = this.#snowplowService.validateContext(
        IdeExtensionContextSchema,
        this.#clientContext?.data,
      );
      if (!ideExtensionContextValid) {
        return;
      }
      await this.#snowplowService.trackStructuredEvent(event, contexts);
    } catch (error) {
      this.#logger.warn(`Failed to track telemetry event: ${eventType}`, error);
    }
  }

  trackEvent(
    event: CodeSuggestionsTelemetryEvent,
    uniqueTrackingId: CodeSuggestionsTelemetryEventContext,
  ): void {
    const isStreaming = Boolean(
      this.#codeSuggestionsContextMap.get(uniqueTrackingId)?.data.is_streaming,
    );
    if (this.#suggestionStateManager.canUpdateState(uniqueTrackingId, event, isStreaming)) {
      this.#suggestionStateManager.updateSuggestionState(uniqueTrackingId, event, isStreaming);
      this.#trackCodeSuggestionsEvent(event, uniqueTrackingId).catch((e) =>
        this.#logger.warn('Could not track telemetry', e),
      );
    }
  }

  #rejectOpenedSuggestions() {
    this.#logger.debug(`Reject all opened suggestions`);
    this.#suggestionStateManager
      .getOpenedSuggestions()
      .forEach((uniqueTrackingId) =>
        this.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId),
      );
  }

  #hasAdvancedContext(advancedContexts?: AdditionalContext[]): boolean | null {
    const advancedContextFeatureFlagsEnabled = shouldUseOpenTabs(
      this.#featureFlagService,
      this.#configService,
    );

    if (advancedContextFeatureFlagsEnabled) {
      return Boolean(advancedContexts?.length);
    }

    return null;
  }

  #getAdvancedContextData({
    additionalContexts,
    documentContext,
  }: {
    additionalContexts?: AdditionalContext[];
    documentContext?: IDocContext;
  }) {
    const hasAdvancedContext = this.#hasAdvancedContext(additionalContexts);

    const contentAboveCursorSizeBytes = documentContext?.prefix
      ? getByteSize(documentContext.prefix)
      : 0;
    const contentBelowCursorSizeBytes = documentContext?.suffix
      ? getByteSize(documentContext.suffix)
      : 0;

    const contextItems: ContextItem[] | null =
      additionalContexts?.map((item) => ({
        file_extension: item.name.split('.').pop() || '',
        type: item.type,
        resolution_strategies: item.resolution_strategies,
        byte_size: item?.content ? getByteSize(item.content) : 0,
      })) ?? null;

    const contextItemsResolutionStrategiesSummary = Array.from(
      new Set(additionalContexts?.flatMap((item) => item.resolution_strategies)),
    );

    const totalContextSizeBytes =
      contextItems?.reduce((total, item) => total + item.byte_size, 0) ?? 0;

    return {
      totalContextSizeBytes,
      contentAboveCursorSizeBytes,
      contentBelowCursorSizeBytes,
      contextItems,
      contextItemsResolutionStrategiesSummary,
      hasAdvancedContext,
    };
  }

  #getIsInvoked(triggerKind?: InlineCompletionTriggerKind): boolean | null {
    let isInvoked = null;

    if (triggerKind === InlineCompletionTriggerKind.Invoked) {
      isInvoked = true;
    } else if (triggerKind === InlineCompletionTriggerKind.Automatic) {
      isInvoked = false;
    }

    return isInvoked;
  }

  // The connection details endpoint is only available in GitLab 18.3, so we need to fallback to the
  //  old behavior where details were fetched from direct connection via `code_suggestions/direct_access` headers.
  #getConnectionDetails(): IConnectionDetails {
    const defaultConnectionDetails: IConnectionDetails = {
      realm: GitlabRealm.saas,
      instance_id: null,
      instance_version: this.#api.instanceInfo?.instanceVersion ?? null,
      global_user_id: null,
      host_name: null,
      saas_duo_pro_namespace_ids: [],
      feature_enablement_type: null,
    };
    let connectionDetails: Partial<IConnectionDetails> = {};

    if (this.#connectionDetailsService.details) {
      // If `code_suggestions/connection_details` API is available, fetch details from there.
      connectionDetails = this.#connectionDetailsService.details;
    } else if (this.#directConnectionDetailsService.details) {
      // If GitLab version is lower than 18.3, `code_suggestions/details` API is not available,
      // so we try to fetch details from `code_suggestions/direct_access`.
      // If GitLab instance does not have direct access to AIGW AND version is below 18.3, we cannot reliably
      // fetch connection details and telemetry will be missing these attributes.
      const {
        gitlab_instance_id: gitLabInstanceId,
        gitlab_global_user_id: gitLabGlobalUserId,
        gitlab_host_name: gitLabHostName,
        gitlab_saas_duo_pro_namespace_ids: gitLabSaasDuoProNamespaceIds,
        gitlab_feature_enablement_type: gitLabFeatureEnablementType,
      } = transformHeadersToSnowplowOptions(this.#directConnectionDetailsService.details.headers);

      connectionDetails = {
        instance_id: gitLabInstanceId,
        instance_version: this.#api.instanceInfo?.instanceVersion,
        global_user_id: gitLabGlobalUserId,
        host_name: gitLabHostName,
        saas_duo_pro_namespace_ids: gitLabSaasDuoProNamespaceIds ?? [],
        feature_enablement_type: gitLabFeatureEnablementType,
        realm: this.#gitlabRealm ?? GitlabRealm.saas,
      };
    }

    return mergeWith(defaultConnectionDetails, connectionDetails, (objValue, srcValue) => {
      if (srcValue === undefined || srcValue === null) {
        return objValue;
      }

      if (isArray(objValue)) {
        return objValue.concat(srcValue);
      }

      return undefined;
    });
  }
}
