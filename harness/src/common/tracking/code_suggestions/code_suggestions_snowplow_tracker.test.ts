import { InlineCompletionTriggerKind } from 'vscode-languageserver';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { FeatureFlagService, getByteSize } from '@gitlab-org/core';
import {
  ConfigService,
  DefaultConfigService,
  SuggestionSource,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { SnowplowService, IClientContext } from '@gitlab-org/telemetry';
import {
  IDocContext,
  ConnectionDetailsService,
  IConnectionDetails,
  DirectConnectionDetailsService,
  IDirectConnectionDetails,
  GitLabApiClient,
  SUGGESTIONS_DEBOUNCE_INTERVAL_MS,
} from '../..';
import { shouldUseOpenTabs } from '../../suggestion_client/helpers';
import { AdditionalContext, ResolutionStrategy } from '../../api_types';
import { DefaultSupportedLanguagesService } from '../../suggestion/supported_languages_service';
import { GitlabRealm } from '../../utils/realm_detection';
import { TELEMETRY_DISABLED_WARNING_MSG, TELEMETRY_ENABLED_MSG } from './constants';
import { ICodeSuggestionModel } from './code_suggestions_tracking_types';
import {
  CodeSuggestionsSnowplowTracker,
  DefaultCodeSuggestionsSnowplowTracker,
} from './code_suggestions_snowplow_tracker';
import { generateUniqueTrackingId } from './utils';
import {
  CodeSuggestionTelemetryState,
  DefaultCodeSuggestionTelemetryState,
} from './code_suggestions_telemetry_state_manager';

const mockLanguage = 'typescript';

jest.mock('../../suggestion_client/helpers');
jest.mock('../../suggestion/supported_languages_service');
jest.mocked(DefaultSupportedLanguagesService.getLanguageForFile).mockReturnValue(mockLanguage);

jest.useFakeTimers();
jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  getLanguageServerVersion: jest.fn().mockReturnValue('1-0-0'),
}));

const mockDocumentContext: IDocContext = {
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

describe('CodeSuggestionsSnowplowTracker', () => {
  let snowplowTracker: CodeSuggestionsSnowplowTracker;
  let configService: ConfigService;
  let mockConnectionDetailsService: ConnectionDetailsService;
  let mockDirectConnectionDetailsService: DirectConnectionDetailsService;
  let featureFlagsService: FeatureFlagService;
  let apiClient: GitLabApiClient;
  let mockConnectionDetails: IConnectionDetails | undefined;
  let directMockConnectionDetails: Partial<IDirectConnectionDetails> | undefined;
  let suggestionStateManager: CodeSuggestionTelemetryState;

  const mockInstanceId = '1';
  const mockGlobalUserId = '2';
  const mockHostName = 'https://test.gitlab.com';
  const mockDuoProNamespaceIds = [3, 4, 5];
  const mockFeatureEnablementType = 'duo_enterprise';
  const mockInstanceVersion = '17.3.0';
  const logger = new TestLogger();

  jest.spyOn(logger, 'warn');
  jest.spyOn(logger, 'info');

  const mockTrackStructEvent = jest.fn();
  const mockSchemaValidate = jest.fn();

  const snowplowService = createFakePartial<SnowplowService>({
    trackStructuredEvent: mockTrackStructEvent,
    validateContext: mockSchemaValidate,
  });

  const mockAdditionalContexts = [createFakePartial<AdditionalContext>({ name: 'file.ts' })];
  const uniqueTrackingId = generateUniqueTrackingId();

  beforeEach(() => {
    mockConnectionDetails = {
      instance_id: mockInstanceId,
      instance_version: mockInstanceVersion,
      global_user_id: mockGlobalUserId,
      host_name: mockHostName,
      saas_duo_pro_namespace_ids: mockDuoProNamespaceIds,
      feature_enablement_type: mockFeatureEnablementType,
      realm: GitlabRealm.selfManaged,
    };
    directMockConnectionDetails = {
      headers: {
        'X-Gitlab-Global-User-Id': mockGlobalUserId,
        'X-Gitlab-Instance-Id': mockInstanceId,
        'X-Gitlab-Host-Name': mockHostName,
        'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': mockDuoProNamespaceIds.join(','),
        'X-Gitlab-Feature-Enablement-Type': mockFeatureEnablementType,
      },
    };
    configService = new DefaultConfigService();
    mockConnectionDetailsService = createFakePartial<ConnectionDetailsService>({
      get details() {
        return mockConnectionDetails;
      },
      fetch: jest.fn().mockResolvedValue(mockConnectionDetails),
    });
    mockDirectConnectionDetailsService = createFakePartial<DirectConnectionDetailsService>({
      get details() {
        return directMockConnectionDetails;
      },
      refresh: jest.fn().mockResolvedValue(directMockConnectionDetails),
    });
    featureFlagsService = createFakePartial<FeatureFlagService>({});
    apiClient = createFakePartial<GitLabApiClient>({
      instanceInfo: {
        instanceUrl: new URL('https://example.com'),
        instanceVersion: mockInstanceVersion,
      },
    });

    suggestionStateManager = new DefaultCodeSuggestionTelemetryState();

    snowplowTracker = new DefaultCodeSuggestionsSnowplowTracker(
      configService,
      mockConnectionDetailsService,
      mockDirectConnectionDetailsService,
      featureFlagsService,
      apiClient,
      snowplowService,
      logger,
      suggestionStateManager,
    );
    mockSchemaValidate.mockReturnValue(true);
  });

  afterEach(() => {
    jest.runAllTimers();
  });

  describe('Reconfigure', () => {
    it('telemetry should be enabled by default', () => {
      expect(snowplowTracker.isEnabled()).toBe(true);
    });

    it('should log telemetry status change message only once', () => {
      configService.set('telemetry.enabled', false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG),
        undefined,
      );
      expect(logger.warn).toHaveBeenCalledTimes(1);

      configService.set('telemetry.enabled', false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG),
        undefined,
      );
      expect(logger.warn).toHaveBeenCalledTimes(1);

      configService.set('telemetry.enabled', true);
      configService.set('telemetry.enabled', true);
      configService.set('telemetry.enabled', undefined);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(TELEMETRY_ENABLED_MSG),
        undefined,
      );
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('should be able to toggle telemetry', () => {
      configService.set('telemetry.enabled', false);
      expect(snowplowTracker.isEnabled()).toBe(false);

      snowplowTracker.setTrackingContext?.({
        uniqueTrackingId: '1',
        context: {
          documentContext: mockDocumentContext,
        },
      });
      expect(mockTrackStructEvent).not.toHaveBeenCalled();

      configService.set('telemetry.enabled', true);
      expect(snowplowTracker.isEnabled()).toBe(true);

      snowplowTracker.setTrackingContext?.({
        uniqueTrackingId: '2',
        context: {
          documentContext: mockDocumentContext,
        },
      });
      expect(mockTrackStructEvent).toHaveBeenCalled();
    });

    it('should update `baseUrl` if provided but not the `enabled`', () => {
      expect(snowplowTracker.isEnabled()).toBe(true);
      configService.set('telemetry.baseUrl', false);
      expect(snowplowTracker.isEnabled()).toBe(true);
    });
  });

  describe('Events', () => {
    const setRequestedState = () => {
      snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
    };

    const setLoadedState = () => {
      setRequestedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
    };

    const setShownState = () => {
      setLoadedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
    };

    const setErroredState = () => {
      setRequestedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, uniqueTrackingId);
    };

    const setCancelledState = () => {
      setLoadedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED, uniqueTrackingId);
    };

    const setNotProvidedState = () => {
      setLoadedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED, uniqueTrackingId);
    };

    const setRejectedState = () => {
      setShownState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId);
    };

    const setAcceptedState = () => {
      setLoadedState();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, uniqueTrackingId);
    };

    const stateFactories: [CODE_SUGGESTIONS_TRACKING_EVENTS, () => void][] = [
      [CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED, setRequestedState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, setLoadedState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, setShownState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, setErroredState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED, setCancelledState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED, setNotProvidedState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, setAcceptedState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, setRejectedState],
    ];

    it.each(stateFactories)('should track the %s event', async (eventType, stateFactory) => {
      await stateFactory();

      snowplowTracker.trackEvent(eventType, uniqueTrackingId);

      expect(mockTrackStructEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: eventType }),
        expect.arrayContaining([
          expect.objectContaining({ schema: expect.any(String), data: expect.any(Object) }),
        ]),
      );
    });
  });

  describe('Tracking contexts', () => {
    describe('Client context', () => {
      it('should track event with ide and extension data', async () => {
        const clientContext: IClientContext = {
          ide: { name: 'IDE', version: '1.0', vendor: 'Vendor' },
          extension: { name: 'Updated Extension', version: '2.0' },
        };

        configService.set('telemetry', { enabled: true, ...clientContext });

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });
        expect(mockTrackStructEvent.mock.calls[0]).toEqual([
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          expect.arrayContaining([
            expect.objectContaining({
              schema: 'iglu:com.gitlab/ide_extension_version/jsonschema/1-1-0',
              data: {
                ide_name: 'IDE',
                ide_version: '1.0',
                ide_vendor: 'Vendor',
                extension_name: 'Updated Extension',
                extension_version: '2.0',
                language_server_version: '1-0-0',
              },
            }),
          ]),
        ]);
      });
    });

    describe('Code suggestions context', () => {
      describe('when code_suggestions/connection_details API is available', () => {
        it('fetches details from code_suggestions/connection_details', async () => {
          await snowplowTracker.setTrackingContext?.({
            uniqueTrackingId,
            context: {
              documentContext: mockDocumentContext,
            },
          });

          expect(mockTrackStructEvent.mock.calls[0]).toEqual([
            expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
            [
              expect.any(Object),
              {
                schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
                data: expect.objectContaining({
                  gitlab_realm: GitlabRealm.selfManaged,
                  gitlab_instance_id: mockInstanceId,
                  gitlab_instance_version: '17.3.0',
                  gitlab_global_user_id: mockGlobalUserId,
                  gitlab_host_name: mockHostName,
                  gitlab_saas_duo_pro_namespace_ids: mockDuoProNamespaceIds,
                  gitlab_feature_enablement_type: mockFeatureEnablementType,
                }),
              },
            ],
          ]);
        });
      });

      describe('when code_suggestions/connection_details API is not available and direct access is enabled', () => {
        it('fetches details from code_suggestions/direct_access', async () => {
          jest.mocked(mockConnectionDetailsService.fetch).mockResolvedValue(undefined);

          mockConnectionDetails = undefined;

          await snowplowTracker.setTrackingContext?.({
            uniqueTrackingId,
            context: {
              documentContext: mockDocumentContext,
            },
          });

          expect(mockTrackStructEvent.mock.calls[0]).toEqual([
            expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
            [
              expect.any(Object),
              {
                schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
                data: expect.objectContaining({
                  gitlab_realm: GitlabRealm.saas,
                  gitlab_instance_id: mockInstanceId,
                  gitlab_instance_version: '17.3.0',
                  gitlab_global_user_id: mockGlobalUserId,
                  gitlab_host_name: mockHostName,
                  gitlab_saas_duo_pro_namespace_ids: mockDuoProNamespaceIds,
                  gitlab_feature_enablement_type: mockFeatureEnablementType,
                }),
              },
            ],
          ]);
        });
      });

      describe('when code_suggestions/connection_details API is not available and direct access is disabled', () => {
        it('cannot fetch connection details and context attributes will be null', async () => {
          jest.mocked(mockConnectionDetailsService.fetch).mockResolvedValue(undefined);

          mockConnectionDetails = undefined;
          directMockConnectionDetails = undefined;

          await snowplowTracker.setTrackingContext?.({
            uniqueTrackingId,
            context: {
              documentContext: mockDocumentContext,
            },
          });

          expect(mockTrackStructEvent.mock.calls[0]).toEqual([
            expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
            [
              expect.any(Object),
              {
                schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
                data: expect.objectContaining({
                  gitlab_realm: GitlabRealm.saas,
                  gitlab_instance_id: null,
                  gitlab_instance_version: '17.3.0',
                  gitlab_global_user_id: null,
                  gitlab_host_name: null,
                  gitlab_saas_duo_pro_namespace_ids: [],
                  gitlab_feature_enablement_type: null,
                }),
              },
            ],
          ]);
        });
      });

      it('should track event with document context data', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            {
              schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
              data: {
                suffix_length: 11,
                prefix_length: 12,
                gitlab_realm: 'self-managed',
                language: mockLanguage,
                model_name: null,
                model_engine: null,
                api_status_code: null,
                debounce_interval: SUGGESTIONS_DEBOUNCE_INTERVAL_MS,
                gitlab_feature_enablement_type: mockFeatureEnablementType,
                suggestion_source: 'network',
                gitlab_global_user_id: mockGlobalUserId,
                gitlab_instance_id: mockInstanceId,
                gitlab_host_name: mockHostName,
                gitlab_saas_duo_pro_namespace_ids: mockDuoProNamespaceIds,
                gitlab_instance_version: mockInstanceVersion,
                is_streaming: false,
                is_invoked: null,
                options_count: null,
                has_advanced_context: null,
                is_direct_connection: null,
                content_above_cursor_size_bytes: 12,
                content_below_cursor_size_bytes: 11,
                total_context_size_bytes: 0,
                context_items: null,
                context_items_resolution_strategies_summary: [],
                region: null,
              },
            },
          ],
        );
      });

      describe('model options', () => {
        it.each([
          [{ engine: 'Engine' }, { model_engine: 'Engine' }],
          [{ name: 'Model' }, { model_name: 'Model' }],
          [{ lang: 'javascript' }, { language: 'javascript' }],
          [{}, {}],
          [undefined, {}],
        ])('should track event with model data for %s', async (model, expectedResult) => {
          await snowplowTracker.setTrackingContext?.({
            uniqueTrackingId,
            context: {
              documentContext: mockDocumentContext,
              model,
            },
          });

          expect(mockTrackStructEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
            [
              expect.any(Object),
              {
                schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
                data: expect.objectContaining({
                  model_name: null,
                  model_engine: null,
                  language: mockLanguage,
                  ...expectedResult,
                }),
              },
            ],
          );
        });
      });

      it('should track event with proper suggestion source', async () => {
        const expectedSuggestionSource = SuggestionSource.cache;

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
            source: expectedSuggestionSource,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({ suggestion_source: expectedSuggestionSource }),
            }),
          ],
        );
      });

      it('should add the streaming-specific data when `isStreaming="true"', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
            source: SuggestionSource.network,
            isStreaming: true,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            expect.objectContaining({ data: expect.objectContaining({ is_streaming: true }) }),
          ],
        );
      });

      it('should update the Code Suggestion context and track further events with it', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });
        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({
                language: mockLanguage,
                model_engine: null,
                model_name: null,
              }),
            }),
          ],
        );
        const model: ICodeSuggestionModel = {
          engine: 'vertex-ai',
          name: 'code-gecko@latest',
          lang: 'js',
        };

        const apiStatusCode = 200;

        snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            model,
            status: apiStatusCode,
          },
        });

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);

        expect(mockTrackStructEvent.mock.calls.length).toEqual(3);
        expect(mockTrackStructEvent.mock.calls[2]).toEqual([
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({
                language: model.lang,
                model_engine: model.engine,
                model_name: model.name,
              }),
            }),
          ],
        ]);
      });

      it('should update the Code Suggestion context and track further events with it even if the request failed', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });

        const model = undefined;
        const apiStatusCode = 400;

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            model,
            status: apiStatusCode,
          },
        });

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, uniqueTrackingId);

        expect(mockTrackStructEvent.mock.calls.length).toEqual(2);
        expect(mockTrackStructEvent.mock.calls[1]).toEqual([
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({ api_status_code: apiStatusCode }),
            }),
          ],
        ]);
      });

      it('should track multiple-option suggestion attributes', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
            optionsCount: 3,
            triggerKind: InlineCompletionTriggerKind.Invoked,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({
                options_count: 3,
                is_invoked: true,
              }),
            }),
          ],
        );

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            acceptedOption: 2,
          },
        });

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, uniqueTrackingId);

        expect(mockTrackStructEvent.mock.calls[1]).toEqual([
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED }),
          [
            expect.any(Object),
            {
              schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/3-8-0',
              data: expect.objectContaining({
                is_invoked: true,
                options_count: 3,
                accepted_option: 2,
              }),
            },
          ],
        ]);
      });

      it('should track tokens consumption metadata', async () => {
        const tokensConsumptionMetadata = {
          input_tokens: 100,
          output_tokens: 50,
          context_tokens_sent: 200,
          context_tokens_used: 150,
        };

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            model: {
              lang: 'typescript',
              engine: 'test-engine',
              name: 'test-model',
              tokens_consumption_metadata: tokensConsumptionMetadata,
            },
          },
        });

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({
                input_tokens: tokensConsumptionMetadata.input_tokens,
                output_tokens: tokensConsumptionMetadata.output_tokens,
                context_tokens_sent: tokensConsumptionMetadata.context_tokens_sent,
                context_tokens_used: tokensConsumptionMetadata.context_tokens_used,
              }),
            }),
          ],
        );
      });

      it('should track the direct connection', async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
            isDirectConnection: true,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(expect.any(Object), [
          expect.any(Object),
          expect.objectContaining({
            data: expect.objectContaining({
              is_direct_connection: true,
            }),
          }),
        ]);

        mockTrackStructEvent.mockClear();

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            isDirectConnection: false,
          },
        });
        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

        expect(mockTrackStructEvent).toHaveBeenCalledWith(expect.any(Object), [
          expect.any(Object),
          expect.objectContaining({
            data: expect.objectContaining({
              is_direct_connection: false,
            }),
          }),
        ]);
      });

      describe.each`
        featureFlagsEnabled | additionalContexts        | expected
        ${true}             | ${mockAdditionalContexts} | ${true}
        ${true}             | ${[]}                     | ${false}
        ${false}            | ${[]}                     | ${null}
      `('should track $expected', ({ featureFlagsEnabled, additionalContexts, expected }) => {
        it(`when FFs enabled is "${featureFlagsEnabled}" and advanced context available is "${Boolean(additionalContexts.length)}"`, async () => {
          jest.mocked(shouldUseOpenTabs).mockReturnValueOnce(featureFlagsEnabled);

          await snowplowTracker.setTrackingContext?.({
            uniqueTrackingId,
            context: {
              documentContext: mockDocumentContext,
              additionalContexts,
            },
          });

          expect(mockTrackStructEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
            [
              expect.any(Object),
              expect.objectContaining({
                data: expect.objectContaining({
                  has_advanced_context: expected,
                }),
              }),
            ],
          );
        });
      });

      it('it should get advanced context data if available', async () => {
        jest.mocked(shouldUseOpenTabs).mockReturnValueOnce(true);

        const additionalContexts = [
          {
            name: 'file1.ts',
            type: 'file' as const,
            resolution_strategies: ['open_tabs', 'imports'] as ResolutionStrategy[],
            content: 'content1',
          },
          {
            name: 'file2.js',
            type: 'file' as const,
            resolution_strategies: ['imports'] as ResolutionStrategy[],
            content: 'content2',
          },
        ];

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
            additionalContexts,
          },
        });

        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
          [
            expect.any(Object),
            expect.objectContaining({
              data: expect.objectContaining({
                has_advanced_context: true,
                total_context_size_bytes: expect.any(Number),
                content_above_cursor_size_bytes: expect.any(Number),
                content_below_cursor_size_bytes: expect.any(Number),
                context_items: [
                  {
                    file_extension: 'ts',
                    type: 'file',
                    resolution_strategies: ['open_tabs', 'imports'],
                    byte_size: expect.any(Number),
                  },
                  {
                    file_extension: 'js',
                    type: 'file',
                    resolution_strategies: ['imports'],
                    byte_size: expect.any(Number),
                  },
                ],
                context_items_resolution_strategies_summary: ['open_tabs', 'imports'],
              }),
            }),
          ],
        );

        const expectedTotalContextSize = getByteSize('content1') + getByteSize('content2');
        const expectedContentAboveSize = getByteSize(mockDocumentContext.prefix);
        const expectedContentBelowSize = getByteSize(mockDocumentContext.suffix);

        expect(mockTrackStructEvent.mock.calls[0][1][1].data.total_context_size_bytes).toBe(
          expectedTotalContextSize,
        );
        expect(mockTrackStructEvent.mock.calls[0][1][1].data.content_above_cursor_size_bytes).toBe(
          expectedContentAboveSize,
        );
        expect(mockTrackStructEvent.mock.calls[0][1][1].data.content_below_cursor_size_bytes).toBe(
          expectedContentBelowSize,
        );
        expect(mockTrackStructEvent.mock.calls[0][1][1].data.context_items[0].byte_size).toBe(
          getByteSize('content1'),
        );
        expect(mockTrackStructEvent.mock.calls[0][1][1].data.context_items[1].byte_size).toBe(
          getByteSize('content2'),
        );
      });
    });
  });

  describe('Schema validation', () => {
    it(`should track events when event's context validated against the schema`, async () => {
      mockSchemaValidate.mockReturnValue(true);

      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });

      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
      expect(mockTrackStructEvent).toHaveBeenCalledTimes(2);
    });

    it(`should NOT track events when event's context failed to validate against the schema`, async () => {
      mockSchemaValidate.mockReturnValue(false);

      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
      expect(mockTrackStructEvent).not.toHaveBeenCalled();
    });
  });

  describe('State management', () => {
    it('should send a state of requested when the suggestion is created', async () => {
      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });

      expect(mockTrackStructEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
          category: 'code_suggestions',
        }),
        expect.any(Array),
      );
    });

    it('should update state of an existing suggestion when transition is valid', async () => {
      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
      mockTrackStructEvent.mockClear();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      expect(mockTrackStructEvent).toBeCalledWith(
        expect.objectContaining({
          action: CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED,
          category: 'code_suggestions',
        }),
        expect.any(Array),
      );
    });

    it('should remove suggestions after 60s', async () => {
      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
      mockTrackStructEvent.mockClear();
      jest.advanceTimersByTime(60000);

      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      expect(mockTrackStructEvent).toBeCalledTimes(0);
    });

    it('should not update state of an existing suggestion when transition is invalid', async () => {
      // Sets suggestion state to `suggestion_requested`.
      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
      mockTrackStructEvent.mockClear();
      // Invalid state transition: `suggestion_requested` to `suggestion_rejected`.
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId);

      expect(mockTrackStructEvent).toBeCalledTimes(0);
    });

    it('should perform invalid transition when new state is "suggestion_accepted"', async () => {
      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });
      mockTrackStructEvent.mockClear();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, uniqueTrackingId);

      expect(mockTrackStructEvent).toBeCalledTimes(1);
      expect(mockTrackStructEvent).toBeCalledWith(
        expect.objectContaining({
          action: CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED,
          category: 'code_suggestions',
        }),
        expect.any(Array),
      );
    });

    it('should not update state if suggestion does not exist', () => {
      const nonExistentID = 'unknown';

      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, nonExistentID);

      expect(mockTrackStructEvent).not.toBeCalled();
    });

    describe('Rejection', () => {
      beforeEach(async () => {
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId,
          context: {
            documentContext: mockDocumentContext,
          },
        });

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

        snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
        // We must clear the mock explicitly in this case, since we want to
        // ignore calls to the mock caused by the above statements.
        // eslint-disable-next-line no-restricted-syntax
        mockTrackStructEvent.mockClear();
      });

      it('should reject all open suggestions', async () => {
        configService.set('telemetry.actions', [
          { action: CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED },
        ]);
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId: generateUniqueTrackingId(),
          context: {
            documentContext: mockDocumentContext,
          },
        });

        expect(mockTrackStructEvent.mock.calls.length).toEqual(2);
        expect(mockTrackStructEvent.mock.calls[0]).toEqual([
          expect.objectContaining({
            action: CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED,
            category: 'code_suggestions',
          }),
          expect.any(Array),
        ]);
        expect(mockTrackStructEvent.mock.calls[1]).toEqual([
          expect.objectContaining({
            action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
            category: 'code_suggestions',
          }),
          expect.any(Array),
        ]);
      });

      it('should not auto-reject suggestions when client registers that it sends rejections', async () => {
        configService.set('telemetry.actions', [
          { action: CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED },
        ]);

        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId: generateUniqueTrackingId(),
          context: {
            documentContext: mockDocumentContext,
          },
        });

        expect(mockTrackStructEvent.mock.calls.length).toEqual(1);
        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
            category: 'code_suggestions',
          }),
          expect.any(Array),
        );
      });

      it('should not auto-reject suggestions when client does not send accepted events', async () => {
        configService.set('telemetry.actions', []);
        await snowplowTracker.setTrackingContext?.({
          uniqueTrackingId: generateUniqueTrackingId(),
          context: {
            documentContext: mockDocumentContext,
          },
        });

        expect(mockTrackStructEvent.mock.calls.length).toEqual(1);
        expect(mockTrackStructEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
            category: 'code_suggestions',
          }),
          expect.any(Array),
        );
      });
    });
  });

  describe('Async context updates', () => {
    it('should track REQUESTED immediately with initial connection details', async () => {
      // Mock a slow connection details fetch
      const slowFetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(undefined), 100);
          }),
      );
      jest.mocked(mockConnectionDetailsService.fetch).mockImplementation(slowFetch);

      // Start the context setup (don't await)
      const promise = snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });

      // REQUESTED should be tracked immediately with null connection details
      // (before the async fetch completes)
      expect(mockTrackStructEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
        [
          expect.any(Object),
          expect.objectContaining({
            data: expect.objectContaining({
              gitlab_realm: GitlabRealm.saas,
              gitlab_instance_id: null,
              gitlab_global_user_id: null,
              gitlab_host_name: null,
            }),
          }),
        ],
      );

      await promise;
      jest.runAllTimers();
    });

    it('should update context with connection details after async fetch completes', async () => {
      // Mock connection details fetch that resolves after a delay
      let resolveConnectionFetch: () => void;
      const connectionFetchPromise = new Promise<void>((resolve) => {
        resolveConnectionFetch = resolve;
      });
      jest.mocked(mockConnectionDetailsService.fetch).mockReturnValue(connectionFetchPromise);

      await snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });

      // At this point, REQUESTED has been tracked with null connection details
      // Now resolve the connection fetch to update the context
      resolveConnectionFetch!();
      await connectionFetchPromise;

      // Verify the context was updated by checking the internal map
      // We can do this by tracking any subsequent event and checking it has the updated details
      mockTrackStructEvent.mockClear();
      snowplowTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      expect(mockTrackStructEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED }),
        [
          expect.any(Object),
          expect.objectContaining({
            data: expect.objectContaining({
              gitlab_instance_id: mockInstanceId,
              gitlab_global_user_id: mockGlobalUserId,
              gitlab_host_name: mockHostName,
            }),
          }),
        ],
      );
    });

    it('should handle connection details fetch failure gracefully', () => {
      const fetchError = new Error('Connection details fetch failed');
      jest.mocked(mockConnectionDetailsService.fetch).mockRejectedValue(fetchError);
      mockConnectionDetails = undefined;
      directMockConnectionDetails = undefined;

      // Should not throw
      snowplowTracker.setTrackingContext?.({
        uniqueTrackingId,
        context: {
          documentContext: mockDocumentContext,
        },
      });

      // REQUESTED should still be tracked with null connection details
      expect(mockTrackStructEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED }),
        [
          expect.any(Object),
          expect.objectContaining({
            data: expect.objectContaining({
              gitlab_instance_id: null,
              gitlab_global_user_id: null,
              gitlab_host_name: null,
              gitlab_saas_duo_pro_namespace_ids: null,
              gitlab_feature_enablement_type: null,
            }),
          }),
        ],
      );

      jest.runAllTimers();
    });
  });
});
