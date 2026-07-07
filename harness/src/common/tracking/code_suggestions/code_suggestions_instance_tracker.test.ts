import { TestLogger, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CIRCUIT_BREAK_INTERVAL_MS } from '@gitlab-org/core';
import {
  ConfigService,
  DefaultConfigService,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { GitLabApiClient, IDocContext } from '../..';
import { SuggestionOptionText } from '../../api_types';
import { ProjectService, Project } from '../../core/services/project_service';
import { DefaultCodeSuggestionsInstanceTracker } from './code_suggestions_instance_tracker';
import {
  INSTANCE_TRACKING_EVENTS_MAP,
  TELEMETRY_DISABLED_WARNING_MSG,
  TELEMETRY_ENABLED_MSG,
} from './constants';
import {
  ICodeSuggestionContextUpdate,
  ICodeSuggestionModel,
} from './code_suggestions_tracking_types';
import { generateUniqueTrackingId } from './utils';
import {
  CodeSuggestionTelemetryState,
  DefaultCodeSuggestionTelemetryState,
} from './code_suggestions_telemetry_state_manager';

jest.useFakeTimers();
jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  getLanguageServerVersion: jest.fn().mockReturnValue('1-0-0'),
}));

const mockTrackEvent = jest.fn();
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
const mockTimeStamp = '2024-07-06T01:41:39.207Z';
jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => mockTimeStamp);
jest.mock('../../log');

describe('InstanceTracker', () => {
  let instanceTracker: DefaultCodeSuggestionsInstanceTracker;
  const apiClient = createFakePartial<GitLabApiClient>({
    fetchFromApi: mockTrackEvent,
  });

  let configService: ConfigService;
  let projectService: ProjectService;

  const uniqueTrackingId = generateUniqueTrackingId();
  const mockProjectId = 123;
  const mockProject: Project = {
    id: mockProjectId,
    uri: 'file:///test-project',
    namespaceWithPath: 'group/test-project',
  };

  let logger: Logger;
  let suggestionStateManager: CodeSuggestionTelemetryState;

  const trackSuggestion = async (additionalContext?: Partial<ICodeSuggestionContextUpdate>) => {
    // currently api call is made for shown, accepted and rejected events
    // so that to test 1 request, the suggestion
    // has to moved to shown state
    instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
      documentContext: mockDocumentContext,
      ...additionalContext,
    });

    // Wait for async project fetch to complete
    await Promise.resolve();

    instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

    if (additionalContext && Object.keys(additionalContext).length > 0) {
      instanceTracker.updateCodeSuggestionsContext(uniqueTrackingId, {
        ...additionalContext,
      });
    }
    instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
  };
  const expectEvent = (event: string) => {
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ event }) }),
    );
  };

  const doNotExpectEvent = (event: string | null) => {
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ event }) }),
    );
  };

  beforeEach(() => {
    configService = new DefaultConfigService();
    logger = new TestLogger();
    jest.spyOn(logger, 'warn');
    jest.spyOn(logger, 'info');

    projectService = createFakePartial<ProjectService>({
      getProjectByFileURI: jest.fn().mockReturnValue(mockProject),
    });

    suggestionStateManager = new DefaultCodeSuggestionTelemetryState();

    instanceTracker = new DefaultCodeSuggestionsInstanceTracker(
      apiClient,
      configService,
      logger,
      projectService,
      suggestionStateManager,
    );
  });

  afterEach(() => {
    jest.runAllTimers();
  });

  describe('Reconfigure', () => {
    it('telemetry should be enabled by default', () => {
      expect(instanceTracker.isEnabled()).toBe(true);
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

    it('should be able to toggle instance telemetry for SaaS instances', async () => {
      configService.set('baseUrl', 'https://gitlab.com');

      configService.set('telemetry.enabled', false);
      expect(instanceTracker.isEnabled()).toBe(false);
      await trackSuggestion();
      expect(mockTrackEvent).not.toHaveBeenCalled();

      configService.set('telemetry.enabled', true);
      expect(instanceTracker.isEnabled()).toBe(true);
      await trackSuggestion();
      expect(mockTrackEvent).toHaveBeenCalled();
    });

    it('instance telemetry should always be enabled for self-managed instances', async () => {
      configService.set('baseUrl', 'https://gitlab.example.com');

      configService.set('telemetry.enabled', false);
      expect(instanceTracker.isEnabled()).toBe(true);
      await trackSuggestion();
      expect(mockTrackEvent).toHaveBeenCalled();

      configService.set('telemetry.enabled', true);
      expect(instanceTracker.isEnabled()).toBe(true);
      await trackSuggestion();
      expect(mockTrackEvent).toHaveBeenCalled();
    });
  });

  describe('Events', () => {
    const setRequestedState = () => {
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });
    };

    const setLoadedState = () => {
      setRequestedState();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
    };

    const setShownState = () => {
      setLoadedState();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
    };

    const setRejectedState = () => {
      setShownState();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId);
    };

    const setAcceptedState = () => {
      setShownState();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, uniqueTrackingId);
    };

    const stateFactories: [CODE_SUGGESTIONS_TRACKING_EVENTS, () => void][] = [
      [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, setShownState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, setRejectedState],
      [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, setAcceptedState],
    ];

    it.each(stateFactories)('should track the %s event', (eventType, stateFactory) => {
      stateFactory();

      instanceTracker.trackEvent(eventType, uniqueTrackingId);
      const event = INSTANCE_TRACKING_EVENTS_MAP[eventType];

      if (event) {
        expectEvent(event);
      }
    });
  });

  describe('Tracking context', () => {
    const clientContext = {
      ide: { name: 'myIDE', version: '1.2', vendor: 'myVendor' },
      extension: { name: 'myExtension', version: '2.3' },
    };

    const clientContextAdditionalProperties = {
      ide_name: clientContext.ide.name,
      ide_vendor: clientContext.ide.vendor,
      ide_version: clientContext.ide.version,
      extension_name: clientContext.extension.name,
      extension_version: clientContext.extension.version,
      language_server_version: '1-0-0',
    };

    beforeEach(async () => {
      configService.set('telemetry', { enabled: true, ...clientContext });
    });

    it('should track event with the code suggestion data', async () => {
      await trackSuggestion({
        branchName: 'some-mock-branch-name',
      });
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            event: INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN],
            project_id: mockProjectId,
            additional_properties: {
              unique_tracking_id: uniqueTrackingId,
              language: undefined,
              timestamp: mockTimeStamp,
              suggestion_size: 0,
              branch_name: 'some-mock-branch-name',
              ...clientContextAdditionalProperties,
            },
          },
        }),
      );
    });

    it('should update the context and track further events with it', async () => {
      const model: ICodeSuggestionModel = {
        engine: 'vertex-ai',
        name: 'code-gecko@latest',
        lang: 'js',
      };
      const suggestionOption1 = createFakePartial<SuggestionOptionText>({
        text: `This suggestion \n has 3 \n lines`,
      });
      const suggestionOption2 = createFakePartial<SuggestionOptionText>({
        text: `This suggestion \n has \n 4 \n lines`,
      });

      await trackSuggestion({
        model,
        suggestionOptions: [suggestionOption1, suggestionOption2],
        branchName: 'some-mock-branch-name',
      });

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            event: INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN],
            project_id: mockProjectId,
            additional_properties: {
              unique_tracking_id: uniqueTrackingId,
              language: model.lang,
              timestamp: mockTimeStamp,
              suggestion_size: 4,
              branch_name: 'some-mock-branch-name',
              model_name: model.name,
              model_engine: model.engine,
              ...clientContextAdditionalProperties,
            },
          },
        }),
      );
    });

    it('should include project_id in the event data', async () => {
      await trackSuggestion();

      expect(projectService.getProjectByFileURI).toHaveBeenCalledWith(mockDocumentContext.uri);
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            project_id: mockProjectId,
          }),
        }),
      );
    });
  });

  describe('State management', () => {
    it('should send the states only of the supported events', () => {
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });

      doNotExpectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED]);

      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      doNotExpectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED]);

      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
      expectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN]);
    });

    it('should update state of an existing suggestion when transition is valid', async () => {
      await trackSuggestion();
      mockTrackEvent.mockClear();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId);

      expectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED]);
    });

    it('should remove suggestions after 60s', () => {
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });
      mockTrackEvent.mockClear();
      jest.advanceTimersByTime(60000);

      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      expect(mockTrackEvent).toBeCalledTimes(0);
    });

    it('should not update state of an existing suggestion when transition is invalid', () => {
      // Sets suggestion state to `suggestion_requested`.
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });
      mockTrackEvent.mockClear();
      // Invalid state transition: `suggestion_requested` to `suggestion_rejected`.
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, uniqueTrackingId);

      expect(mockTrackEvent).toBeCalledTimes(0);
    });

    it('should perform invalid transition when new state is "suggestion_accepted"', () => {
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });
      mockTrackEvent.mockClear();
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, uniqueTrackingId);

      expect(mockTrackEvent).toBeCalledTimes(1);
      expectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED]);
    });

    it('should not update state if suggestion does not exist', () => {
      const nonExistentID = 'unknown';

      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, nonExistentID);

      expect(mockTrackEvent).not.toHaveBeenCalled();
    });

    describe('Rejection', () => {
      beforeEach(async () => {
        await trackSuggestion();
      });

      it('should reject all open suggestions', () => {
        configService.set('telemetry.actions', [
          { action: CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED },
        ]);
        instanceTracker.setCodeSuggestionsContext(generateUniqueTrackingId(), {
          documentContext: mockDocumentContext,
        });
        expectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED]);
      });

      it('should not auto-reject suggestions when client registers that it sends rejections', () => {
        configService.set('telemetry.actions', [
          { action: CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED },
        ]);

        instanceTracker.setCodeSuggestionsContext(generateUniqueTrackingId(), {
          documentContext: mockDocumentContext,
        });

        doNotExpectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED]);
      });

      it('should not auto-reject suggestions when client does not send accepted events', () => {
        configService.set('telemetry.actions', []);

        instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
          documentContext: mockDocumentContext,
        });

        doNotExpectEvent(INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED]);
      });
    });
  });

  describe('Circuit breaking', () => {
    const turnOnCircuitBreaker = async () => {
      await trackSuggestion();
      await trackSuggestion();
      await trackSuggestion();
      await trackSuggestion();
    };

    it('starts breaking after 4 errors', async () => {
      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(new Error('test problem'));
      await turnOnCircuitBreaker();

      jest.mocked(mockTrackEvent).mockClear();

      jest.mocked(apiClient.fetchFromApi).mockReset();
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue(undefined);

      await trackSuggestion();
      expect(mockTrackEvent).not.toHaveBeenCalled();
    });

    it(`starts tracking again after circuit breaker's break time elapses`, async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.now()));

      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(new Error('test problem'));
      await turnOnCircuitBreaker();

      jest.mocked(mockTrackEvent).mockClear();

      jest.mocked(apiClient.fetchFromApi).mockReset();
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue(undefined);
      jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 1);

      await trackSuggestion();
      expect(mockTrackEvent).toHaveBeenCalled();
    });
  });

  describe('Invalid instance error', () => {
    it('should log only once', async () => {
      const invalidInstanceError = new InvalidInstanceVersionError('invalid instance version ');
      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(invalidInstanceError);

      await trackSuggestion();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      await trackSuggestion();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should log other errors multiple times', async () => {
      const genericError = new Error('generic');
      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(genericError);

      await trackSuggestion();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      await trackSuggestion();
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Streaming', () => {
    it('should not track events for streaming suggestion', async () => {
      jest.mocked(mockTrackEvent).mockClear();
      await trackSuggestion({ isStreaming: true });
      expect(mockTrackEvent).not.toHaveBeenCalled();
    });
  });

  describe('Async context updates', () => {
    it('should set REQUESTED state immediately without waiting for project fetch', () => {
      // Mock a slow project fetch
      const slowProjectFetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockProject), 100);
          }),
      );
      jest.mocked(projectService.getProjectByFileURI).mockImplementation(slowProjectFetch);

      // Call setCodeSuggestionsContext (now synchronous)
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });

      // Transition through states: REQUESTED (set by setCodeSuggestionsContext) → LOADED → SHOWN
      // Note: REQUESTED state must be set for these transitions to be valid
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);

      // Verify SHOWN was tracked (only possible if REQUESTED state was set synchronously)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            event: INSTANCE_TRACKING_EVENTS_MAP[CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN],
          }),
        }),
      );

      jest.runAllTimers();
    });

    it('should update context with project_id after async fetch completes', async () => {
      // Mock project fetch that resolves after a delay
      let resolveProjectFetch: (value: Project) => void;
      const projectFetchPromise = new Promise<Project>((resolve) => {
        resolveProjectFetch = resolve;
      });
      jest.mocked(projectService.getProjectByFileURI).mockReturnValue(projectFetchPromise);

      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });

      resolveProjectFetch!(mockProject);
      await projectFetchPromise;

      // Move to LOADED then SHOWN state to trigger API call
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);

      // Verify SHOWN event includes project_id
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            project_id: mockProjectId,
          }),
        }),
      );
    });

    it('should handle project fetch failure gracefully', () => {
      const fetchError = new Error('Project fetch failed');
      jest.mocked(projectService.getProjectByFileURI).mockRejectedValue(fetchError);

      // Should not throw
      instanceTracker.setCodeSuggestionsContext(uniqueTrackingId, {
        documentContext: mockDocumentContext,
      });

      // REQUESTED state should still be set (we can transition to LOADED)
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, uniqueTrackingId);

      // Should track SHOWN without project_id
      instanceTracker.trackEvent(CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN, uniqueTrackingId);
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            project_id: undefined,
          }),
        }),
      );
    });
  });
});
