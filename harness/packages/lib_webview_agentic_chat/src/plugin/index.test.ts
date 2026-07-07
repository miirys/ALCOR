import { NullLogger } from '@gitlab-org/logging';
import {
  DuoWorkflowStatus,
  type ParsedDuoWorkflowEvent,
  type DuoWorkflowEvent,
  DuoWorkflowCheckpoint,
  type CheckpointStatus,
} from '@gitlab-lsp/workflow-api';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ApiReconfiguredData } from '@gitlab-org/core';
import { WEBVIEW_ID, WEBVIEW_TITLE } from '../contract';
import mocks from './controllers_mock_data';
import * as controllers from './controllers';
import { DefaultAgenticChatWebviewPlugin } from './index';

jest.mock('@gitlab-lsp/workflow-api');
jest.mock('vscode-languageserver');

const mockDuoWorkflowCheckpoint: DuoWorkflowCheckpoint = {
  ts: 'someTimestamp',
  channel_values: { status: 'Running' as CheckpointStatus },
};

const createPlugin = () =>
  new DefaultAgenticChatWebviewPlugin(
    mocks.workflowApi,
    mocks.chatContextManager,
    mocks.systemContextManager,
    mocks.duoChatTracker,
    mocks.mockUserService,
    mocks.connection,
    new NullLogger(),
    mocks.secretRedactor,
    mocks.gitlabApiService,
    mocks.duoAgentPlatformTracker,
    mocks.agentPlatformProjectService,
    mocks.usageQuotaService,
    mocks.userPersistentStorage,
    mocks.agentSkillsResolver,
    mocks.mcpManager,
    mocks.featureFlagService,
  );

const workflowEvent: DuoWorkflowEvent = {
  checkpoint: JSON.stringify(mockDuoWorkflowCheckpoint),
  workflowStatus: DuoWorkflowStatus.RUNNING,
  errors: [],
  workflowGoal: '',
};

const parsedCheckpoint: ParsedDuoWorkflowEvent = {
  ...workflowEvent,
  checkpoint: mockDuoWorkflowCheckpoint,
  errors: [],
  workflowGoal: '',
  supportsSessionApprovals: false,
  supportsPatternApprovals: false,
};

jest.mock('./controllers', () => {
  return {
    initWorkflowController: jest.fn().mockReturnValue(mocks.workflowController),
    initWorkflowConnectionController: jest.fn().mockReturnValue(mocks.workflowConnectionController),
    initWorkflowCommonController: jest.fn().mockReturnValue(mocks.workflowCommonController),
    initAIContextController: jest.fn().mockReturnValue(mocks.aiContextController),
    initTelemetryController: jest.fn().mockReturnValue(mocks.telemetryController),
    initUserController: jest.fn().mockReturnValue(mocks.userServiceController),
    initRepositoriesController: jest.fn().mockReturnValue(mocks.repositoriesController),
    initModelSelectionController: jest.fn().mockReturnValue(mocks.modelSelectionController),
    registerControllerRequests: jest.fn(),
    registerControllerNotifications: jest.fn(),
  };
});

jest.mock('@gitlab-lsp/workflow-api', () => ({
  ...jest.requireActual('@gitlab-lsp/workflow-api'),
  parseLangGraphCheckpoint: jest.fn(),
}));

describe('workflowPluginFactory', () => {
  beforeEach(() => {
    const mockWorkflowApi = jest.requireMock('@gitlab-lsp/workflow-api');
    mockWorkflowApi.parseLangGraphCheckpoint.mockReturnValue(mockDuoWorkflowCheckpoint);
  });

  const getInstanceConnectedHandler = () => {
    return jest.mocked(mocks.webview.onInstanceConnected).mock.calls[0][0];
  };

  describe('Plugin initialization', () => {
    it('should create a plugin with correct id and title', () => {
      const plugin = createPlugin();
      expect(plugin.id).toBe(WEBVIEW_ID);
      expect(plugin.title).toBe(WEBVIEW_TITLE);
    });

    it('should set up event handlers correctly', () => {
      const plugin = createPlugin();
      plugin.setup({ webview: mocks.webview, extension: mocks.extension });

      expect(mocks.webview.onInstanceConnected).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Controller setup', () => {
    it('should register controllers', () => {
      const plugin = createPlugin();
      plugin.setup({ webview: mocks.webview, extension: mocks.extension });

      const instanceConnectedHandler = getInstanceConnectedHandler();
      instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

      expect(controllers.registerControllerNotifications).toHaveBeenCalledWith(
        mocks.messageBus,
        expect.arrayContaining([
          mocks.workflowConnectionController.copyCodeSnippet,
          mocks.workflowConnectionController.insertCodeSnippet,
          mocks.workflowConnectionController.copyMessage,
          mocks.workflowConnectionController.copyText,
        ]),
      );
    });
  });

  describe('software_development_flow_registry feature flag', () => {
    let plugin: DefaultAgenticChatWebviewPlugin;

    beforeEach(() => {
      plugin = createPlugin();
      plugin.setup({ webview: mocks.webview, extension: mocks.extension });
      const instanceConnectedHandler = jest.mocked(mocks.webview.onInstanceConnected).mock
        .calls[0][0];
      instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

      // Trigger webviewReady to run the FF setup code
      const { mock } = jest.mocked(mocks.messageBus.onNotification);
      const webviewReadyHandler = mock.calls[mock.calls.length - 1][1];

      webviewReadyHandler('webviewReady');
    });

    it('sends setFeatureFlags with current FF value on webviewReady', () => {
      jest.mocked(mocks.featureFlagService.isInstanceFlagEnabled).mockReturnValue(false);

      expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('setFeatureFlags', {
        softwareDevelopmentFlowRegistry: false,
      });
    });

    it('sends setFeatureFlags with true when FF is enabled', () => {
      jest.mocked(mocks.featureFlagService.isInstanceFlagEnabled).mockReturnValue(true);

      // Simulate a flag change
      const onChangedCallback = jest.mocked(mocks.featureFlagService.onChanged).mock.calls[0][0];
      onChangedCallback(new Map([['software_development_flow_registry', true]]));

      expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('setFeatureFlags', {
        softwareDevelopmentFlowRegistry: true,
      });
    });

    it('registers onChanged listener for FF updates', () => {
      expect(mocks.featureFlagService.onChanged).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Event handling', () => {
    let plugin: DefaultAgenticChatWebviewPlugin;

    beforeEach(() => {
      plugin = createPlugin();
      plugin.setup({ webview: mocks.webview, extension: mocks.extension });
    });

    it('should handle webview instance connection', () => {
      const instanceConnectedHandler = getInstanceConnectedHandler();
      instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

      expect(mocks.messageBus.onNotification).toHaveBeenCalledWith(
        'webviewReady',
        expect.any(Function),
      );
    });

    describe('controller initialization', () => {
      beforeEach(() => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);
      });

      it('should pass correct parameters to workflow controller', () => {
        expect(controllers.initWorkflowController).toHaveBeenCalledWith(
          mocks.workflowApi,
          expect.any(Function),
          expect.any(Object),
          expect.any(Object),
          mocks.chatContextManager,
          mocks.systemContextManager,
          mocks.secretRedactor,
          mocks.gitlabApiService,
          mocks.duoAgentPlatformTracker,
          mocks.mcpManager,
        );
      });
    });

    describe('subscription callback', () => {
      beforeEach(() => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);
      });

      it.each`
        status                        | shouldSendCheckpoint | behavior
        ${DuoWorkflowStatus.RUNNING}  | ${true}              | ${'and sends checkpoint'}
        ${DuoWorkflowStatus.FINISHED} | ${true}              | ${'and sends checkpoint'}
        ${DuoWorkflowStatus.FAILED}   | ${true}              | ${'and sends checkpoint'}
        ${DuoWorkflowStatus.STOPPED}  | ${false}             | ${'but skips checkpoint'}
      `('handles $status status $behavior', async ({ status, shouldSendCheckpoint }) => {
        const { mock } = jest.mocked(controllers.initWorkflowController);
        const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

        jest.mocked(mocks.messageBus.sendNotification).mockClear();

        subscriptionCallback({ ...workflowEvent, workflowStatus: status }, 'test-workflow-id');

        if (shouldSendCheckpoint) {
          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            workflowStatus: status,
          });
        } else {
          expect(mocks.messageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowCheckpoint',
            expect.anything(),
          );
        }

        expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowStatus', status);
      });

      describe('supportsSessionApprovals flag', () => {
        it('should set supportsSessionApprovals=true when Gateway has tool_call_approval capability', () => {
          jest
            .mocked(mocks.workflowApi.getServerCapabilities)
            .mockReturnValue(['tool_call_approval']);

          const { mock } = jest.mocked(controllers.initWorkflowController);
          const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

          jest.mocked(mocks.messageBus.sendNotification).mockClear();

          subscriptionCallback(workflowEvent, 'test-workflow-id');

          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            supportsSessionApprovals: true,
          });
        });

        it('should set supportsSessionApprovals=false when Gateway lacks tool_call_approval capability', () => {
          jest
            .mocked(mocks.workflowApi.getServerCapabilities)
            .mockReturnValue(['shell_command', 'read_file_chunked']);

          const { mock } = jest.mocked(controllers.initWorkflowController);
          const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

          jest.mocked(mocks.messageBus.sendNotification).mockClear();

          subscriptionCallback(workflowEvent, 'test-workflow-id');

          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            supportsSessionApprovals: false,
          });
        });

        it('should set supportsSessionApprovals=false when capabilities are null', () => {
          jest.mocked(mocks.workflowApi.getServerCapabilities).mockReturnValue(null);

          const { mock } = jest.mocked(controllers.initWorkflowController);
          const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

          jest.mocked(mocks.messageBus.sendNotification).mockClear();

          subscriptionCallback(workflowEvent, 'test-workflow-id');

          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            supportsSessionApprovals: false,
          });
        });
      });

      describe('supportsPatternApprovals flag', () => {
        it('should set supportsPatternApprovals=true when Gateway has tool_call_pattern_approval capability', () => {
          jest
            .mocked(mocks.workflowApi.getServerCapabilities)
            .mockReturnValue(['tool_call_approval', 'tool_call_pattern_approval']);

          const { mock } = jest.mocked(controllers.initWorkflowController);
          const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

          jest.mocked(mocks.messageBus.sendNotification).mockClear();

          subscriptionCallback(workflowEvent, 'test-workflow-id');

          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            supportsSessionApprovals: true,
            supportsPatternApprovals: true,
          });
        });

        it('should set supportsPatternApprovals=false when Gateway lacks tool_call_pattern_approval capability', () => {
          jest
            .mocked(mocks.workflowApi.getServerCapabilities)
            .mockReturnValue(['tool_call_approval']);

          const { mock } = jest.mocked(controllers.initWorkflowController);
          const subscriptionCallback = mock.calls[mock.calls.length - 1][1];

          jest.mocked(mocks.messageBus.sendNotification).mockClear();

          subscriptionCallback(workflowEvent, 'test-workflow-id');

          expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('workflowCheckpoint', {
            ...parsedCheckpoint,
            supportsSessionApprovals: true,
            supportsPatternApprovals: false,
          });
        });
      });
    });

    describe('webviewReady', () => {
      it('should set up switchView notification handler when webview is ready', () => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

        const { mock } = jest.mocked(mocks.messageBus.onNotification);
        const webviewReadyHandler = mock.calls[mock.calls.length - 1][1];

        webviewReadyHandler('webviewReady');

        expect(mocks.extension.onNotification).toHaveBeenCalledWith(
          'switchView',
          expect.any(Function),
        );
      });

      it('should forward switchView notifications from extension to webview', () => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

        const { mock } = jest.mocked(mocks.messageBus.onNotification);
        const webviewReadyHandler = mock.calls[mock.calls.length - 1][1];

        webviewReadyHandler('webviewReady');

        const { mock: extensionMock } = jest.mocked(mocks.extension.onNotification);
        const switchViewHandler = extensionMock.calls[extensionMock.calls.length - 1][1];

        const payload = { view: 'conversation' as const };
        switchViewHandler(payload);

        expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith('switchView', payload);
      });
    });

    describe('onApiReconfigured', () => {
      it('should listen to API reconfiguration events', () => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

        expect(mocks.gitlabApiService.onApiReconfigured).toHaveBeenCalledWith(expect.any(Function));
      });

      it('should send setAuthenticationStatus notification when API is reconfigured with valid state', () => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

        const { mock } = jest.mocked(mocks.gitlabApiService.onApiReconfigured);
        const apiReconfiguredHandler = mock.calls[0][0];

        jest.mocked(mocks.messageBus.sendNotification).mockClear();

        expect(mocks.messageBus.sendNotification).not.toHaveBeenCalledWith(
          'setAuthenticationStatus',
          true,
        );

        apiReconfiguredHandler(createFakePartial<ApiReconfiguredData>({ isInValidState: true }));

        expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith(
          'setAuthenticationStatus',
          true,
        );
      });

      it('should send setAuthenticationStatus notification when API is reconfigured with invalid state', () => {
        const instanceConnectedHandler = getInstanceConnectedHandler();
        instanceConnectedHandler(mocks.webviewInstanceId, mocks.messageBus);

        const { mock } = jest.mocked(mocks.gitlabApiService.onApiReconfigured);
        const apiReconfiguredHandler = mock.calls[0][0];

        jest.mocked(mocks.messageBus.sendNotification).mockClear();

        expect(mocks.messageBus.sendNotification).not.toHaveBeenCalledWith(
          'setAuthenticationStatus',
          false,
        );

        apiReconfiguredHandler(
          createFakePartial<ApiReconfiguredData>({
            isInValidState: false,
            validationMessage: 'Token invalid',
          }),
        );

        expect(mocks.messageBus.sendNotification).toHaveBeenCalledWith(
          'setAuthenticationStatus',
          false,
        );
      });
    });
  });
});
