import PQueue from 'p-queue';
import { createParser } from 'eventsource-parser';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { CircuitBreaker, FetchError, ApiRequest, RESTError } from '@gitlab-org/core';
import {
  ConfigService,
  DefaultConfigService,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { GitLabApiClient, GenerationType, GitLabAPI } from '../api';
import { AdditionalContext } from '../api_types';
import { waitMs } from '../utils/wait_ms';
import { IDocContext } from '../document_transformer_service';
import { PostProcessorPipeline } from '../suggestion_client/post_processors/post_processor_pipeline';
import { generateUniqueTrackingId } from '../tracking/code_suggestions/utils';
import { SuggestionApiErrorCheck } from '../feature_state/suggestion_api_error_check';
import { CodeSuggestionsTelemetryTracker } from '../tracking/code_suggestions/code_suggestions_multi_tracker';
import { CodeSuggestionsCreditsCheck } from '../feature_state/code_suggestions_credits_check';
import { DefaultStreamingHandler } from './streaming_handler';
import { SuggestionsCache } from './suggestions_cache';

jest.mock('../utils/wait_ms');
jest.mock('eventsource-parser', () => ({
  createParser: jest.fn(),
}));

const uniqueTrackingId = generateUniqueTrackingId();

describe('startStreaming', () => {
  const streamId = '1';
  let mockAPI: GitLabApiClient;
  let mockCircuitBreaker: CircuitBreaker;
  let mockLogger: Logger;
  const mockContext: IDocContext = {
    prefix: 'beforeCursor',
    suffix: 'afterCursor',
    fileRelativePath: 'test.ts',
    position: {
      line: 0,
      character: 12,
    },
    uri: 'file:///test.ts',
    languageId: 'typescript',
  };
  let mockTelemetryTracker: CodeSuggestionsTelemetryTracker;
  let mockCreditsCheck: CodeSuggestionsCreditsCheck;
  let startStream: () => void;
  const additionalContexts = [createFakePartial<AdditionalContext>({ name: 'file.ts' })];
  let mockUserInstruction: jest.Mock;
  let mockGenerationType: jest.Mock;
  let mockNotifyFn: jest.Mock;
  let streamingHandler: DefaultStreamingHandler;
  let configService: ConfigService;

  const postProcessorPipeline = createFakePartial<PostProcessorPipeline>({
    run: jest.fn().mockImplementation(async (params) => params.input),
  });

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.mocked(waitMs).mockResolvedValue(undefined);
    mockAPI = createFakePartial<GitLabApiClient>({
      getStreamingCodeSuggestions: jest.fn(),
    });
    mockCircuitBreaker = createFakePartial<CircuitBreaker>({
      error: jest.fn(),
      success: jest.fn(),
      isOpen: jest.fn(),
    });

    mockTelemetryTracker = createFakePartial<CodeSuggestionsTelemetryTracker>({
      setTrackingContext: jest.fn(),
      trackEvent: jest.fn(),
    });

    mockCreditsCheck = createFakePartial<CodeSuggestionsCreditsCheck>({
      setCreditsExceeded: jest.fn(),
    });

    mockUserInstruction = jest.fn().mockReturnValue(undefined);
    mockGenerationType = jest.fn().mockReturnValue(undefined);
    configService = new DefaultConfigService();

    mockNotifyFn = jest.fn();

    startStream = () => {
      streamingHandler = new DefaultStreamingHandler(
        mockLogger,
        mockAPI,
        configService,
        postProcessorPipeline,
        mockTelemetryTracker,
        mockCircuitBreaker as SuggestionApiErrorCheck,
        mockCreditsCheck,
      );
      streamingHandler.init(mockNotifyFn);
      return streamingHandler.startStream({
        streamId,
        uniqueTrackingId,
        documentContext: mockContext,
        userInstruction: mockUserInstruction(),
        generationType: mockGenerationType(),
        additionalContexts,
      });
    };
  });

  it('should call the streaming API and send notifications to the client', async () => {
    mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {});

    await startStream();

    expect(mockAPI.getStreamingCodeSuggestions).toBeCalledTimes(1);
    expect(mockNotifyFn).toHaveBeenCalledWith({
      id: streamId,
      done: true,
    });
  });

  it('when multiple messages are send back, sends multiple notifications', async () => {
    mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
      yield {
        chunk: 'one',
        serverSentEvents: false,
      };
      yield {
        chunk: 'two',
        serverSentEvents: false,
      };
    });

    await startStream();

    expect(mockNotifyFn).toHaveBeenNthCalledWith(1, {
      id: streamId,
      completion: 'one',
      done: false,
    });
    expect(mockNotifyFn).toHaveBeenNthCalledWith(2, {
      id: streamId,
      completion: 'onetwo',
      done: false,
    });
    expect(mockNotifyFn).toHaveBeenNthCalledWith(3, {
      id: streamId,
      done: true,
    });
  });

  describe('User instruction', () => {
    it('should include user instruction if provided', async () => {
      const userInstruction = 'Refactor the following code';
      mockUserInstruction.mockReturnValue(userInstruction);

      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        yield {
          chunk: 'one',
          serverSentEvents: false,
        };
        yield {
          chunk: 'two',
          serverSentEvents: false,
        };
      });

      await startStream();

      expect(jest.mocked(mockAPI.getStreamingCodeSuggestions).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          user_instruction: userInstruction,
        }),
      );
    });

    it('should not include user instruction if not provided', async () => {
      mockUserInstruction.mockReturnValue(undefined);

      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {});

      await startStream();

      expect(jest.mocked(mockAPI.getStreamingCodeSuggestions).mock.calls[0][0]).toEqual(
        expect.not.objectContaining({
          user_instruction: expect.any(String),
        }),
      );
    });
  });

  describe('Generation type', () => {
    const setupAndStartStream = async (generationType: GenerationType) => {
      mockGenerationType.mockReturnValue(generationType);
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {});

      return startStream();
    };

    it('should include generation type if provided', async () => {
      const generationType = 'comment';

      await setupAndStartStream(generationType);

      expect(jest.mocked(mockAPI.getStreamingCodeSuggestions).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          generation_type: generationType,
        }),
      );
    });

    it('should not include generation type if not provided', async () => {
      await setupAndStartStream(undefined);

      expect(jest.mocked(mockAPI.getStreamingCodeSuggestions).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          generation_type: undefined,
        }),
      );
    });
  });

  describe('cancellation', () => {
    it('cancels streaming on `CancelStreaming` notification', async () => {
      const promise = startStream();

      // manually call the callback that should be called on receiving notification
      streamingHandler.notificationHandler({ id: streamId });
      await promise;

      expect(mockNotifyFn).toHaveBeenCalledWith({
        id: streamId,
        done: true,
      });
    });
  });

  describe('circuit breaker', () => {
    it('should close the circuit once streaming is starting', async () => {
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {});

      await startStream();

      expect(mockCircuitBreaker.success).toHaveBeenCalled();
    });

    it('should add to errors on api error', async () => {
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        yield Promise.reject(new Error('error'));
      });

      await startStream();

      expect(mockCircuitBreaker.error).toHaveBeenCalled();
    });

    it('should not proceed with API calls when the circuit is open', async () => {
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        yield {
          chunk: 'one',
          serverSentEvents: false,
        };
      });

      jest.mocked(mockCircuitBreaker.isOpen).mockReturnValue(true);

      await startStream();

      expect(mockNotifyFn).not.toHaveBeenCalledWith({
        completion: 1,
        done: false,
        id: streamId,
      });
    });
  });

  describe('Credits exceeded error handling', () => {
    it('should set credits exceeded when 402 error with USAGE_QUOTA_EXCEEDED is received', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/completions',
        status: 402,
        text: JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        yield {
          chunk: 'one',
          serverSentEvents: false,
        };
        yield Promise.reject(
          new RESTError(
            request,
            response,
            'completion',
            JSON.stringify({ error_code: 'USAGE_QUOTA_EXCEEDED' }),
          ),
        );
      });

      await startStream();

      expect(mockCreditsCheck.setCreditsExceeded).toHaveBeenCalledWith(true);
    });

    it('should not set credits exceeded for non-quota errors', async () => {
      const response = createFakeResponse({
        url: 'https://example.com/api/v4/code_suggestions/completions',
        status: 500,
        text: 'Internal Server Error',
      });
      const request = createFakePartial<ApiRequest<unknown>>({});
      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        yield Promise.reject(new FetchError(request, response, 'completion'));
      });

      await startStream();

      expect(mockCreditsCheck.setCreditsExceeded).not.toHaveBeenCalled();
    });
  });

  describe('Telemetry', () => {
    const checkInitialContext = () => {
      expect(mockTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
        uniqueTrackingId,
        context: expect.objectContaining({
          documentContext: expect.any(Object),
          source: 'network',
          isStreaming: true,
          additionalContexts,
        }),
      });
    };

    describe('Shown stream', () => {
      const setupStreamingMock = () => {
        return jest.fn().mockImplementation(async function* () {
          yield {
            chunk: 'one',
            serverSentEvents: false,
          };
          yield {
            chunk: 'two',
            serverSentEvents: false,
          };
        } satisfies GitLabAPI['getStreamingCodeSuggestions']);
      };

      it('should not track "SHOWN" event when client can track it', async () => {
        mockAPI.getStreamingCodeSuggestions = setupStreamingMock();
        configService.set('telemetry.actions', [
          { action: CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN },
        ]);
        await startStream();

        checkInitialContext();

        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED, uniqueTrackingId],
        ]);
      });

      it('should track "SHOWN" event when client cannot track it', async () => {
        mockAPI.getStreamingCodeSuggestions = setupStreamingMock();
        configService.set('telemetry.actions', []);
        await startStream();

        checkInitialContext();

        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED, uniqueTrackingId],
        ]);
      });
    });

    describe('Successfully completed stream', () => {
      it('should track correct events', async () => {
        mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
          yield {
            chunk: 'one',
            serverSentEvents: false,
          };
          yield {
            chunk: 'two',
            serverSentEvents: false,
          };
        } satisfies typeof mockAPI.getStreamingCodeSuggestions);
        await startStream();
        checkInitialContext();

        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED, uniqueTrackingId],
        ]);
      });
    });

    describe('Errored stream', () => {
      it('should track correct events', async () => {
        const errorStatusCode = 400;
        const response = createFakeResponse({
          url: 'https://example.com/api/v4/project',
          status: errorStatusCode,
          text: 'Bad Request',
        });
        mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
          yield {
            chunk: 'one',
            serverSentEvents: false,
          };
          const request = createFakePartial<ApiRequest<unknown>>({});
          yield Promise.reject(new FetchError(request, response, 'completion'));
        });
        await startStream();
        checkInitialContext();

        expect(mockTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
          uniqueTrackingId,
          context: {
            status: errorStatusCode,
          },
        });
        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, uniqueTrackingId],
        ]);
      });
    });

    describe('Cancelled stream', () => {
      it('should track correct events', async () => {
        mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
          yield {
            chunk: 'one',
            serverSentEvents: false,
          };
          yield {
            chunk: 'two',
            serverSentEvents: false,
          };
        });
        const promise = startStream();

        // manually call the callback that should be called on receiving notification
        streamingHandler.notificationHandler({ id: streamId });
        await promise;

        checkInitialContext();
        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED, uniqueTrackingId],
        ]);
      });
    });

    describe('Empty stream (no suggestion provided)', () => {
      it('should track correct events', async () => {
        mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
          yield {
            chunk: '    ',
            serverSentEvents: false,
          };
          yield {
            chunk: '',
            serverSentEvents: false,
          };
        });
        await startStream();

        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED, uniqueTrackingId],
        ]);
      });
    });

    describe('Rejected stream', () => {
      jest.useFakeTimers();

      it('should track correct events', async () => {
        mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
          yield {
            chunk: 'one',
            serverSentEvents: false,
          };
          yield new Promise((resolve) => {
            // manually call the callback that should be called on receiving notification
            streamingHandler.notificationHandler({ id: streamId });
            resolve('two');
          });
        });
        await startStream();

        jest.runOnlyPendingTimers();
        checkInitialContext();

        expect(jest.mocked(mockTelemetryTracker.trackEvent).mock.calls).toEqual([
          [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId],
          [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId],
        ]);
      });
    });
  });

  describe('Stream caching', () => {
    let handler: DefaultStreamingHandler;
    let mockSuggestionsCache: SuggestionsCache;

    beforeEach(() => {
      handler = new DefaultStreamingHandler(
        mockLogger,
        mockAPI,
        configService,
        postProcessorPipeline,
        mockTelemetryTracker,
        mockCircuitBreaker as SuggestionApiErrorCheck,
        mockCreditsCheck,
      );
      handler.init(mockNotifyFn);

      mockSuggestionsCache = createFakePartial<SuggestionsCache>({
        addToSuggestionCache: jest.fn(),
        getCachedSuggestions: jest.fn(),
      });
    });

    it('should cache stream content on stream end', async () => {
      const mockParser = {
        feed: jest.fn(),
      };
      (createParser as jest.Mock).mockReturnValue(mockParser);

      const startStreamPromise = handler.startStream({
        streamId: 'stream-1',
        uniqueTrackingId: 'test-id',
        documentContext: mockContext,
        suggestionsCache: mockSuggestionsCache,
      });

      const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

      onEvent({
        event: 'content_chunk',
        data: JSON.stringify({
          choices: [
            { delta: { content: 'Hello' }, index: 0 },
            { delta: { content: ' World' }, index: 0 },
          ],
        }),
      });

      onEvent({
        event: 'stream_end',
        data: JSON.stringify({}),
      });

      await startStreamPromise;

      expect(mockSuggestionsCache.addToSuggestionCache).toHaveBeenCalledWith({
        request: {
          document: { uri: mockContext.uri },
          position: mockContext.position,
          context: mockContext,
          additionalContexts: undefined,
        },
        suggestions: [
          {
            text: 'Hello World',
            uniqueTrackingId: 'test-id',
            index: 0,
          },
        ],
        suggestionContext: {},
      });
    });

    it('should not cache empty stream content on stream end', async () => {
      const mockParser = {
        feed: jest.fn(),
      };
      (createParser as jest.Mock).mockReturnValue(mockParser);

      const startStreamPromise = handler.startStream({
        streamId: 'stream-1',
        uniqueTrackingId: 'test-id',
        documentContext: mockContext,
        suggestionsCache: mockSuggestionsCache,
      });

      const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

      onEvent({
        event: 'content_chunk',
        data: JSON.stringify({
          choices: [
            { delta: { content: '  ' }, index: 0 },
            { delta: { content: '  ' }, index: 0 },
          ],
        }),
      });

      onEvent({
        event: 'stream_end',
        data: JSON.stringify({}),
      });

      await startStreamPromise;

      expect(mockSuggestionsCache.addToSuggestionCache).not.toHaveBeenCalled();
    });

    it('should cache stream content of non sse events', async () => {
      const sseEvents = [
        {
          chunk: 'Hello',
          serverSentEvents: false,
        },
        {
          chunk: 'World',
          serverSentEvents: false,
        },
      ];

      mockAPI.getStreamingCodeSuggestions = jest.fn().mockImplementation(async function* () {
        for (const event of sseEvents) {
          yield event;
        }
      });

      await handler.startStream({
        streamId: 'stream-1',
        uniqueTrackingId: 'test-id',
        documentContext: mockContext,
        suggestionsCache: mockSuggestionsCache,
      });

      expect(mockSuggestionsCache.addToSuggestionCache).toHaveBeenCalledWith({
        request: {
          document: { uri: mockContext.uri },
          position: mockContext.position,
          context: mockContext,
          additionalContexts: undefined,
        },
        suggestions: [
          {
            text: 'HelloWorld',
            uniqueTrackingId: 'test-id',
            index: 0,
          },
        ],
        suggestionContext: {},
      });
    });
  });
});

describe('SSE Parsing', () => {
  let handler: DefaultStreamingHandler;
  let mockApi: GitLabApiClient;
  let mockPostProcessor: PostProcessorPipeline;
  let mockTracker: CodeSuggestionsTelemetryTracker;
  let mockApiErrorCheck: SuggestionApiErrorCheck;
  let mockCreditsCheck: CodeSuggestionsCreditsCheck;
  let configService: ConfigService;
  let queue: PQueue;
  let mockNotifyFn: jest.Mock;
  let mockLogger: Logger;

  const mockDocContext: IDocContext = createFakePartial<IDocContext>({});

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockApi = createFakePartial<GitLabApiClient>({
      getStreamingCodeSuggestions: jest.fn(),
    });
    mockPostProcessor = createFakePartial<PostProcessorPipeline>({
      run: jest.fn(),
    });
    mockTracker = createFakePartial<CodeSuggestionsTelemetryTracker>({
      trackEvent: jest.fn(),
      setTrackingContext: jest.fn(),
      isEnabled: jest.fn(),
    });
    mockApiErrorCheck = createFakePartial<SuggestionApiErrorCheck>({
      success: jest.fn(),
      error: jest.fn(),
      isOpen: jest.fn().mockReturnValue(false),
    });

    mockCreditsCheck = createFakePartial<CodeSuggestionsCreditsCheck>({
      setCreditsExceeded: jest.fn(),
    });

    configService = new DefaultConfigService();

    mockNotifyFn = jest.fn();
    handler = new DefaultStreamingHandler(
      mockLogger,
      mockApi,
      configService,
      mockPostProcessor,
      mockTracker,
      mockApiErrorCheck,
      mockCreditsCheck,
    );
    handler.init(mockNotifyFn);

    queue = new PQueue({ concurrency: 1 });
  });

  it('handles stream_start event with model metadata', async () => {
    const mockParser = {
      feed: jest.fn(),
    };
    (createParser as jest.Mock).mockReturnValue(mockParser);

    await handler.startStream({
      streamId: 'stream-1',
      uniqueTrackingId: 'test-id',
      documentContext: mockDocContext,
    });

    const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

    onEvent({
      event: 'stream_start',
      data: JSON.stringify({
        metadata: {
          model: {
            engine: 'test-engine',
            name: 'test-model',
          },
          region: 'us-central1',
        },
      }),
    });

    expect(mockTracker.setTrackingContext).toHaveBeenCalledWith({
      uniqueTrackingId: 'test-id',
      context: {
        model: {
          engine: 'test-engine',
          name: 'test-model',
        },
        region: 'us-central1',
      },
    });
  });

  it('handles content_chunk events and accumulates content', async () => {
    const mockParser = {
      feed: jest.fn(),
    };
    (createParser as jest.Mock).mockReturnValue(mockParser);

    await handler.startStream({
      streamId: 'stream-1',
      uniqueTrackingId: 'test-id',
      documentContext: mockDocContext,
    });

    const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

    onEvent({
      event: 'content_chunk',
      data: JSON.stringify({
        choices: [
          { delta: { content: 'Hello' }, index: 0 },
          { delta: { content: ' World' }, index: 0 },
        ],
      }),
    });

    await queue.onIdle();

    expect(mockPostProcessor.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          completion: 'Hello World',
        }),
      }),
    );
  });

  it('handles stream_end event', async () => {
    const mockParser = {
      feed: jest.fn(),
    };
    (createParser as jest.Mock).mockReturnValue(mockParser);

    await handler.startStream({
      streamId: 'stream-1',
      uniqueTrackingId: 'test-id',
      documentContext: mockDocContext,
    });

    const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

    onEvent({
      event: 'stream_end',
      data: JSON.stringify({
        metadata: {
          model: {
            engine: 'test-engine',
            name: 'test-model',
          },
        },
      }),
    });
  });

  it('handles invalid SSE events gracefully', async () => {
    const mockParser = {
      feed: jest.fn(),
    };
    (createParser as jest.Mock).mockReturnValue(mockParser);

    await handler.startStream({
      streamId: 'stream-1',
      uniqueTrackingId: 'test-id',
      documentContext: mockDocContext,
    });

    const { onEvent } = (createParser as jest.Mock).mock.calls[0][0];

    onEvent({
      event: 'invalid_event',
      data: 'invalid json',
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error streaming code suggestions'),
      expect.any(Object),
    );
  });
});
