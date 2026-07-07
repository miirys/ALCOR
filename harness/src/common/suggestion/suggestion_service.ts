import { uniqueId } from 'lodash';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { CreditLedgerService, CreditLedgerFactory } from '@gitlab-org/credit-ledger';
import {
  CancellationToken,
  CompletionItem,
  CompletionParams,
  Disposable,
  InitializeParams,
  InlineCompletionContext,
  InlineCompletionList,
  InlineCompletionParams,
  InlineCompletionTriggerKind,
  Position,
  TextDocumentIdentifier,
} from 'vscode-languageserver';
import { type AIContextItem } from '@gitlab-org/ai-context';
import { URI } from 'vscode-uri';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  CircuitBreaker,
  isFetchError,
  ClientFeatureFlags,
  FeatureFlagService,
  isSanitizedError,
} from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { RepositoryService } from '@gitlab-org/repositories';
import {
  ConfigService,
  ClientConfig,
  SuggestionSource,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { ErrorHandler, SanitizedError } from '@gitlab-org/errors';
import { IClientContext } from '@gitlab-org/telemetry';
import {
  aiContextItemsToRequestBody,
  codeSuggestionsDisabledLog,
  shouldUseOpenTabs,
} from '../suggestion_client/helpers';
import { GitLabApiClient, SuggestionOptionStream, SuggestionOption, GenerationType } from '../api';
import { AdditionalContext, SuggestionOptionText } from '../api_types';
import { DocumentTransformerService, IDocContext } from '../document_transformer_service';
import { DuoProjectAccessChecker, isUsageQuotaExceededError } from '../services/duo_access';
import {
  MANUAL_REQUEST_OPTIONS_COUNT,
  OptionsCount,
  DefaultSuggestionClient,
} from '../suggestion_client';
import { canClientTrackEvent, generateUniqueTrackingId } from '../tracking/code_suggestions/utils';
import { TreeAndLanguage, TreeSitterParser, getIntent } from '../tree_sitter';
import {
  completionOptionMapper,
  inlineCompletionOptionMapper,
  isStream,
  isTextSuggestion,
} from '../utils/suggestion_mappers';
import { FallbackClient } from '../suggestion_client/fallback_client';
import { PostProcessorPipeline } from '../suggestion_client/post_processors/post_processor_pipeline';
import { SUGGESTIONS_DEBOUNCE_INTERVAL_MS } from '../constants';
import { SuggestionApiErrorCheck } from '../feature_state/suggestion_api_error_check';
import { CodeSuggestionsCreditsCheck } from '../feature_state/code_suggestions_credits_check';
import { extractScript } from '../utils/vue_utils';
import { waitMs } from '../utils/wait_ms';
import { CodeSuggestionsTelemetryTracker } from '../tracking/code_suggestions/code_suggestions_multi_tracker';
import {
  DefaultPreProcessorPipeline,
  PreProcessorPipeline,
} from '../suggestion_client/pre_processors/pre_processor_pipeline';
import { CodeSuggestionsAIRequest } from '../ai_context_management/code_suggestions_context_provider';
import { CodeSuggestionContextManager } from '../ai_context_management/code_suggestion_context_manager';
import { DirectConnectionDetailsService } from './direct_connection_details_service';
import { DirectConnectionClient } from './direct_connection_client';
import {
  isAtOrNearEndOfLine,
  shouldRejectCompletionWithSelectedCompletionTextMismatch,
} from './suggestion_filter';
import { SuggestionsCache } from './suggestions_cache';
import { StreamingHandler } from './streaming_handler';

export type ChangeConfigOptions = { settings: ClientConfig };

export type CustomInitializeParams = InitializeParams & {
  initializationOptions?: IClientContext;
};

export const WORKFLOW_MESSAGE_NOTIFICATION = '$/gitlab/workflowMessage';

/* CompletionRequest represents LS client's request for either completion or inlineCompletion */
export interface CompletionRequest {
  textDocument: TextDocumentIdentifier;
  position: Position;
  token: CancellationToken;
  inlineCompletionContext?: InlineCompletionContext;
}

export interface SuggestionService {
  completionHandler: (
    params: CompletionParams,
    token: CancellationToken,
  ) => Promise<CompletionItem[]>;
  inlineCompletionHandler: (
    params: InlineCompletionParams,
    token: CancellationToken,
  ) => Promise<InlineCompletionList>;
}

export const SuggestionService = createInterfaceId<SuggestionService>('SuggestionService');

@Injectable(SuggestionService, [
  Logger,
  CodeSuggestionsTelemetryTracker,
  ConfigService,
  DirectConnectionDetailsService,
  GitLabApiClient,
  ErrorHandler,
  DocumentTransformerService,
  TreeSitterParser,
  FeatureFlagService,
  DuoProjectAccessChecker,
  SuggestionApiErrorCheck,
  PostProcessorPipeline,
  StreamingHandler,
  CodeSuggestionContextManager,
  PreProcessorPipeline,
  RepositoryService,
  LsFetch,
  CodeSuggestionsCreditsCheck,
  CreditLedgerService,
])
export class DefaultSuggestionService implements SuggestionService {
  #configService: ConfigService;

  #directConnectionDetailsService: DirectConnectionDetailsService;

  #api: GitLabApiClient;

  #logger: Logger;

  #tracker: CodeSuggestionsTelemetryTracker;

  #errorHandler: ErrorHandler;

  #documentTransformerService: DocumentTransformerService;

  #circuitBreaker: CircuitBreaker;

  #subscriptions: Disposable[] = [];

  #suggestionsCache: SuggestionsCache;

  #treeSitterParser: TreeSitterParser;

  #duoProjectAccessChecker: DuoProjectAccessChecker;

  #featureFlagService: FeatureFlagService;

  #postProcessorPipeline: PostProcessorPipeline;

  #streamingHandler: StreamingHandler;

  #aiContextManager: CodeSuggestionContextManager;

  #preProcessorPipeline: DefaultPreProcessorPipeline;

  #fallbackClient: FallbackClient;

  #repositoryService: RepositoryService;

  #lsFetch: LsFetch;

  #creditsCheck: CodeSuggestionsCreditsCheck;

  constructor(
    logger: Logger,
    telemetryTracker: CodeSuggestionsTelemetryTracker,
    configService: ConfigService,
    directConnectionDetailsService: DirectConnectionDetailsService,
    api: GitLabApiClient,
    errorHandler: ErrorHandler,
    documentTransformerService: DocumentTransformerService,
    treeSitterParser: TreeSitterParser,
    featureFlagService: FeatureFlagService,
    duoProjectAccessChecker: DuoProjectAccessChecker,
    suggestionApiErrorCheck: SuggestionApiErrorCheck,
    postProcessorPipeline: PostProcessorPipeline,
    streamingHandler: StreamingHandler,
    aiContextManager: CodeSuggestionContextManager,
    preProcessorPipeline: DefaultPreProcessorPipeline,
    repositoryService: RepositoryService,
    lsFetch: LsFetch,
    creditsCheck: CodeSuggestionsCreditsCheck,
    creditLedgerFactory?: CreditLedgerFactory,
  ) {
    this.#configService = configService;
    this.#directConnectionDetailsService = directConnectionDetailsService;
    this.#api = api;
    this.#tracker = telemetryTracker;
    this.#errorHandler = errorHandler;
    this.#documentTransformerService = documentTransformerService;
    this.#suggestionsCache = new SuggestionsCache(this.#configService);
    this.#treeSitterParser = treeSitterParser;
    this.#featureFlagService = featureFlagService;
    this.#circuitBreaker = suggestionApiErrorCheck;
    this.#logger = withPrefix(logger, '[SuggestionService]');
    this.#postProcessorPipeline = postProcessorPipeline;
    this.#streamingHandler = streamingHandler;
    this.#aiContextManager = aiContextManager;
    this.#preProcessorPipeline = preProcessorPipeline;
    this.#lsFetch = lsFetch;
    this.#fallbackClient = new FallbackClient(
      new DirectConnectionClient(
        this.#api,
        this.#configService,
        this.#directConnectionDetailsService,
        this.#lsFetch,
        creditLedgerFactory,
      ),
      new DefaultSuggestionClient(this.#api),
    );

    this.#duoProjectAccessChecker = duoProjectAccessChecker;
    this.#repositoryService = repositoryService;
    this.#creditsCheck = creditsCheck;
  }

  completionHandler = async (
    { textDocument, position }: CompletionParams,
    token: CancellationToken,
  ): Promise<CompletionItem[]> => {
    this.#logger.debug('Completion requested');
    const suggestionOptions = await this.#getSuggestionOptions({ textDocument, position, token });
    if (suggestionOptions.find(isStream)) {
      this.#logger.warn(
        `Completion response unexpectedly contained streaming response. Streaming for completion is not supported. Please report this issue.`,
      );
    }
    return completionOptionMapper(suggestionOptions.filter(isTextSuggestion));
  };

  #getSuggestionOptions = async (request: CompletionRequest): Promise<SuggestionOption[]> => {
    const { textDocument, position, token, inlineCompletionContext: context } = request;
    const documentContext = this.#documentTransformerService.getContext(
      textDocument.uri,
      position,
      this.#configService.get('workspaceFolders') ?? [],
      context,
    );

    if (!documentContext) {
      this.#logger.debug('Document context is not available');
      return [];
    }

    const cachedSuggestions = this.#useAndTrackCachedSuggestions(
      textDocument,
      position,
      documentContext,
      context?.triggerKind,
    );

    if (context?.triggerKind === InlineCompletionTriggerKind.Invoked) {
      const options = await this.#handleNonStreamingCompletion(request, documentContext);

      options.unshift(...(cachedSuggestions ?? []));
      (cachedSuggestions ?? []).forEach((cs) =>
        this.#tracker.setTrackingContext?.({
          uniqueTrackingId: cs.uniqueTrackingId,
          context: {
            optionsCount: options.length,
            suggestionOptions: cachedSuggestions,
          },
        }),
      );

      return options;
    }

    if (cachedSuggestions) {
      return cachedSuggestions;
    }

    // debounce
    await waitMs(SUGGESTIONS_DEBOUNCE_INTERVAL_MS);
    if (token.isCancellationRequested) {
      this.#logger.debug('Debounce triggered for completion');
      return [];
    }

    if (
      context &&
      shouldRejectCompletionWithSelectedCompletionTextMismatch(
        context,
        this.#documentTransformerService.get(textDocument.uri),
      )
    ) {
      return [];
    }
    const treeAndPosition = await this.#getTreeAndPosition(documentContext);
    const aiContextItems = await this.#getAIContextItems(documentContext, treeAndPosition);
    const preProcessed = await this.#preProcessorPipeline.run({
      documentContext,
      aiContextItems,
    });
    const additionalContexts = aiContextItemsToRequestBody(preProcessed.aiContextItems);

    // right now we only support streaming for inlineCompletion
    // if the context is present, we know we are handling inline completion
    if (
      context &&
      this.#featureFlagService.isClientFlagEnabled(ClientFeatureFlags.StreamCodeGenerations)
    ) {
      let intentResolution;
      if (treeAndPosition) {
        intentResolution = await getIntent({
          position: treeAndPosition.position,
          prefix: documentContext.prefix,
          suffix: documentContext.suffix,
          treeAndLanguage: treeAndPosition.treeAndLanguage,
        });
      }

      if (intentResolution?.intent === 'generation') {
        // Note: we want to use the pre-processed document context here
        // because the document context may have been trimmed or modified by the pre-processor
        return this.#handleStreamingInlineCompletion(
          preProcessed.documentContext,
          intentResolution.commentForCursor?.content,
          intentResolution.generationType,
          additionalContexts,
          token,
        );
      }
    }

    // Note: we want to use the pre-processed document context here
    // because the document context may have been trimmed or modified by the pre-processor
    return this.#handleNonStreamingCompletion(
      request,
      preProcessed.documentContext,
      additionalContexts,
    );
  };

  inlineCompletionHandler = async (
    params: InlineCompletionParams,
    token: CancellationToken,
  ): Promise<InlineCompletionList> => {
    this.#logger.debug('Inline completion requested');

    const options = await this.#getSuggestionOptions({
      textDocument: params.textDocument,
      position: params.position,
      token,
      inlineCompletionContext: params.context,
    });
    return inlineCompletionOptionMapper(params, options);
  };

  async #handleStreamingInlineCompletion(
    context: IDocContext,
    userInstruction?: string,
    generationType?: GenerationType,
    additionalContexts?: AdditionalContext[],
    token?: CancellationToken,
  ): Promise<SuggestionOptionStream[]> {
    if (this.#circuitBreaker.isOpen()) {
      this.#logger.warn('Stream was not started as the circuit breaker is open.');
      return [];
    }

    let contextProjectPath: string | undefined;

    if (context.workspaceFolder) {
      const { project } = this.#duoProjectAccessChecker.checkProjectStatus(
        context.uri,
        context.workspaceFolder,
      );

      contextProjectPath = project?.namespaceWithPath;
    }

    if (token?.isCancellationRequested) {
      this.#logger.debug('Completion request cancelled before streaming started');
      return [];
    }

    const streamId = uniqueId('code-suggestion-stream-');
    const uniqueTrackingId = generateUniqueTrackingId();

    setTimeout(() => {
      this.#logger.debug(`Starting to stream (id: ${streamId})`);

      this.#streamingHandler
        .startStream({
          streamId,
          uniqueTrackingId,
          documentContext: context,
          userInstruction,
          generationType,
          additionalContexts,
          contextProjectPath,
          suggestionsCache: this.#suggestionsCache,
        })
        .catch(async (e) => {
          this.#circuitBreaker.error(e);
          this.#errorHandler.handleError('Failed to start streaming', e);
        });
    }, 0);

    return [{ streamId, uniqueTrackingId }];
  }

  async #handleNonStreamingCompletion(
    request: CompletionRequest,
    documentContext: IDocContext,
    additionalContexts?: AdditionalContext[],
  ): Promise<SuggestionOptionText[]> {
    const uniqueTrackingId: string = generateUniqueTrackingId();

    try {
      return await this.#getSuggestions({
        request,
        uniqueTrackingId,
        documentContext,
        additionalContexts,
      });
    } catch (e) {
      if (isFetchError(e)) {
        this.#tracker.setTrackingContext?.({
          uniqueTrackingId,
          context: { status: e.status },
        });

        if (isUsageQuotaExceededError(e)) {
          this.#creditsCheck.setCreditsExceeded(true);
        }
      }
      this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, uniqueTrackingId);
      this.#circuitBreaker.error(e);
      this.#errorHandler.handleError(
        'Failed to get code suggestions!',
        new SanitizedError(
          `Failed to get code suggestions! ${isSanitizedError(e) ? e.sanitizedMessage : ''}`,
          e,
        ),
      );
      return [];
    }
  }

  /**
   * FIXME: unify how we get code completion and generation
   * so we don't have duplicate intent detection (see `tree_sitter_middleware.ts`)
   * */
  async #getTreeAndPosition(context: IDocContext): Promise<
    | {
        treeAndLanguage: TreeAndLanguage;
        position: Position;
      }
    | undefined
  > {
    try {
      let treeAndLanguage;
      let position;

      // Vue files require special handling because we do not have a tree-sitter parser for Vue
      // We need to extract the script content and adjust the cursor position to properly analyze
      // the JavaScript portion of the Vue file.
      if (context.languageId === 'vue') {
        const scriptResult = extractScript(context.prefix + context.suffix);
        if (!scriptResult) return undefined;

        const { scriptContent, scriptStartCharacter, scriptStartLine, language } = scriptResult;
        treeAndLanguage = await this.#treeSitterParser.parseContent(scriptContent, language);
        // Adjust position: map cursor from full Vue file to script content
        position = {
          line: context.position.line - scriptStartLine,
          character: context.position.character - scriptStartCharacter,
        };
      } else {
        treeAndLanguage = await this.#treeSitterParser.parseFile(context);
        position = context.position;
      }

      if (!treeAndLanguage) {
        return undefined;
      }

      return {
        treeAndLanguage,
        position,
      };
    } catch (error) {
      this.#errorHandler.handleError('Failed to parse with tree sitter', error);
      return undefined;
    }
  }

  #trackShowIfNeeded(uniqueTrackingId: string) {
    if (
      !canClientTrackEvent(
        this.#configService.get('telemetry.actions'),
        CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
      )
    ) {
      /* If the Client can detect when the suggestion is shown in the IDE, it will notify the Server.
          Otherwise the server will assume that returned suggestions are shown and tracks the event */
      this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
    }
  }

  async #getSuggestions({
    request,
    uniqueTrackingId,
    documentContext,
    additionalContexts,
  }: {
    request: CompletionRequest;
    uniqueTrackingId: string;
    documentContext: IDocContext;
    additionalContexts?: AdditionalContext[];
  }): Promise<SuggestionOptionText[]> {
    const { textDocument, position, token } = request;
    const triggerKind = request.inlineCompletionContext?.triggerKind;
    this.#logger.info('Suggestion requested.');

    if (this.#circuitBreaker.isOpen()) {
      this.#logger.warn('Code suggestions were not requested as the circuit breaker is open.');
      return [];
    }

    if (!this.#configService.get('token')) {
      return [];
    }
    // Do not send a suggestion if content is less than 10 characters
    const contentLength =
      (documentContext?.prefix?.length || 0) + (documentContext?.suffix?.length || 0);
    if (contentLength < 10) {
      return [];
    }

    if (!isAtOrNearEndOfLine(documentContext.suffix)) {
      return [];
    }

    const branchName = await this.#getBranchName(documentContext);

    if (token.isCancellationRequested) {
      this.#logger.debug('Completion request cancelled before suggestions requested from client');
      return [];
    }

    // Creates the suggestion and tracks suggestion_requested
    this.#tracker.setTrackingContext?.({
      uniqueTrackingId,
      context: {
        documentContext,
        triggerKind,
        additionalContexts,
        branchName,
      },
    });

    /** how many suggestion options should we request from the API */
    const optionsCount: OptionsCount =
      triggerKind === InlineCompletionTriggerKind.Invoked ? MANUAL_REQUEST_OPTIONS_COUNT : 1;
    const suggestionsResponse = await this.#fallbackClient.getSuggestions(
      {
        document: documentContext,
        projectPath: this.#configService.get('projectPath'),
        optionsCount,
        additionalContexts,
      },
      token,
    );

    this.#tracker.setTrackingContext?.({
      uniqueTrackingId,
      context: {
        model: suggestionsResponse?.model,
        status: suggestionsResponse?.status,
        optionsCount: suggestionsResponse?.choices?.length,
        isDirectConnection: suggestionsResponse?.isDirectConnection,
      },
    });

    if (suggestionsResponse?.error) {
      throw new Error(suggestionsResponse.error);
    }
    this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

    this.#circuitBreaker.success();

    const areSuggestionsNotProvided =
      !suggestionsResponse?.choices?.length ||
      suggestionsResponse?.choices.every(({ text }) => !text?.length);

    const suggestionOptions = (suggestionsResponse?.choices || []).map((choice, index) => ({
      ...choice,
      index,
      uniqueTrackingId,
      model: suggestionsResponse?.model,
    }));

    const processedChoices = await this.#postProcessorPipeline.run({
      documentContext,
      input: suggestionOptions,
    });

    this.#suggestionsCache.addToSuggestionCache({
      request: {
        document: textDocument,
        position,
        context: documentContext,
        additionalContexts,
      },
      suggestions: processedChoices,
      suggestionContext: {
        branchName,
      },
    });

    if (token.isCancellationRequested) {
      this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED, uniqueTrackingId);
      return [];
    }

    if (areSuggestionsNotProvided) {
      this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED, uniqueTrackingId);
      return [];
    }

    this.#tracker.setTrackingContext?.({
      uniqueTrackingId,
      context: { suggestionOptions },
    });

    this.#trackShowIfNeeded(uniqueTrackingId);

    return processedChoices;
  }

  dispose() {
    this.#subscriptions.forEach((subscription) => subscription?.dispose());
  }

  #useAndTrackCachedSuggestions(
    textDocument: TextDocumentIdentifier,
    position: Position,
    documentContext: IDocContext,
    triggerKind?: InlineCompletionTriggerKind,
  ): SuggestionOptionText[] | undefined {
    const suggestionsCache = this.#suggestionsCache.getCachedSuggestions({
      document: textDocument,
      position,
      context: documentContext,
    });

    if (suggestionsCache?.options?.length) {
      const { uniqueTrackingId, model } = suggestionsCache.options[0];
      const { additionalContexts, suggestionContext } = suggestionsCache;

      this.#tracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext,
          source: SuggestionSource.cache,
          triggerKind,
          suggestionOptions: suggestionsCache?.options,
          model,
          additionalContexts,
          ...suggestionContext,
        },
      });

      this.#tracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
      this.#trackShowIfNeeded(uniqueTrackingId);

      return suggestionsCache.options.map((option, index) => ({ ...option, index }));
    }

    return undefined;
  }

  async #getAIContextItems(
    documentContext: IDocContext,
    treeAndPosition:
      | {
          treeAndLanguage: TreeAndLanguage;
          position: Position;
        }
      | undefined,
  ): Promise<AIContextItem[]> {
    const openTabsEnabled = shouldUseOpenTabs(this.#featureFlagService, this.#configService);

    if (!openTabsEnabled) {
      this.#logger.debug(codeSuggestionsDisabledLog);
      return [];
    }

    // Note: treeAndPosition is optional because it may not always be available (e.g. lack of tree-sitter parser)
    // We still want to return AI context items that can be used for other features (open tabs, etc.)
    const request = {
      iDocContext: documentContext,
      treeAndLanguage: treeAndPosition?.treeAndLanguage,
    } satisfies CodeSuggestionsAIRequest;
    return this.#aiContextManager.searchContextItems(request);
  }

  async #getBranchName(documentContext?: IDocContext): Promise<string | undefined> {
    if (!documentContext || !documentContext.workspaceFolder) {
      return undefined;
    }

    const repository = await this.#repositoryService.getMatchingRepository(
      URI.parse(documentContext.uri),
      documentContext.workspaceFolder.uri,
    );
    return repository?.getTrackingBranchName();
  }
}
