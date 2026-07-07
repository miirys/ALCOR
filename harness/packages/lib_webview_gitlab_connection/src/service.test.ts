import { createFakePartial } from '@gitlab-org/test-utils';
import type { WebviewConnectionProvider } from '@gitlab-org/webview';
import type {
  GitLabApiService,
  ApiReconfiguredData,
  FeatureStateManager,
  FeatureState,
  InstanceInfo,
  TokenInfo,
} from '@gitlab-org/core';
import type { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import type { ConfigService } from '@gitlab-org/config';
import type { Logger } from '@gitlab-org/logging';
import type { Disposable } from '@gitlab-org/disposable';
import { GitLabConnectionService } from './service';
import type { GitLabConnectionInfo } from './types';

describe('GitLabConnectionService', () => {
  let logger: Logger;
  let apiService: GitLabApiService;
  let workflowRunner: WorkflowRunner;
  let configService: ConfigService;
  let connectionProvider: WebviewConnectionProvider;
  let featureStateManager: FeatureStateManager;

  // Captured callbacks
  let onApiReconfiguredCallback: (data: ApiReconfiguredData) => void;
  let onConfigChangeCallback: () => void;
  let onFeatureStateChangeCallback: (states: FeatureState[]) => void;

  // Mock webview connection
  let onInstanceConnectedHandler: (
    instanceId: string,
    messageBus: {
      onNotification: jest.Mock;
      onRequest: jest.Mock;
      sendNotification: jest.Mock;
    },
  ) => void;
  const mockConnection = {
    onInstanceConnected: jest.fn(),
    broadcast: jest.fn(),
  };

  const mockInstanceInfo = createFakePartial<InstanceInfo>({
    instanceUrl: new URL('https://gitlab.example.com'),
    instanceVersion: '17.8.0',
  });

  const mockTokenInfo = createFakePartial<TokenInfo>({
    scopes: ['api'],
    type: 'pat',
  });

  function createService(): GitLabConnectionService {
    return new GitLabConnectionService(
      logger,
      apiService,
      workflowRunner,
      configService,
      connectionProvider,
      featureStateManager,
    );
  }

  function simulateInstanceConnection() {
    const mockMessageBus = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
      sendNotification: jest.fn(),
    };

    onInstanceConnectedHandler('test-instance', mockMessageBus);

    const notificationHandlers: Record<string, (...args: unknown[]) => void> = {};
    const requestHandlers: Record<string, (...args: unknown[]) => unknown> = {};

    for (const [name, handler] of mockMessageBus.onNotification.mock.calls) {
      notificationHandlers[name as string] = handler as (...args: unknown[]) => void;
    }
    for (const [name, handler] of mockMessageBus.onRequest.mock.calls) {
      requestHandlers[name as string] = handler as (...args: unknown[]) => unknown;
    }

    return { mockMessageBus, notificationHandlers, requestHandlers };
  }

  beforeEach(() => {
    logger = createFakePartial<Logger>({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    apiService = createFakePartial<GitLabApiService>({
      onApiReconfigured: jest.fn((callback) => {
        onApiReconfiguredCallback = callback;
        return createFakePartial<Disposable>({ dispose: jest.fn() });
      }),
      instanceInfo: undefined,
      tokenInfo: undefined,
    });

    workflowRunner = createFakePartial<WorkflowRunner>({
      getProjectPath: jest.fn().mockReturnValue(''),
      getNamespacePath: jest.fn().mockReturnValue(''),
    });

    configService = createFakePartial<ConfigService>({
      onConfigChange: jest.fn((callback) => {
        onConfigChangeCallback = callback as () => void;
        return createFakePartial<Disposable>({ dispose: jest.fn() });
      }),
    });

    mockConnection.onInstanceConnected.mockReset();
    mockConnection.onInstanceConnected.mockImplementation((handler) => {
      onInstanceConnectedHandler = handler;
    });
    mockConnection.broadcast.mockReset();

    connectionProvider = createFakePartial<WebviewConnectionProvider>({
      getConnection: jest.fn().mockReturnValue(mockConnection),
    });

    featureStateManager = createFakePartial<FeatureStateManager>({
      onChange: jest.fn((callback) => {
        onFeatureStateChangeCallback = callback;
        // onChange immediately calls the listener with initial state
        callback([]);
        return createFakePartial<Disposable>({ dispose: jest.fn() });
      }),
    });
  });

  describe('initialization', () => {
    it('starts with connecting status when API has not configured', () => {
      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      const sentState = mockMessageBus.sendNotification.mock.calls[0][1] as GitLabConnectionInfo;
      expect(sentState.status).toBe('connecting');
      expect(sentState.instance).toBeNull();
      expect(sentState.project).toBeNull();
      expect(sentState.reason).toBeNull();
      expect(sentState.featureStates).toEqual([]);

      service.dispose();
    });

    it('starts with connected status when API is already configured', () => {
      apiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn((callback) => {
          onApiReconfiguredCallback = callback;
          return createFakePartial<Disposable>({ dispose: jest.fn() });
        }),
        instanceInfo: mockInstanceInfo,
        tokenInfo: mockTokenInfo,
      });

      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      const sentState = mockMessageBus.sendNotification.mock.calls[0][1] as GitLabConnectionInfo;
      expect(sentState.status).toBe('connected');
      expect(sentState.instance).toEqual({
        instanceUrl: 'https://gitlab.example.com/',
        instanceVersion: '17.8.0',
      });

      service.dispose();
    });

    it('includes project context when project path is available', () => {
      (workflowRunner.getProjectPath as jest.Mock).mockReturnValue('gitlab-org/gitlab');
      (workflowRunner.getNamespacePath as jest.Mock).mockReturnValue('gitlab-org');

      apiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn((callback) => {
          onApiReconfiguredCallback = callback;
          return createFakePartial<Disposable>({ dispose: jest.fn() });
        }),
        instanceInfo: mockInstanceInfo,
        tokenInfo: mockTokenInfo,
      });

      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      const sentState = mockMessageBus.sendNotification.mock.calls[0][1] as GitLabConnectionInfo;
      expect(sentState.project).toEqual({
        projectPath: 'gitlab-org/gitlab',
        namespacePath: 'gitlab-org',
      });

      service.dispose();
    });

    it('project is null when only namespacePath is available', () => {
      (workflowRunner.getProjectPath as jest.Mock).mockReturnValue('');
      (workflowRunner.getNamespacePath as jest.Mock).mockReturnValue('gitlab-org');

      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      const sentState = mockMessageBus.sendNotification.mock.calls[0][1] as GitLabConnectionInfo;
      expect(sentState.project).toBeNull();

      service.dispose();
    });

    it('stays connecting when instanceInfo is set but tokenInfo is undefined', () => {
      apiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn((callback) => {
          onApiReconfiguredCallback = callback;
          return createFakePartial<Disposable>({ dispose: jest.fn() });
        }),
        instanceInfo: mockInstanceInfo,
        tokenInfo: undefined,
      });

      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      const sentState = mockMessageBus.sendNotification.mock.calls[0][1] as GitLabConnectionInfo;
      expect(sentState.status).toBe('connecting');

      service.dispose();
    });
  });

  describe('onApiReconfigured', () => {
    it('transitions to connected when API becomes valid', () => {
      const service = createService();
      simulateInstanceConnection();

      onApiReconfiguredCallback({
        isInValidState: true,
        instanceInfo: mockInstanceInfo,
        tokenInfo: mockTokenInfo,
      });

      expect(mockConnection.broadcast).toHaveBeenCalledWith(
        'connectionStateChanged',
        expect.objectContaining({ status: 'connected' }),
      );

      service.dispose();
    });

    it('transitions to error when API becomes invalid', () => {
      const service = createService();
      simulateInstanceConnection();

      onApiReconfiguredCallback({
        isInValidState: false,
        validationMessage: 'Token is invalid. Reason: expired',
      });

      expect(mockConnection.broadcast).toHaveBeenCalledWith(
        'connectionStateChanged',
        expect.objectContaining({
          status: 'error',
          reason: 'Token is invalid. Reason: expired',
          instance: null,
        }),
      );

      service.dispose();
    });

    it('populates instance info on successful connection', () => {
      const service = createService();
      simulateInstanceConnection();

      onApiReconfiguredCallback({
        isInValidState: true,
        instanceInfo: mockInstanceInfo,
        tokenInfo: mockTokenInfo,
      });

      const broadcastedState = mockConnection.broadcast.mock.calls[0][1] as GitLabConnectionInfo;
      expect(broadcastedState.instance).toEqual({
        instanceUrl: 'https://gitlab.example.com/',
        instanceVersion: '17.8.0',
      });

      service.dispose();
    });
  });

  describe('configService.onConfigChange', () => {
    it('broadcasts when project context changes', () => {
      const service = createService();
      simulateInstanceConnection();

      // Simulate project path becoming available
      (workflowRunner.getProjectPath as jest.Mock).mockReturnValue('new-org/new-project');
      (workflowRunner.getNamespacePath as jest.Mock).mockReturnValue('new-org');

      onConfigChangeCallback();

      expect(mockConnection.broadcast).toHaveBeenCalledWith(
        'connectionStateChanged',
        expect.objectContaining({
          project: {
            projectPath: 'new-org/new-project',
            namespacePath: 'new-org',
          },
        }),
      );

      service.dispose();
    });

    it('does not broadcast when state has not changed', () => {
      const service = createService();
      simulateInstanceConnection();

      onConfigChangeCallback();

      expect(mockConnection.broadcast).not.toHaveBeenCalled();

      service.dispose();
    });
  });

  describe('featureStateManager.onChange', () => {
    it('broadcasts when feature states change', () => {
      const service = createService();
      simulateInstanceConnection();

      const newFeatureStates = createFakePartial<FeatureState[]>([
        {
          featureId: 'flows',
          engagedChecks: [{ checkId: 'authentication-required', engaged: true }],
          allChecks: [{ checkId: 'authentication-required', engaged: true }],
        },
      ]);

      onFeatureStateChangeCallback(newFeatureStates);

      expect(mockConnection.broadcast).toHaveBeenCalledWith(
        'connectionStateChanged',
        expect.objectContaining({
          featureStates: newFeatureStates,
        }),
      );

      service.dispose();
    });
  });

  describe('getConnectionInfo request', () => {
    it('returns current state on request', async () => {
      const service = createService();
      const { requestHandlers } = simulateInstanceConnection();

      const result = await requestHandlers.getConnectionInfo();

      expect(result).toEqual(expect.objectContaining({ status: 'connecting' }));

      service.dispose();
    });
  });

  describe('appReady notification', () => {
    it('sends current state to the specific instance on appReady', () => {
      const service = createService();
      const { notificationHandlers, mockMessageBus } = simulateInstanceConnection();

      notificationHandlers.appReady();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'connectionStateChanged',
        expect.objectContaining({ status: 'connecting' }),
      );

      service.dispose();
    });
  });

  describe('dispose', () => {
    it('disposes all subscriptions', () => {
      const apiDispose = jest.fn();
      const configDispose = jest.fn();
      const featureDispose = jest.fn();

      apiService = createFakePartial<GitLabApiService>({
        onApiReconfigured: jest.fn(() => ({ dispose: apiDispose })),
        instanceInfo: undefined,
        tokenInfo: undefined,
      });
      configService = createFakePartial<ConfigService>({
        onConfigChange: jest.fn(() => ({ dispose: configDispose })),
      });
      featureStateManager = createFakePartial<FeatureStateManager>({
        onChange: jest.fn((callback) => {
          callback([]);
          return { dispose: featureDispose };
        }),
      });

      const service = createService();
      service.dispose();

      expect(apiDispose).toHaveBeenCalled();
      expect(configDispose).toHaveBeenCalled();
      expect(featureDispose).toHaveBeenCalled();
    });
  });
});
