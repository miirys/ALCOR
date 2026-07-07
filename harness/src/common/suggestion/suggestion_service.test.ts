import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import {
  CancellationToken,
  CompletionItem,
  CompletionParams,
  InlineCompletionContext,
  InlineCompletionList,
  InlineCompletionParams,
  InlineCompletionTriggerKind,
  Position,
  Range,
} from 'vscode-languageserver';
import Parser, { Language, Tree } from 'web-tree-sitter';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import {
  CIRCUIT_BREAK_INTERVAL_MS,
  FetchError,
  ApiRequest,
  FeatureFlagService,
} from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { RepositoryService, type Repository } from '@gitlab-org/repositories';
import {
  ConfigService,
  DefaultConfigService,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { ErrorHandler } from '@gitlab-org/errors';
import { IMPORT_FILE, OPEN_TAB_FILE } from '@gitlab-org/ai-context/test_utils';
import type { OpenTabAIContextItem, ImportAIContextItem } from '@gitlab-org/ai-context';
import { GitLabApiClient } from '../api';
import { START_STREAMING_COMMAND, SUGGESTION_ACCEPTED_COMMAND } from '../constants';
import { DocumentTransformerService } from '../document_transformer_service';
import { MANUAL_REQUEST_OPTIONS_COUNT, SuggestionResponse } from '../suggestion_client';
import {
  COMPLETION_PARAMS,
  LONG_COMPLETION_CONTEXT,
  SHORT_COMPLETION_CONTEXT,
  CONTEXT_WITH_WORKSPACE_FOLDER,
} from '../test_utils/mocks';
import { generateUniqueTrackingId } from '../tracking/code_suggestions/utils';
import { Comment, IntentResolution, TreeSitterParser, getIntent } from '../tree_sitter';
import { DuoProjectAccessChecker } from '../services/duo_access';
import { DefaultSuggestionApiErrorCheck } from '../feature_state/suggestion_api_error_check';
import { DefaultPostProcessorPipeline } from '../suggestion_client/post_processors/default_post_processor_pipeline';
import * as VueUtils from '../utils/vue_utils';
import { CodeSuggestionsTelemetryTracker } from '../tracking/code_suggestions/code_suggestions_multi_tracker';
import { CodeSuggestionsCreditsCheck } from '../feature_state/code_suggestions_credits_check';
import { DuoProjectStatus } from '../services/duo_access/project_access_checker';
import { DuoProject } from '../services/duo_access/workspace_project_access_cache';
import { CodeSuggestionContextManager } from '../ai_context_management/code_suggestion_context_manager';
import { DefaultPreProcessorPipeline } from '../suggestion_client/pre_processors/pre_processor_pipeline';
import * as HelperModule from '../suggestion_client/helpers';
import { DirectConnectionDetailsService } from './direct_connection_details_service';
import { DirectConnectionClient } from './direct_connection_client';
import * as completionFilters from './suggestion_filter';
import { SuggestionsCache } from './suggestions_cache';
import { DefaultSuggestionService } from './suggestion_service';
import { StreamingHandler } from './streaming_handler';

jest.mock('./suggestions_cache');
jest.mock('./suggestion_filter');
jest.mock('./streaming_handler');
jest.mock('../tree_sitter/intent_resolver', () => ({
  getIntent: jest.fn(),
}));
jest.mock('../tracking/code_suggestions/utils');

jest.useFakeTimers();
const TRACKING_ID = 'unique tracking id';
jest.mock('../suggestion/direct_connection_client');
jest.mock('../tracking/code_suggestions/utils');
jest.mock('../suggestion_client/helpers');

jest.mocked(generateUniqueTrackingId).mockReturnValue(TRACKING_ID);

interface ServiceConstructorOptions {
  configService: ConfigService;
  directConnectionDetailsService: DirectConnectionDetailsService;
  api: GitLabApiClient;
  documentTransformerService: DocumentTransformerService;
}

describe('DefaultSuggestionService', () => {
  let service: DefaultSuggestionService;
  let directConnectionDetailsService: DirectConnectionDetailsService;

  let startStream = jest.fn();
  let mockLogger: Logger;

  const TEST_EXPIRES_AT_S = 1713343569;
  const mockParseFile = jest.fn();
  const treeSitterParser = createFakePartial<TreeSitterParser>({
    parseFile: jest.fn().mockResolvedValue({
      parserInfo: {
        languageInfo: {
          name: 'typescript',
          extensions: ['.ts'],
          wasmPath: 'some/path/to/wasm',
        },
        parser: createFakePartial<Parser>({}),
      },
      tree: createFakePartial<Tree>({}),
    }),
    parseContent: jest.fn().mockResolvedValue({
      language: createFakePartial<Language>({}),
      tree: createFakePartial<Tree>({}),
    }),
  });
  const documentTransformerService = createFakePartial<DocumentTransformerService>({
    getContext: jest.fn(),
    get: jest.fn(),
  });

  const codeSuggestionsTelemetryTracker = createFakePartial<CodeSuggestionsTelemetryTracker>({
    setTrackingContext: jest.fn(),
    trackEvent: jest.fn(),
  });

  const errorHandler = createFakePartial<ErrorHandler>({
    handleError: jest.fn(),
  });

  const featureFlagService = createFakePartial<FeatureFlagService>({
    isInstanceFlagEnabled: jest.fn(),
    isClientFlagEnabled: jest.fn(),
  });

  const duoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
    checkProjectStatus: jest.fn().mockReturnValue({
      status: DuoProjectStatus.DuoEnabled,
      project: {
        namespaceWithPath: 'path/to/project',
        uri: 'file:///path/to/project/.git/config',
        enabled: true,
      } as DuoProject,
    }),
  });
  const postProcessorPipeline = new DefaultPostProcessorPipeline(treeSitterParser);

  const aiContextManager = createFakePartial<CodeSuggestionContextManager>({
    addContentToItems: jest.fn().mockResolvedValue([]),
    searchContextItems: jest.fn().mockResolvedValue([]),
  });

  const mockPreProcessorPipeline = createFakePartial<DefaultPreProcessorPipeline>({
    run: jest.fn().mockResolvedValue({
      aiContextItems: [],
      documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
    }),
  });

  const mockRepositoryService = createFakePartial<RepositoryService>({
    getMatchingRepository: jest.fn(),
  });

  const mockCreditsCheck = createFakePartial<CodeSuggestionsCreditsCheck>({
    setCreditsExceeded: jest.fn(),
  });

  const createService = (options: ServiceConstructorOptions) =>
    new DefaultSuggestionService(
      mockLogger,
      codeSuggestionsTelemetryTracker,
      options.configService,
      options.directConnectionDetailsService,
      options.api,
      errorHandler,
      options.documentTransformerService ?? documentTransformerService,
      treeSitterParser,
      featureFlagService,
      duoProjectAccessChecker,
      new DefaultSuggestionApiErrorCheck(),
      postProcessorPipeline,
      createFakePartial<StreamingHandler>({ startStream }),
      aiContextManager,
      mockPreProcessorPipeline,
      mockRepositoryService,
      createFakePartial<LsFetch>({
        post: jest.fn().mockResolvedValue(new Response()),
      }),
      mockCreditsCheck,
    );

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest
      .mocked(completionFilters.shouldRejectCompletionWithSelectedCompletionTextMismatch)
      .mockReturnValue(false);
    startStream = jest.fn().mockResolvedValue([]);

    directConnectionDetailsService = createFakePartial<DirectConnectionDetailsService>({
      expired: jest.fn().mockReturnValue(false),
      refreshIfNeeded: jest.fn(),
      details: {
        headers: {
          'X-Gitlab-Host-Name': 'gitlab.example.com',
          'X-Gitlab-Global-User-Id': 'mockGlobalUserId',
          'X-Gitlab-Instance-Id': '123',
          'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': '789',
        },
        expires_at: TEST_EXPIRES_AT_S,
      },
    });
  });

  afterEach(() => {
    (
      Object.keys(codeSuggestionsTelemetryTracker) as (keyof CodeSuggestionsTelemetryTracker)[]
    ).forEach((mockedMethod) => {
      (codeSuggestionsTelemetryTracker[mockedMethod] as jest.Mock).mockReset();
    });
  });

  describe('completionHandler && inlineCompletionHandler', () => {
    jest.mocked(featureFlagService.isInstanceFlagEnabled).mockReturnValue(true);

    const contextBodySpy = jest.spyOn(HelperModule, 'aiContextItemsToRequestBody');

    const exampleOpenTabs = [
      {
        ...OPEN_TAB_FILE,
        id: 'file://path/to/file1.ts',
        metadata: { ...OPEN_TAB_FILE.metadata, title: 'file1.ts' },
      },
    ] satisfies OpenTabAIContextItem[];

    const exampleImports = [
      {
        ...IMPORT_FILE,
        id: 'file://path/to/import-file.ts',
        metadata: { ...IMPORT_FILE.metadata, title: 'import-file.ts' },
      },
    ] satisfies ImportAIContextItem[];

    const exampleAIContextItems = [...exampleOpenTabs, ...exampleImports];

    const exampleAdditionalContexts = [
      {
        content: 'somecontent',
        name: 'file1',
        type: 'file' as const,
        resolution_strategies: ['open_tabs' as const],
      },
      {
        content: 'somecontent',
        name: 'import-file',
        type: 'file' as const,
        resolution_strategies: ['imports' as const],
      },
    ];

    const sampleDuoProjectAccessChecker = {
      status: DuoProjectStatus.DuoEnabled,
      project: {
        namespaceWithPath: 'path/to/project',
        uri: 'file:///path/to/project/.git/config',
        enabled: true,
      } as DuoProject,
    };

    const isAtOrNearEndOfLineListener = jest.spyOn(completionFilters, 'isAtOrNearEndOfLine');

    isAtOrNearEndOfLineListener.mockReturnValue(true);

    const mockGetCodeSuggestions = jest.fn();

    let api = createFakePartial<GitLabApiClient>({
      getCodeSuggestions: mockGetCodeSuggestions,
      onApiReconfigured: jest.fn(),
    });

    afterEach(() => {
      mockGetCodeSuggestions.mockReset();
      contextBodySpy.mockReset();
    });

    describe('completion', () => {
      const mockGetContext = jest.fn().mockReturnValue(LONG_COMPLETION_CONTEXT);
      let configService: ConfigService;
      let token: CancellationToken;

      const requestCompletionNoDebounce = async (
        params: CompletionParams,
        tkn: CancellationToken,
      ): Promise<CompletionItem[]> => {
        const result = service.completionHandler(params, tkn);
        await jest.runOnlyPendingTimersAsync();
        return result;
      };

      beforeEach(async () => {
        token = createFakePartial<CancellationToken>({ isCancellationRequested: false });
        configService = new DefaultConfigService();
        configService.set('token', 'abc');
        api = createFakePartial<GitLabApiClient>({
          getCodeSuggestions: mockGetCodeSuggestions,
          checkToken: jest.fn().mockResolvedValue({ valid: true }),
          onApiReconfigured: jest.fn(),
        });

        const mockedDocumentTransformer = createFakePartial<DocumentTransformerService>({
          getContext: mockGetContext,
        });

        jest
          .mocked(getIntent)
          .mockResolvedValue(createFakePartial<IntentResolution>({ intent: 'completion' }));

        service = createService({
          api,
          configService,
          directConnectionDetailsService,
          documentTransformerService: mockedDocumentTransformer,
        });
      });

      it('sends a suggestion when all setup is present', async () => {
        mockGetCodeSuggestions.mockReturnValueOnce({
          choices: [{ text: 'mock suggestion' }],
          model: {
            lang: 'js',
          },
        });

        const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
        expect(result.length).toEqual(1);
        const [suggestedItem] = result;
        expect(suggestedItem.insertText).toBe('mock suggestion');
        expect(suggestedItem.command).toEqual({
          title: expect.any(String),
          command: SUGGESTION_ACCEPTED_COMMAND,
          arguments: [TRACKING_ID],
        });
      });

      it('requests completion including projectPath from workspace settings', async () => {
        configService.set('projectPath', 'gitlab-org/gitlab-vscode-extension');
        await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
        expect(api.getCodeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({ project_path: 'gitlab-org/gitlab-vscode-extension' }),
          expect.objectContaining({ isCancellationRequested: false }),
        );
      });

      it('does not send a suggestion when context is short', async () => {
        mockGetContext.mockReturnValueOnce(SHORT_COMPLETION_CONTEXT);

        const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);

        expect(result).toEqual([]);
      });

      it('does not send a suggestion when in middle of line', async () => {
        isAtOrNearEndOfLineListener.mockReturnValueOnce(false);

        const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);

        expect(result).toEqual([]);
      });

      describe('Suggestions not provided', () => {
        it('should track suggestion not provided when no choices returned', async () => {
          mockGetCodeSuggestions.mockReturnValueOnce(() => ({
            choices: [],
            model: {
              lang: 'js',
            },
          }));

          const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
          expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent)).toHaveBeenCalledWith(
            CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
            TRACKING_ID,
          );
          expect(result).toEqual([]);
        });

        it('should track suggestion not provided when every choice is empty', async () => {
          mockGetCodeSuggestions.mockReturnValueOnce(() => ({
            choices: [{ text: '' }, { text: undefined }],
            model: {
              lang: 'js',
            },
          }));

          const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
          expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent)).toHaveBeenCalledWith(
            CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
            TRACKING_ID,
          );
          expect(result).toEqual([]);
        });
      });

      describe('Suggestions error', () => {
        const errorStatusCode = 400;

        const mockResponse = createFakeResponse({
          url: 'https://example.com/api/v4/project',
          status: errorStatusCode,
          text: 'Bad Request',
        });

        const mockGetCodeSuggestionsError = (response: Response = mockResponse, body?: string) => {
          const request = createFakePartial<ApiRequest<unknown>>({});
          mockGetCodeSuggestions.mockRejectedValueOnce(
            new FetchError(request, response, 'completion', body),
          );
        };

        it('should update code suggestion context with error status', async () => {
          mockGetCodeSuggestionsError();

          await requestCompletionNoDebounce(COMPLETION_PARAMS, token);

          expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
            uniqueTrackingId: TRACKING_ID,
            context: {
              status: errorStatusCode,
            },
          });

          expect(errorHandler.handleError).toHaveBeenCalled();
        });

        it('should set credits exceeded when 402 error with USAGE_QUOTA_EXCEEDED is received', async () => {
          const quotaResponse = createFakeResponse({
            url: 'https://example.com/api/v4/code_suggestions/completions',
            status: 402,
            text: JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
          });
          const request = createFakePartial<ApiRequest<unknown>>({});
          mockGetCodeSuggestions.mockRejectedValueOnce(
            new FetchError(
              request,
              quotaResponse,
              'completion',
              JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
            ),
          );

          await requestCompletionNoDebounce(COMPLETION_PARAMS, token);

          expect(mockCreditsCheck.setCreditsExceeded).toHaveBeenCalledWith(true);
        });

        it('should not set credits exceeded for non-quota errors', async () => {
          mockGetCodeSuggestionsError();

          await requestCompletionNoDebounce(COMPLETION_PARAMS, token);

          expect(mockCreditsCheck.setCreditsExceeded).not.toHaveBeenCalled();
        });
      });

      describe('Circuit breaking', () => {
        const getCompletions = async () => {
          const result = await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
          return result;
        };
        const turnOnCircuitBreaker = async () => {
          await getCompletions();
          await getCompletions();
          await getCompletions();
          await getCompletions();
        };

        it('starts breaking after 4 errors', async () => {
          mockGetCodeSuggestions.mockResolvedValue({
            choices: [{ text: 'mock suggestion' }],
            model: {
              lang: 'js',
            },
          });
          const successResult = await getCompletions();
          expect(successResult.length).toEqual(1);
          mockGetCodeSuggestions.mockRejectedValue(new Error('test problem'));
          await turnOnCircuitBreaker();

          mockGetCodeSuggestions.mockReset();
          mockGetCodeSuggestions.mockResolvedValue({
            choices: [{ text: 'mock suggestion' }],
            model: {
              lang: 'js',
            },
          });

          const result = await getCompletions();
          expect(result).toEqual([]);
          expect(mockGetCodeSuggestions).not.toHaveBeenCalled();
          expect(errorHandler.handleError).toHaveBeenCalled();
        });

        it(`fetches completions again after circuit breaker's break time elapses`, async () => {
          jest.useFakeTimers().setSystemTime(new Date(Date.now()));

          mockGetCodeSuggestions.mockRejectedValue(new Error('test problem'));
          await turnOnCircuitBreaker();

          mockGetCodeSuggestions.mockReset();
          mockGetCodeSuggestions.mockResolvedValue({
            choices: [{ text: 'mock suggestion' }],
            model: {
              lang: 'js',
            },
          });
          jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 1);

          const result = await getCompletions();

          expect(result).toHaveLength(1);
          expect(mockGetCodeSuggestions).toHaveBeenCalled();
        });
      });

      describe('Debouncing', () => {
        beforeEach(() => {
          mockGetCodeSuggestions.mockResolvedValue({
            choices: [{ text: 'mock suggestion' }],
            model: {
              lang: 'js',
            },
          });
        });

        it('returns empty result if token was cancelled before debounce interval', async () => {
          const testToken = { isCancellationRequested: false };

          const completionPromise = service.completionHandler(
            COMPLETION_PARAMS,
            testToken as CancellationToken,
          );
          testToken.isCancellationRequested = true;
          await jest.runAllTimersAsync();

          const result = await completionPromise;
          expect(result).toEqual([]);
        });

        it('continues to call API if token has not been cancelled before debounce interval', async () => {
          const testToken = { isCancellationRequested: false };
          const completionPromise = service.completionHandler(
            COMPLETION_PARAMS,
            testToken as CancellationToken,
          );
          await jest.runAllTimersAsync();

          const result = await completionPromise;
          expect(result.length).toEqual(1);
        });
      });

      describe('Additional Context', () => {
        beforeEach(async () => {
          jest.mocked(HelperModule.shouldUseOpenTabs).mockReturnValueOnce(true);
          jest.mocked(aiContextManager.searchContextItems).mockResolvedValue(exampleAIContextItems);
          contextBodySpy.mockReturnValue(exampleAdditionalContexts);
          jest.mocked(mockPreProcessorPipeline.run).mockResolvedValueOnce({
            aiContextItems: exampleAIContextItems,
            documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
          });

          await requestCompletionNoDebounce(COMPLETION_PARAMS, token);
        });

        it('"getCodeSuggestions" should have additional context passed when feature is enabled', async () => {
          expect(aiContextManager.searchContextItems).toHaveBeenCalled();
          expect(contextBodySpy).toHaveBeenCalledWith(exampleAIContextItems);
          expect(api.getCodeSuggestions).toHaveBeenCalledWith(
            expect.objectContaining({ context: exampleAdditionalContexts }),
            expect.objectContaining({ isCancellationRequested: false }),
          );
        });

        it('should be tracked with telemetry', () => {
          expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
            uniqueTrackingId: TRACKING_ID,
            context: expect.objectContaining({ additionalContexts: exampleAdditionalContexts }),
          });
        });
      });
    });

    describe('inlineCompletion', () => {
      const mockGetContext = jest.fn().mockReturnValue(LONG_COMPLETION_CONTEXT);
      let configService: ConfigService;

      const inlineCompletionParams: InlineCompletionParams = {
        ...COMPLETION_PARAMS,
        position: Position.create(1, 1),
        context: {
          triggerKind: InlineCompletionTriggerKind.Automatic,
        },
      };

      const requestInlineCompletionNoDebounce = async (
        params: InlineCompletionParams,
        tkn: CancellationToken,
      ): Promise<InlineCompletionList> => {
        const result = service.inlineCompletionHandler(params, tkn);
        await jest.runOnlyPendingTimersAsync();
        return result;
      };
      let token: CancellationToken;
      let directConnectionClient: DirectConnectionClient;

      beforeEach(async () => {
        token = createFakePartial<CancellationToken>({ isCancellationRequested: false });
        configService = new DefaultConfigService();
        configService.set('token', 'abc');
        directConnectionClient = createFakePartial<DirectConnectionClient>({
          getSuggestions: jest.fn(),
        });
        jest.mocked(DirectConnectionClient).mockReturnValue(directConnectionClient);
        const mockedDocumentTransformer = createFakePartial<DocumentTransformerService>({
          getContext: mockGetContext,
          get: jest.fn(),
        });

        jest
          .mocked(getIntent)
          .mockResolvedValue(createFakePartial<IntentResolution>({ intent: 'generation' }));

        service = createService({
          api,
          configService,
          directConnectionDetailsService,
          documentTransformerService: mockedDocumentTransformer,
        });
      });

      describe('Streaming', () => {
        beforeEach(async () => {
          startStream.mockResolvedValue([]);
          jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(true);
          mockParseFile.mockResolvedValueOnce('generation');
        });

        afterEach(() => {
          jest.mocked(featureFlagService.isClientFlagEnabled).mockReset();
        });

        it('should return empty response when suggestion was cancelled', async () => {
          const cancellationToken = { isCancellationRequested: false };
          const promise = requestInlineCompletionNoDebounce(
            inlineCompletionParams,
            cancellationToken as CancellationToken,
          );
          cancellationToken.isCancellationRequested = true;
          const response = await promise;

          expect(response.items).toEqual([]);
        });

        it('does not request completion suggestions', async () => {
          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          expect(mockGetCodeSuggestions).not.toHaveBeenCalled();
        });

        it('should return empty response with streaming command', async () => {
          const response = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          expect(response.items[0]).toMatchObject({
            insertText: '',
            command: {
              title: 'Start streaming',
              command: START_STREAMING_COMMAND,
              arguments: [expect.stringContaining('code-suggestion-stream-'), TRACKING_ID],
            },
          });
        });

        it('should start the stream', async () => {
          mockGetContext.mockReturnValueOnce(CONTEXT_WITH_WORKSPACE_FOLDER);
          jest.mocked(HelperModule.shouldUseOpenTabs).mockReturnValueOnce(true);
          jest
            .mocked(aiContextManager.searchContextItems)
            .mockResolvedValueOnce(exampleAIContextItems);
          jest
            .mocked(HelperModule.aiContextItemsToRequestBody)
            .mockReturnValueOnce(exampleAdditionalContexts);
          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          jest.runOnlyPendingTimers();

          expect(startStream).toHaveBeenCalledWith({
            streamId: expect.stringContaining('code-suggestion-stream-'),
            documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
            uniqueTrackingId: TRACKING_ID,
            additionalContexts: exampleAdditionalContexts,
            userInstruction: undefined,
            generationType: undefined,
            contextProjectPath: sampleDuoProjectAccessChecker.project.namespaceWithPath,
            suggestionsCache: expect.any(SuggestionsCache),
          });
        });

        it('should have additional context passed if feature is enabled', async () => {
          mockGetContext.mockReturnValueOnce(CONTEXT_WITH_WORKSPACE_FOLDER);

          jest.mocked(HelperModule.shouldUseOpenTabs).mockReturnValueOnce(true);
          jest
            .mocked(aiContextManager.searchContextItems)
            .mockResolvedValueOnce(exampleAIContextItems);
          contextBodySpy.mockReturnValue(exampleAdditionalContexts);
          jest.mocked(mockPreProcessorPipeline.run).mockResolvedValueOnce({
            aiContextItems: exampleAIContextItems,
            documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
          });

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          jest.runOnlyPendingTimers();

          expect(contextBodySpy).toHaveBeenCalledWith(exampleAIContextItems);

          expect(startStream).toHaveBeenCalledWith({
            streamId: expect.stringContaining('code-suggestion-stream-'),
            documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
            uniqueTrackingId: TRACKING_ID,
            additionalContexts: exampleAdditionalContexts,
            userInstruction: undefined,
            generationType: undefined,
            contextProjectPath: sampleDuoProjectAccessChecker.project.namespaceWithPath,
            suggestionsCache: expect.any(SuggestionsCache),
          });
        });

        it('should include generation type and user instruction', async () => {
          const generationType = 'comment';
          const userInstruction = 'somecontent';
          jest.mocked(getIntent).mockResolvedValueOnce({
            intent: 'generation',
            generationType,
            commentForCursor: createFakePartial<Comment>({
              content: userInstruction,
            }),
          });

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          jest.runOnlyPendingTimers();

          expect(startStream).toHaveBeenCalledWith(
            expect.objectContaining({ userInstruction, generationType }),
          );
        });
      });

      describe('when inline completion context does not match selected document text', () => {
        beforeEach(() => {
          jest
            .mocked(completionFilters.shouldRejectCompletionWithSelectedCompletionTextMismatch)
            .mockReset()
            .mockReturnValueOnce(true);
        });

        it('does not request suggestions', async () => {
          const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

          expect(mockGetCodeSuggestions).not.toHaveBeenCalled();
          expect(items).toHaveLength(0);
        });
      });

      it('sends a suggestion when all setup is present', async () => {
        mockGetCodeSuggestions.mockReturnValueOnce({
          choices: [{ text: 'mock suggestion' }],
          model: {
            lang: 'js',
          },
        });

        const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(items.length).toEqual(1);
        const [suggestedItem] = items;
        expect(suggestedItem.insertText).toBe('mock suggestion');
        expect(suggestedItem.command).toEqual({
          title: expect.any(String),
          command: SUGGESTION_ACCEPTED_COMMAND,
          arguments: [TRACKING_ID, 1],
        });
        expect(suggestedItem.range).toEqual(
          Range.create(Position.create(1, 1), Position.create(1, 1)),
        );
      });

      it('requests inline completion including projectPath from workspace settings', async () => {
        configService.set('projectPath', 'gitlab-org/editor-extensions/gitlab.vim');
        await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
        expect(api.getCodeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({ project_path: 'gitlab-org/editor-extensions/gitlab.vim' }),
          expect.objectContaining({ isCancellationRequested: false }),
        );
      });

      it('sets cache on successful request', async () => {
        mockGetCodeSuggestions.mockReturnValueOnce({
          choices: [{ text: 'mock suggestion' }],
          model: {
            lang: 'js',
          },
        });

        const cacheMock = jest.mocked(jest.mocked(SuggestionsCache).mock.instances.at(-1)!);

        const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        const [cacheArgs] = jest.mocked(cacheMock.addToSuggestionCache).mock.calls.at(-1)!;
        expect(cacheArgs.suggestions[0]?.uniqueTrackingId).toBe(TRACKING_ID);
        expect(cacheArgs.suggestions.map((s) => s.text)).toEqual(items.map((i) => i.insertText));
        expect(cacheArgs.request.position).toEqual(inlineCompletionParams.position);
      });

      it('does not send request when data is available in cache', async () => {
        const cacheMock = jest.mocked(jest.mocked(SuggestionsCache).mock.instances.at(-1)!);

        cacheMock.getCachedSuggestions.mockReturnValueOnce({
          options: [{ text: 'cached suggestion', uniqueTrackingId: 'cached id' }],
          suggestionContext: {},
        });

        const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(cacheMock.getCachedSuggestions).toHaveBeenCalledTimes(1);
        expect(mockGetCodeSuggestions).toHaveBeenCalledTimes(0);
        expect(items.length).toEqual(1);
        const [suggestedItem] = items;
        expect(suggestedItem.insertText).toBe('cached suggestion');
        expect(suggestedItem.command).toEqual({
          title: expect.any(String),
          command: SUGGESTION_ACCEPTED_COMMAND,
          arguments: ['cached id', 1],
        });
        expect(suggestedItem.range).toEqual(
          Range.create(Position.create(1, 1), Position.create(1, 1)),
        );
      });

      describe('trigger kind', () => {
        const invokedTriggerParams: InlineCompletionParams = {
          ...inlineCompletionParams,
          context: {
            ...inlineCompletionParams.context,
            triggerKind: InlineCompletionTriggerKind.Invoked,
          },
        };

        describe('when "Invoked"', () => {
          it('uses cache AND API', async () => {
            const cacheMock = jest.mocked(jest.mocked(SuggestionsCache).mock.instances.at(-1)!);

            await requestInlineCompletionNoDebounce(invokedTriggerParams, token);

            expect(cacheMock.getCachedSuggestions).toHaveBeenCalledTimes(1);
            expect(mockGetCodeSuggestions).toHaveBeenCalledTimes(1);
          });

          it('prepends cached options to API options', async () => {
            const cacheMock = jest.mocked(jest.mocked(SuggestionsCache).mock.instances.at(-1)!);

            const cachedSuggestionUniqueId = 'cached id';
            cacheMock.getCachedSuggestions.mockReturnValueOnce({
              options: [{ text: 'cached suggestion', uniqueTrackingId: cachedSuggestionUniqueId }],
              suggestionContext: {},
            });
            mockGetCodeSuggestions.mockReturnValueOnce({
              choices: [{ text: 'api suggestion' }],
              model: {
                lang: 'js',
              },
            });

            const { items } = await requestInlineCompletionNoDebounce(invokedTriggerParams, token);

            expect(items).toEqual([
              expect.objectContaining({ insertText: 'cached suggestion' }),
              expect.objectContaining({ insertText: 'api suggestion' }),
            ]);
          });

          it('asks for multiple options', async () => {
            await requestInlineCompletionNoDebounce(invokedTriggerParams, token);

            expect(mockGetCodeSuggestions).toHaveBeenCalledWith(
              expect.objectContaining({ choices_count: MANUAL_REQUEST_OPTIONS_COUNT }),
              expect.objectContaining({ isCancellationRequested: false }),
            );
          });

          it('tracks "triggerKind=Invoked"', async () => {
            await requestInlineCompletionNoDebounce(invokedTriggerParams, token);

            expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
              uniqueTrackingId: TRACKING_ID,
              context: expect.objectContaining({
                triggerKind: InlineCompletionTriggerKind.Invoked,
              }),
            });
          });
        });

        describe('when "Automatic"', () => {
          it('tracks "triggerKind=Automatic"', async () => {
            await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
            expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
              uniqueTrackingId: TRACKING_ID,
              context: expect.objectContaining({
                triggerKind: InlineCompletionTriggerKind.Automatic,
              }),
            });
          });
        });
      });

      it('tracks a number of returned options for the completion request as "optionsCount"', async () => {
        mockGetCodeSuggestions.mockReturnValueOnce(
          createFakePartial<SuggestionResponse>({
            choices: [{ text: 'mock suggestion' }, { text: 'mock suggestion 2' }],
          }),
        );
        const response = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
          uniqueTrackingId: TRACKING_ID,
          context: expect.objectContaining({ optionsCount: response.items.length }),
        });
      });

      it('tracks whether the suggestion request went directly to AI Gateway', async () => {
        jest.mocked(directConnectionClient.getSuggestions).mockResolvedValue(
          createFakePartial<SuggestionResponse>({
            choices: [{ text: 'mock suggestion' }],
            isDirectConnection: true,
          }),
        );
        await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
          uniqueTrackingId: TRACKING_ID,
          context: expect.objectContaining({ isDirectConnection: true }),
        });
      });

      it('tracks cached entries with full telemetry', async () => {
        const cacheMock = jest.mocked(jest.mocked(SuggestionsCache).mock.instances.at(-1)!);

        cacheMock.getCachedSuggestions.mockReturnValueOnce({
          options: [
            {
              text: 'cached suggestion',
              uniqueTrackingId: 'cached id',
              model: {
                engine: 'engine',
                lang: 'javascript',
                name: 'name',
                tokens_consumption_metadata: {
                  input_tokens: 100,
                  output_tokens: 20,
                },
              },
            },
          ],
          suggestionContext: {
            branchName: 'foo-bar-branch',
          },
        });

        await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
          uniqueTrackingId: 'cached id',
          context: {
            documentContext: expect.any(Object),
            source: 'cache',
            triggerKind: InlineCompletionTriggerKind.Automatic,
            model: {
              lang: 'javascript',
              engine: 'engine',
              name: 'name',
              tokens_consumption_metadata: {
                input_tokens: 100,
                output_tokens: 20,
              },
            },
            suggestionOptions: expect.any(Array),
            branchName: 'foo-bar-branch',
          },
        });
        expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, 'cached id'],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, 'cached id'],
        ]);
      });

      it('does not send a suggestion when context is short', async () => {
        mockGetContext.mockReturnValueOnce(SHORT_COMPLETION_CONTEXT);

        const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(items).toEqual([]);
      });

      it('does not send a suggestion when in middle of line', async () => {
        isAtOrNearEndOfLineListener.mockReturnValueOnce(false);

        const { items } = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

        expect(items).toEqual([]);
      });

      it('tracks suggestion cancelled if the suggestion request has been cancelled before API responded', async () => {
        const testToken = { isCancellationRequested: false };

        mockGetCodeSuggestions.mockImplementation(async () => {
          // simulate that request has been cancelled before API responded
          testToken.isCancellationRequested = true;
          return {
            choices: [{ text: 'mock suggestion' }],
            model: {
              lang: 'js',
            },
          };
        });

        const { items } = await requestInlineCompletionNoDebounce(
          inlineCompletionParams,
          testToken as CancellationToken,
        );

        expect(items).toEqual([]);
        expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent)).toHaveBeenCalledWith(
          CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED,
          TRACKING_ID,
        );
      });

      describe('Suggestions not provided', () => {
        it('should track suggestion not provided when no choices returned', async () => {
          mockGetCodeSuggestions.mockReturnValueOnce(() => ({
            choices: [],
            model: {
              lang: 'js',
            },
          }));

          const result = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent)).toHaveBeenCalledWith(
            CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
            TRACKING_ID,
          );
          expect(result.items).toEqual([]);
        });

        it('should track suggestion not provided when every choice is empty', async () => {
          mockGetCodeSuggestions.mockReturnValueOnce(() => ({
            choices: [{ text: '' }, { text: undefined }],
            model: {
              lang: 'js',
            },
          }));

          const result = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          expect(jest.mocked(codeSuggestionsTelemetryTracker.trackEvent)).toHaveBeenCalledWith(
            CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
            TRACKING_ID,
          );
          expect(result.items).toEqual([]);
        });
      });

      describe('Suggestions error', () => {
        const errorStatusCode = 400;

        const response = createFakeResponse({
          url: 'https://example.com/api/v4/project',
          status: errorStatusCode,
          text: 'Bad Request',
        });

        it('should update code suggestion context with error status', async () => {
          const request = createFakePartial<ApiRequest<unknown>>({});
          mockGetCodeSuggestions.mockRejectedValueOnce(
            new FetchError(request, response, 'completion'),
          );

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

          expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
            uniqueTrackingId: TRACKING_ID,
            context: {
              status: errorStatusCode,
            },
          });
        });

        it('should set credits exceeded when 402 error with USAGE_QUOTA_EXCEEDED is received', async () => {
          const quotaResponse = createFakeResponse({
            url: 'https://example.com/api/v4/code_suggestions/completions',
            status: 402,
            text: JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
          });
          const request = createFakePartial<ApiRequest<unknown>>({});
          mockGetCodeSuggestions.mockRejectedValueOnce(
            new FetchError(
              request,
              quotaResponse,
              'completion',
              JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
            ),
          );

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

          expect(mockCreditsCheck.setCreditsExceeded).toHaveBeenCalledWith(true);
        });

        it('should not set credits exceeded for non-quota errors', async () => {
          const request = createFakePartial<ApiRequest<unknown>>({});
          mockGetCodeSuggestions.mockRejectedValueOnce(
            new FetchError(request, response, 'completion'),
          );

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

          expect(mockCreditsCheck.setCreditsExceeded).not.toHaveBeenCalled();
        });
      });

      describe('Circuit breaking', () => {
        const getCompletions = async () => {
          const result = await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
          return result;
        };
        const turnOnCircuitBreaker = async () => {
          await getCompletions();
          await getCompletions();
          await getCompletions();
          await getCompletions();
        };

        describe('Completion', () => {
          it('starts breaking after 4 errors', async () => {
            mockGetCodeSuggestions.mockReset();
            mockGetCodeSuggestions.mockResolvedValue({
              choices: [{ text: 'mock suggestion' }],
              model: {
                lang: 'js',
              },
            });
            const successResult = await getCompletions();
            expect(successResult.items.length).toEqual(1);
            mockGetCodeSuggestions.mockRejectedValue(new Error('test problem'));
            await turnOnCircuitBreaker();

            mockGetCodeSuggestions.mockReset();
            mockGetCodeSuggestions.mockResolvedValue({
              choices: [{ text: 'mock suggestion' }],
              model: {
                lang: 'js',
              },
            });

            const result = await getCompletions();
            expect(result?.items).toEqual([]);
            expect(mockGetCodeSuggestions).not.toHaveBeenCalled();
          });

          it(`fetches completions again after circuit breaker's break time elapses`, async () => {
            jest.useFakeTimers().setSystemTime(new Date(Date.now()));

            mockGetCodeSuggestions.mockRejectedValue(new Error('test problem'));
            await turnOnCircuitBreaker();

            mockGetCodeSuggestions.mockReset();
            mockGetCodeSuggestions.mockResolvedValue({
              choices: [{ text: 'mock suggestion' }],
              model: {
                lang: 'js',
              },
            });
            jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 1);

            const result = await getCompletions();

            expect(result?.items).toHaveLength(1);
            expect(mockGetCodeSuggestions).toHaveBeenCalled();
          });
        });

        describe('Streaming', () => {
          function goIntoStreamingMode() {
            mockParseFile.mockReset();
            jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValueOnce(true);
            mockParseFile.mockResolvedValue('generation');
          }

          function goIntoCompletionMode() {
            mockParseFile.mockReset();
            jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValueOnce(false);
            mockParseFile.mockResolvedValue('completion');
          }

          it('starts breaking after 4 errors', async () => {
            goIntoStreamingMode();
            const successResult = await getCompletions();
            expect(successResult.items.length).toEqual(1);
            jest.runOnlyPendingTimers();
            goIntoCompletionMode();

            mockGetCodeSuggestions.mockRejectedValue('test problem');
            await turnOnCircuitBreaker();

            goIntoStreamingMode();

            const result = await getCompletions();
            expect(result?.items).toEqual([]);
          });

          it(`starts the stream after circuit breaker's break time elapses`, async () => {
            jest.useFakeTimers().setSystemTime(new Date(Date.now()));

            goIntoCompletionMode();
            mockGetCodeSuggestions.mockRejectedValue(new Error('test problem'));
            await turnOnCircuitBreaker();

            jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 1);
            goIntoStreamingMode();
            const result = await getCompletions();
            expect(result?.items).toHaveLength(1);
            jest.runOnlyPendingTimers();
          });
        });
      });

      describe('selection completion info', () => {
        beforeEach(() => {
          mockGetCodeSuggestions.mockReset();
          mockGetCodeSuggestions.mockResolvedValue({
            choices: [{ text: 'log("Hello world")' }],
            model: {
              lang: 'js',
            },
          });
        });

        describe('when undefined', () => {
          it('does not update choices', async () => {
            const { items } = await requestInlineCompletionNoDebounce(
              {
                ...inlineCompletionParams,
                context: createFakePartial<InlineCompletionContext>({
                  selectedCompletionInfo: undefined,
                }),
              },
              token,
            );

            expect(items[0].insertText).toBe('log("Hello world")');
          });
        });

        describe('with range and text', () => {
          it('prepends text to suggestion choices', async () => {
            const { items } = await requestInlineCompletionNoDebounce(
              {
                ...inlineCompletionParams,
                context: createFakePartial<InlineCompletionContext>({
                  selectedCompletionInfo: {
                    text: 'console.',
                    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } },
                  },
                }),
              },
              token,
            );

            expect(items[0].insertText).toBe('nsole.log("Hello world")');
          });
        });

        describe('with range (Array) and text', () => {
          it('prepends text to suggestion choices', async () => {
            const { items } = await requestInlineCompletionNoDebounce(
              {
                ...inlineCompletionParams,
                context: createFakePartial<InlineCompletionContext>({
                  selectedCompletionInfo: {
                    text: 'console.',
                    // NOTE: This forcefully simulates the behavior we see where range is an Array at runtime.
                    range: [
                      { line: 1, character: 0 },
                      { line: 1, character: 2 },
                    ] as unknown as Range,
                  },
                }),
              },
              token,
            );

            expect(items[0].insertText).toBe('nsole.log("Hello world")');
          });
        });
      });

      describe('Additional Context', () => {
        beforeEach(async () => {
          jest.mocked(HelperModule.shouldUseOpenTabs).mockReturnValueOnce(true);
          jest.mocked(aiContextManager.searchContextItems).mockResolvedValue(exampleAIContextItems);

          contextBodySpy.mockReturnValue(exampleAdditionalContexts);

          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);
        });

        it('getCodeSuggestions should have additional context passed if feature is enabled', async () => {
          expect(aiContextManager.searchContextItems).toHaveBeenCalled();
          expect(api.getCodeSuggestions).toHaveBeenCalledWith(
            expect.objectContaining({ context: exampleAdditionalContexts }),
            expect.objectContaining({ isCancellationRequested: false }),
          );
        });

        it('should be tracked with telemetry', () => {
          expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
            uniqueTrackingId: TRACKING_ID,
            context: expect.objectContaining({ additionalContexts: exampleAdditionalContexts }),
          });
        });
      });

      describe('Vue file handling', () => {
        const scriptContent = 'function test() { return true; }';
        const prefix = '<template>\n  <h1>Hello!</h1>\n</template>\n\n<script>\n';
        const suffix = `${scriptContent}\n</script>`;

        beforeEach(() => {
          jest.mocked(treeSitterParser.parseContent).mockResolvedValueOnce({
            language: createFakePartial<Language>({}),
            languageInfo: {
              editorLanguageIds: ['js'],
              extensions: ['.js'],
              wasmPath: 'path/to/wasm',
              name: 'javascript' as const,
            },
            parser: createFakePartial<Parser>({}),
            tree: createFakePartial<Tree>({}),
          });
          jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValueOnce(true);

          mockGetContext.mockReturnValue({
            ...LONG_COMPLETION_CONTEXT,
            languageId: 'vue',
            prefix,
            suffix,
          });

          jest.spyOn(VueUtils, 'extractScript').mockReturnValue({
            scriptContent,
            scriptStartCharacter: 0,
            scriptStartLine: 0,
            language: 'js',
          });
        });

        it('calls getIntent with correct parameters for Vue files', async () => {
          jest.mocked(mockPreProcessorPipeline.run).mockResolvedValue({
            aiContextItems: [],
            documentContext: {
              ...LONG_COMPLETION_CONTEXT,
              languageId: 'vue',
              prefix,
              suffix,
            },
          });
          await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

          expect(getIntent).toHaveBeenCalledWith({
            treeAndLanguage: expect.anything(),
            position: {
              line: 0,
              character: 7,
            },
            prefix,
            suffix,
          });
        });
      });

      describe('branch name telemetry', () => {
        describe('when a matching repository is found', () => {
          let mockRepository: Repository;

          beforeEach(() => {
            mockGetContext.mockReturnValue({ ...CONTEXT_WITH_WORKSPACE_FOLDER });
            jest.mocked(mockPreProcessorPipeline.run).mockResolvedValue({
              aiContextItems: [],
              documentContext: CONTEXT_WITH_WORKSPACE_FOLDER,
            });

            mockRepository = createFakePartial<Repository>({
              getTrackingBranchName: jest.fn(),
            });

            jest
              .mocked(mockRepositoryService.getMatchingRepository)
              .mockResolvedValue(mockRepository);
          });

          describe('when a branch name is found', () => {
            beforeEach(() => {
              jest
                .mocked(mockRepository.getTrackingBranchName)
                .mockResolvedValue('foo-example-branch');
            });

            it('includes branch name in non-stream telemetry', async () => {
              jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(false);
              mockGetCodeSuggestions.mockReturnValueOnce({
                choices: [{ text: 'mock suggestion' }],
                model: { lang: 'js' },
              });

              await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

              expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith(
                expect.objectContaining({
                  uniqueTrackingId: TRACKING_ID,
                  context: expect.objectContaining({
                    branchName: 'foo-example-branch',
                  }),
                }),
              );
            });
          });

          describe('when no branch name is found', () => {
            beforeEach(() => {
              jest.mocked(mockRepository.getTrackingBranchName).mockResolvedValue(undefined);
            });

            it('does not include branch name in non-streaming telemetry', async () => {
              jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(false);
              mockGetCodeSuggestions.mockReturnValueOnce({
                choices: [{ text: 'mock suggestion' }],
                model: { lang: 'js' },
              });

              await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

              expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
                uniqueTrackingId: TRACKING_ID,
                context: expect.objectContaining({
                  branchName: undefined,
                }),
              });
            });
          });
        });

        describe('when no matching repository is found', () => {
          beforeEach(() => {
            jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(undefined);
          });

          it('does not include branch name in non-streaming telemetry', async () => {
            jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(false);
            mockGetCodeSuggestions.mockReturnValueOnce({
              choices: [{ text: 'mock suggestion' }],
              model: { lang: 'js' },
            });

            await requestInlineCompletionNoDebounce(inlineCompletionParams, token);

            expect(mockRepositoryService.getMatchingRepository).toHaveBeenCalled();

            expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
              uniqueTrackingId: TRACKING_ID,
              context: expect.objectContaining({
                branchName: undefined,
              }),
            });
          });
        });
      });
    });
  });
});
