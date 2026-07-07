import { CreditLedgerFactory } from '@gitlab-org/credit-ledger';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { ExtensionMessageBusProvider, WebviewConnectionProvider } from '@gitlab-org/webview';
import {
  DuoWorkflowStatus,
  DuoWorkflowEvent,
  WorkflowExecutorError,
  WorkflowRetryEvent,
  WorkflowStatusCode,
  RunWorkflowPayload,
  WorkflowType,
  WorkflowEvent,
  AgentPlatformProjectService,
  AgentPlatformRepository,
  UsageQuotaService,
  ToolApprovalType,
  ToolApprovalApprovedOnce,
  ToolApprovalRejected,
} from '@gitlab-lsp/workflow-api';
import { DuoWorkflowData, DeleteDuoWorkflowsWorkflowData } from '@gitlab-org/graphql';
import { DuoAgentPlatformEvent, DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { GitLabApiService, UserService } from '@gitlab-org/core';
import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import type { AiChatAvailableModelsData } from '@gitlab-org/graphql';
import type {
  AIContextItem,
  ChatContextManager,
  SystemContextManager,
} from '@gitlab-org/ai-context';
import type { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import type { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import { WorkflowManager } from './workflow_manager';
import { DuoAgentPlatformService } from './duo_agent_platform_service';
import { UserFeedbackContext } from './webview/feedback_types';
import type { DuoAgentPlatformMessages } from './webview/contract';

type OnInstanceConnectedHandler = (
  instanceId: string,
  messageBus: {
    onNotification: jest.Mock;
    onRequest: jest.Mock;
    sendNotification: jest.Mock;
    sendRequest: jest.Mock;
  },
) => void;

type FromWebviewNotifications = DuoAgentPlatformMessages['fromWebview']['notifications'];
type FromWebviewRequests = DuoAgentPlatformMessages['fromWebview']['requests'];

type NotificationHandlerMap = {
  [K in keyof FromWebviewNotifications]: FromWebviewNotifications[K] extends undefined
    ? () => void | Promise<void>
    : (payload: FromWebviewNotifications[K]) => void | Promise<void>;
};

type RequestHandlerMap = {
  [K in keyof FromWebviewRequests]: FromWebviewRequests[K]['params'] extends undefined
    ? () => Promise<FromWebviewRequests[K]['result']>
    : (payload: FromWebviewRequests[K]['params']) => Promise<FromWebviewRequests[K]['result']>;
};

// A settled repository snapshot (has a project), so `appReady` emits `initialState`
// immediately instead of deferring while it waits for project discovery.
const REPO_WITH_PROJECT: AgentPlatformRepository = {
  type: 'single',
  rootFsPath: '/repo',
  folderName: 'repo',
  projects: [
    {
      id: null,
      name: 'repo',
      namespaceWithPath: 'group/repo',
      remoteName: 'origin',
      duoAgenticChatAvailable: true,
      duoFeaturesEnabled: true,
      namespaceId: null,
      rootNamespaceId: null,
    },
  ],
};
const REPOS_READY = { repositories: [REPO_WITH_PROJECT] };

describe('DuoAgentPlatformService', () => {
  let mockWorkflowManager: jest.Mocked<
    Pick<
      WorkflowManager,
      | 'getUserWorkflows'
      | 'deleteDuoWorkflow'
      | 'startWorkflow'
      | 'stopWorkflow'
      | 'sendEvent'
      | 'fetchAvailableModels'
      | 'fetchFoundationalAgents'
      | 'fetchCatalogAgents'
      | 'fetchAgentFlowConfig'
      | 'getHealthCheck'
    >
  >;
  let mockMessageBus: {
    onNotification: jest.Mock;
    onRequest: jest.Mock;
    sendNotification: jest.Mock;
    sendRequest: jest.Mock;
  };
  let onInstanceConnectedHandler: OnInstanceConnectedHandler;
  let notificationHandlers: NotificationHandlerMap;
  let requestHandlers: RequestHandlerMap;

  let mockAgentPlatformProjectService: jest.Mocked<
    Pick<
      AgentPlatformProjectService,
      'getRepositories' | 'setSelectedProject' | 'onRepositoriesChange'
    >
  >;
  let mockExtensionMessageBus: { sendNotification: jest.Mock; onNotification: jest.Mock };
  let mockDuoAgentPlatformTracker: DuoAgentPlatformTracker;
  let mockStorage: jest.Mocked<UserPersistentStorage>;
  let mockUserService: jest.Mocked<Pick<UserService, 'getUser'>>;
  let mockUsageQuotaService: jest.Mocked<UsageQuotaService>;
  let mockChatContextManager: {
    addSelectedContextItem: jest.Mock;
    removeSelectedContextItem: jest.Mock;
    getSelectedContextItems: jest.Mock;
    searchContextItems: jest.Mock;
    getAvailableCategories: jest.Mock;
    retrieveContextItemsWithContent: jest.Mock;
    clearSelectedContextItems: jest.Mock;
    getItemWithContent: jest.Mock;
  };
  let mockSystemContextManager: {
    getSystemContextItems: jest.Mock;
  };
  let mockAgentSkillsResolver: {
    getSkillSlashCommands: jest.Mock;
    resolveAgentSkillsContextItem: jest.Mock;
  };
  let mockUrlOpenerService: jest.Mocked<WorkflowUrlOpenerService>;
  let mockGitLabApiService: jest.Mocked<GitLabApiService>;

  const logger = createMockLogger();

  function createService() {
    const mockConnection = {
      onInstanceConnected: jest.fn((handler: OnInstanceConnectedHandler) => {
        onInstanceConnectedHandler = handler;
      }),
      broadcast: jest.fn(),
    };

    const mockConnectionProvider = createFakePartial<WebviewConnectionProvider>({
      getConnection: jest.fn().mockReturnValue(mockConnection),
    });

    mockExtensionMessageBus = {
      sendNotification: jest.fn(),
      onNotification: jest.fn(),
    };
    const mockExtensionMessageBusProvider = createFakePartial<ExtensionMessageBusProvider>({
      getMessageBus: jest.fn().mockReturnValue(mockExtensionMessageBus),
    });

    mockDuoAgentPlatformTracker = createFakePartial<DuoAgentPlatformTracker>({
      trackEvent: jest.fn(),
    });

    mockStorage = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getGlobal: jest.fn(),
      setGlobal: jest.fn(),
      deleteGlobal: jest.fn(),
    };

    mockUserService = {
      getUser: jest.fn().mockResolvedValue({}),
    } as jest.Mocked<Pick<UserService, 'getUser'>>;

    mockUrlOpenerService = {
      openUrl: jest.fn().mockResolvedValue(undefined),
    };

    mockGitLabApiService = createFakePartial<jest.Mocked<GitLabApiService>>({
      onApiReconfigured: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      instanceInfo: {
        instanceUrl: new URL('https://gitlab.example.com'),
        instanceVersion: '17.7.0',
      },
    });

    const mockCreditLedgerFactory = {
      get: jest.fn().mockResolvedValue({
        attribute: jest.fn().mockReturnValue({ unattributed: false }),
      }),
    } as unknown as CreditLedgerFactory;

    return new DuoAgentPlatformService(
      logger,
      mockWorkflowManager as unknown as WorkflowManager,
      mockConnectionProvider,
      mockExtensionMessageBusProvider,
      mockDuoAgentPlatformTracker,
      mockAgentPlatformProjectService as unknown as AgentPlatformProjectService,
      mockStorage,
      mockUserService,
      mockChatContextManager as unknown as ChatContextManager,
      mockSystemContextManager as unknown as SystemContextManager,
      mockUsageQuotaService,
      mockAgentSkillsResolver as unknown as AgentSkillsResolver,
      mockUrlOpenerService,
      mockGitLabApiService,
      mockCreditLedgerFactory,
    );
  }

  function simulateInstanceConnection() {
    onInstanceConnectedHandler('instance-1', mockMessageBus);

    const nHandlers: Record<string, Function> = {};
    const rHandlers: Record<string, Function> = {};
    for (const [name, handler] of mockMessageBus.onNotification.mock.calls) {
      nHandlers[name] = handler;
    }
    for (const [name, handler] of mockMessageBus.onRequest.mock.calls) {
      rHandlers[name] = handler;
    }
    notificationHandlers = nHandlers as unknown as NotificationHandlerMap;
    requestHandlers = rHandlers as unknown as RequestHandlerMap;
  }

  beforeEach(() => {
    mockWorkflowManager = {
      getUserWorkflows: jest.fn(),
      deleteDuoWorkflow: jest.fn(),
      startWorkflow: jest.fn(),
      stopWorkflow: jest.fn(),
      sendEvent: jest.fn(),
      fetchAvailableModels: jest.fn(),
      fetchFoundationalAgents: jest.fn(),
      fetchCatalogAgents: jest.fn(),
      fetchAgentFlowConfig: jest.fn(),
      getHealthCheck: jest.fn(),
    };

    mockAgentPlatformProjectService = {
      getRepositories: jest.fn(),
      setSelectedProject: jest.fn(),
      onRepositoriesChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    };

    mockChatContextManager = {
      addSelectedContextItem: jest.fn().mockResolvedValue(true),
      removeSelectedContextItem: jest.fn().mockResolvedValue(true),
      getSelectedContextItems: jest.fn().mockResolvedValue([]),
      searchContextItems: jest.fn().mockResolvedValue([]),
      getAvailableCategories: jest.fn().mockResolvedValue([]),
      retrieveContextItemsWithContent: jest.fn().mockResolvedValue([]),
      clearSelectedContextItems: jest.fn().mockResolvedValue(true),
      getItemWithContent: jest.fn().mockResolvedValue({}),
    };

    mockSystemContextManager = {
      getSystemContextItems: jest.fn().mockResolvedValue([]),
    };

    mockUsageQuotaService = {
      checkUsageCreditsExceeded: jest.fn().mockResolvedValue(false),
    };

    mockAgentSkillsResolver = {
      getSkillSlashCommands: jest.fn().mockResolvedValue({ commands: [], warnings: [] }),
      resolveAgentSkillsContextItem: jest.fn().mockResolvedValue({
        category: 'user_rule' as const,
        content: 'No agent skills were discovered (no skill locations were configured).',
        id: 'agent-skills-instructions',
        metadata: {
          title: 'Agent Skills',
          enabled: true,
          subType: 'user_rule' as const,
          icon: 'document',
          secondaryText: '',
          subTypeLabel: 'No agent skills found',
        },
      }),
    };

    mockMessageBus = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
    };

    notificationHandlers = {} as NotificationHandlerMap;
    requestHandlers = {} as RequestHandlerMap;

    createService();
    simulateInstanceConnection();
  });

  describe('when an instance connects', () => {
    it('registers notification handlers', () => {
      expect(notificationHandlers.appReady).toBeDefined();
      expect(notificationHandlers.startWorkflow).toBeDefined();
      expect(notificationHandlers.stopWorkflow).toBeDefined();
      expect(notificationHandlers.sendWorkflowEvent).toBeDefined();
      expect(notificationHandlers.selectProjectForWorkflow).toBeDefined();
      expect(notificationHandlers.copyMessage).toBeDefined();
      expect(notificationHandlers.submitFeedback).toBeDefined();
      expect(notificationHandlers.checkUsageQuota).toBeDefined();
      expect(notificationHandlers.openUrl).toBeDefined();
    });

    describe('openUrl', () => {
      it('asks the host to open the url externally', async () => {
        await notificationHandlers.openUrl({ url: 'https://docs.gitlab.com' });

        expect(mockUrlOpenerService.openUrl).toHaveBeenCalledWith('https://docs.gitlab.com');
      });
    });

    it('registers request handlers', () => {
      expect(requestHandlers.getUserWorkflows).toBeDefined();
      expect(requestHandlers.deleteWorkflow).toBeDefined();
      expect(requestHandlers.fetchAvailableModels).toBeDefined();
      expect(requestHandlers.fetchAgents).toBeDefined();
      expect(requestHandlers.getAgentFlowConfig).toBeDefined();
      expect(requestHandlers.getContextCategories).toBeDefined();
      expect(requestHandlers.searchContextItems).toBeDefined();
      expect(requestHandlers.addContextItem).toBeDefined();
      expect(requestHandlers.removeContextItem).toBeDefined();
      expect(requestHandlers.clearSelectedContextItems).toBeDefined();
    });
  });

  describe('context request handlers', () => {
    const fileItem = {
      id: 'a',
      category: 'file',
      metadata: { title: 'a.ts', enabled: true },
    } as unknown as AIContextItem;

    describe('getContextCategories', () => {
      it('returns the categories the manager makes available', async () => {
        mockChatContextManager.getAvailableCategories.mockResolvedValue(['file', 'directory']);

        const result = await requestHandlers.getContextCategories();

        expect(result).toEqual(['file', 'directory']);
      });
    });

    describe('searchContextItems', () => {
      it('returns success with results from the manager', async () => {
        mockChatContextManager.searchContextItems.mockResolvedValue([fileItem]);

        const result = await requestHandlers.searchContextItems({ query: 'a', category: 'file' });

        expect(mockChatContextManager.searchContextItems).toHaveBeenCalledWith({
          query: 'a',
          category: 'file',
        });
        expect(result).toEqual({ success: true, results: [fileItem] });
      });

      it('returns failure when the manager throws', async () => {
        mockChatContextManager.searchContextItems.mockRejectedValue(new Error('search failed'));

        const result = await requestHandlers.searchContextItems({ query: 'a', category: 'file' });

        expect(result).toEqual({ success: false, error: 'search failed' });
      });
    });

    describe('addContextItem', () => {
      it('adds the item and returns the refreshed selection list', async () => {
        mockChatContextManager.getSelectedContextItems.mockResolvedValue([fileItem]);

        const result = await requestHandlers.addContextItem(fileItem);

        expect(mockChatContextManager.addSelectedContextItem).toHaveBeenCalledWith(fileItem);
        expect(result).toEqual({ success: true, items: [fileItem] });
      });

      it('returns failure when the underlying add fails', async () => {
        mockChatContextManager.addSelectedContextItem.mockRejectedValue(new Error('boom'));

        const result = await requestHandlers.addContextItem(fileItem);

        expect(result).toEqual({ success: false, error: 'boom' });
      });
    });

    describe('removeContextItem', () => {
      it('removes the item and returns the refreshed selection list', async () => {
        mockChatContextManager.getSelectedContextItems.mockResolvedValue([]);

        const result = await requestHandlers.removeContextItem(fileItem);

        expect(mockChatContextManager.removeSelectedContextItem).toHaveBeenCalledWith(fileItem);
        expect(result).toEqual({ success: true, items: [] });
      });

      it('returns failure when the underlying remove fails', async () => {
        mockChatContextManager.removeSelectedContextItem.mockRejectedValue(new Error('boom'));

        const result = await requestHandlers.removeContextItem(fileItem);

        expect(result).toEqual({ success: false, error: 'boom' });
      });
    });

    describe('clearSelectedContextItems', () => {
      it('clears selections and returns an empty list', async () => {
        const result = await requestHandlers.clearSelectedContextItems();

        expect(mockChatContextManager.clearSelectedContextItems).toHaveBeenCalled();
        expect(result).toEqual({ success: true, items: [] });
      });

      it('returns failure when clear fails', async () => {
        mockChatContextManager.clearSelectedContextItems.mockRejectedValue(new Error('boom'));

        const result = await requestHandlers.clearSelectedContextItems();

        expect(result).toEqual({ success: false, error: 'boom' });
      });
    });
  });

  describe('when getUserWorkflows request is received', () => {
    it('delegates to workflowManager', async () => {
      const mockData = createFakePartial<DuoWorkflowData>({
        duoWorkflowWorkflows: {
          edges: [],
          pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '', endCursor: '' },
        },
      });
      mockWorkflowManager.getUserWorkflows.mockResolvedValue(mockData);

      const result = await requestHandlers.getUserWorkflows({ projectPath: 'my/project' });

      expect(mockWorkflowManager.getUserWorkflows).toHaveBeenCalledWith({
        projectPath: 'my/project',
      });
      expect(result).toBe(mockData);
    });
  });

  describe('when checkHealth request is received', () => {
    it('delegates to workflowManager with the project path', async () => {
      const healthCheck = { enabled: true, checks: [] };
      mockWorkflowManager.getHealthCheck.mockResolvedValue(healthCheck);

      const result = await requestHandlers.checkHealth({ projectPath: 'my/project' });

      expect(mockWorkflowManager.getHealthCheck).toHaveBeenCalledWith('my/project');
      expect(result).toBe(healthCheck);
    });
  });

  describe('authentication status', () => {
    it('forwards reconfigured authentication state to the webview', () => {
      const listener = mockGitLabApiService.onApiReconfigured.mock.calls[0][0];

      listener({ isInValidState: false, validationMessage: 'no token' });
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'setAuthenticationStatus',
        false,
      );

      listener({
        isInValidState: true,
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.example.com'),
          instanceVersion: '17.7.0',
        },
        tokenInfo: { scopes: ['api'], type: 'pat', token: 't' },
      });
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setAuthenticationStatus', true);
    });

    it('sends the current authentication state on appReady', async () => {
      mockAgentPlatformProjectService.getRepositories.mockResolvedValue(REPOS_READY);

      await notificationHandlers.appReady();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setAuthenticationStatus', true);
    });

    it('reports unauthenticated on appReady when the API is not configured', async () => {
      (mockGitLabApiService as unknown as { instanceInfo: unknown }).instanceInfo = undefined;
      mockAgentPlatformProjectService.getRepositories.mockResolvedValue(REPOS_READY);

      await notificationHandlers.appReady();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'setAuthenticationStatus',
        false,
      );
    });
  });

  describe('when deleteWorkflow request is received', () => {
    it('delegates to workflowManager', async () => {
      const mockResponse = createFakePartial<DeleteDuoWorkflowsWorkflowData>({
        deleteDuoWorkflowsWorkflow: { clientMutationId: null, errors: [], success: true },
      });
      mockWorkflowManager.deleteDuoWorkflow.mockResolvedValue(mockResponse);

      const result = await requestHandlers.deleteWorkflow({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
      });

      expect(mockWorkflowManager.deleteDuoWorkflow).toHaveBeenCalledWith({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
      });
      expect(result).toBe(mockResponse);
    });
  });

  describe('when startWorkflow notification is received', () => {
    const startPayload: RunWorkflowPayload = {
      goal: 'fix the bug',
      type: WorkflowType.CHAT,
      metadata: {
        projectId: 'pid-1',
        projectPath: 'my/project',
        namespaceId: 'ns-1',
        rootNamespaceId: 'rns-1',
        selectedModelIdentifier: 'model-1',
      },
      existingWorkflowId: undefined,
      workflowDefinition: 'def',
      aiCatalogItemVersionId: 'catalog-1',
      additionalContext: [],
    };

    describe('when workflow completes successfully', () => {
      beforeEach(async () => {
        async function* successEvents(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint: 'cp1',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.RUNNING,
          };
          yield {
            checkpoint: 'cp2',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.FINISHED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: successEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        // Allow microtasks to complete
        await new Promise(process.nextTick);
      });

      it('sends workflowStarted notification', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowStarted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        });
      });

      it('streams workflow events to the webview', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowEvent', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          checkpoint: 'cp1',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.RUNNING,
          messages: [],
        });
      });

      it('sends workflowCompleted with completed status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FINISHED,
        });
      });
    });

    describe('when a WorkflowRetryEvent is interleaved in the stream', () => {
      const retryEvent: WorkflowRetryEvent = {
        kind: 'retry',
        attempt: 1,
        maxAttempts: 3,
        backoffMs: 500,
      };

      beforeEach(async () => {
        async function* eventsWithRetry(): AsyncGenerator<
          DuoWorkflowEvent | WorkflowRetryEvent,
          void,
          unknown
        > {
          yield {
            checkpoint: 'cp1',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.RUNNING,
          };
          yield retryEvent;
          yield {
            checkpoint: 'cp2',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.FINISHED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: eventsWithRetry(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('does not forward the retry event as a workflowEvent', () => {
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
          'workflowEvent',
          expect.objectContaining({ kind: 'retry' }),
        );
      });

      it('does not send a workflowError for the retry event', () => {
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
          'workflowError',
          expect.anything(),
        );
      });

      it('still streams the real workflow events', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowEvent', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          checkpoint: 'cp1',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.RUNNING,
          messages: [],
        });
      });

      it('sends workflowCompleted with completed status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FINISHED,
        });
      });
    });

    describe('when workflow event contains valid chat messages', () => {
      const checkpoint = JSON.stringify({
        channel_values: {
          ui_chat_log: [
            {
              message_type: 'agent',
              message_sub_type: null,
              content: 'Hello from agent',
              timestamp: '2026-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
              tool_info: null,
            },
            {
              message_type: 'tool',
              message_sub_type: null,
              content: 'Tool output',
              timestamp: '2026-01-01T00:00:01Z',
              status: null,
              correlation_id: null,
              additional_context: null,
              tool_info: { name: 'read_file', args: { path: '/tmp/test' } },
            },
          ],
        },
      });

      beforeEach(async () => {
        async function* eventsWithChat(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint,
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.FINISHED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: eventsWithChat(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('includes extracted DuoMessage array in workflowEvent', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowEvent', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          checkpoint,
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.FINISHED,
          messages: [
            { content: 'Hello from agent', messageType: 'agent', toolInfo: null },
            {
              content: 'Tool output',
              messageType: 'tool',
              toolInfo: JSON.stringify({ name: 'read_file', args: { path: '/tmp/test' } }),
            },
          ],
        });
      });
    });

    describe('when workflow fails with a FAILED status event', () => {
      beforeEach(async () => {
        async function* failedEvents(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint: 'cp1',
            errors: ['something went wrong'],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.FAILED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: failedEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowCompleted with failed status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FAILED,
        });
      });
    });

    describe('when workflow is stopped', () => {
      beforeEach(async () => {
        async function* stoppedEvents(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint: 'cp1',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.STOPPED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: stoppedEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowCompleted with stopped status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.STOPPED,
        });
      });
    });

    describe('when the stream ends on a non-terminal status', () => {
      beforeEach(async () => {
        async function* pausedEvents(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint: 'cp1',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.INPUT_REQUIRED,
          };
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: pausedEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowCompleted with finished status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FINISHED,
        });
      });
    });

    describe('when workflow emits a WorkflowExecutorError event', () => {
      beforeEach(async () => {
        async function* errorEvents(): AsyncGenerator<
          DuoWorkflowEvent | WorkflowExecutorError,
          void,
          unknown
        > {
          yield new WorkflowExecutorError('executor failed', WorkflowStatusCode.GENERAL_FAILURE);
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: errorEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowError notification', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'executor failed',
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        });
      });

      it('sends workflowCompleted with failed status and error message', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FAILED,
          error: 'executor failed',
        });
      });
    });

    describe('when startWorkflow throws an error', () => {
      beforeEach(async () => {
        mockWorkflowManager.startWorkflow.mockRejectedValue(new Error('connection lost'));

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowError notification', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'connection lost',
          workflowId: undefined,
        });
      });
    });

    describe('when workflow emits a USAGE_QUOTA_EXCEEDED executor error', () => {
      beforeEach(async () => {
        async function* errorEvents(): AsyncGenerator<
          DuoWorkflowEvent | WorkflowExecutorError,
          void,
          unknown
        > {
          yield new WorkflowExecutorError(
            'out of credits',
            WorkflowStatusCode.USAGE_QUOTA_EXCEEDED,
          );
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: errorEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends setUsageQuotaExceeded notification with isMidStream', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setUsageQuotaExceeded', {
          exceeded: true,
          isMidStream: true,
        });
      });

      it('does not send a workflowError notification', () => {
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
          'workflowError',
          expect.anything(),
        );
      });

      it('still completes the workflow with failed status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FAILED,
          error: 'out of credits',
        });
      });
    });

    describe('when startWorkflow throws an insufficient credits error', () => {
      beforeEach(async () => {
        mockWorkflowManager.startWorkflow.mockRejectedValue(
          new Error('insufficient GitLab credits to start workflow'),
        );

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends setUsageQuotaExceeded notification with isMidStream', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setUsageQuotaExceeded', {
          exceeded: true,
          isMidStream: true,
        });
      });

      it('does not send a workflowError notification', () => {
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
          'workflowError',
          expect.anything(),
        );
      });
    });

    describe('when the error is thrown after workflowId is assigned', () => {
      beforeEach(async () => {
        async function* throwingEvents(): AsyncGenerator<DuoWorkflowEvent> {
          yield {
            checkpoint: 'cp1',
            errors: [],
            workflowGoal: 'fix the bug',
            workflowStatus: DuoWorkflowStatus.RUNNING,
          };
          throw new Error('stream interrupted');
        }

        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: throwingEvents(),
        });

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);
      });

      it('sends workflowCompleted with failed status', () => {
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowCompleted', {
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          status: DuoWorkflowStatus.FAILED,
          error: 'stream interrupted',
        });
      });
    });

    it('forwards toolApproval to workflowManager.startWorkflow when provided', async () => {
      async function* finishedEvent(): AsyncGenerator<DuoWorkflowEvent> {
        yield {
          checkpoint: 'cp',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        };
      }

      mockWorkflowManager.startWorkflow.mockResolvedValue({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        events: finishedEvent(),
      });

      const toolApproval: ToolApprovalApprovedOnce = {
        userApproved: true,
        toolName: 'run_command',
        type: ToolApprovalType.APPROVE_ONCE,
      };

      await notificationHandlers.startWorkflow({ ...startPayload, toolApproval });
      await new Promise(process.nextTick);

      expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ toolApproval }),
      );
    });

    it('forwards a rejection toolApproval to workflowManager.startWorkflow', async () => {
      async function* finishedEvent(): AsyncGenerator<DuoWorkflowEvent> {
        yield {
          checkpoint: 'cp',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        };
      }

      mockWorkflowManager.startWorkflow.mockResolvedValue({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        events: finishedEvent(),
      });

      const toolApproval: ToolApprovalRejected = { userApproved: false, message: 'Too risky' };

      await notificationHandlers.startWorkflow({ ...startPayload, toolApproval });
      await new Promise(process.nextTick);

      expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ toolApproval }),
      );
    });

    it('converts null metadata fields to undefined in the payload', async () => {
      async function* emptyEvents(): AsyncGenerator<DuoWorkflowEvent> {
        yield {
          checkpoint: 'done',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        };
      }

      mockWorkflowManager.startWorkflow.mockResolvedValue({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        events: emptyEvents(),
      });

      await notificationHandlers.startWorkflow(startPayload);
      await new Promise(process.nextTick);

      expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            projectId: 'pid-1',
            projectPath: 'my/project',
          }),
        }),
      );
    });

    it('converts null existingWorkflowId to undefined', async () => {
      async function* emptyEvents(): AsyncGenerator<DuoWorkflowEvent> {
        yield {
          checkpoint: 'done',
          errors: [],
          workflowGoal: 'fix the bug',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        };
      }

      mockWorkflowManager.startWorkflow.mockResolvedValue({
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        events: emptyEvents(),
      });

      const payloadWithNulls = {
        ...startPayload,
        existingWorkflowId: null,
        preCreatedWorkflowId: null,
      };

      await notificationHandlers.startWorkflow(payloadWithNulls);
      await new Promise(process.nextTick);

      expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          existingWorkflowId: undefined,
          preCreatedWorkflowId: undefined,
        }),
      );
    });

    describe('additional context assembly', () => {
      const userItem = {
        id: 'user-1',
        category: 'file',
        metadata: { title: 'user.ts', enabled: true },
      } as unknown as AIContextItem;
      const systemItem = {
        id: 'system-1',
        category: 'os_information',
        metadata: { title: 'os', enabled: true },
      } as unknown as AIContextItem;

      async function* finishedEvent(): AsyncGenerator<DuoWorkflowEvent> {
        yield {
          checkpoint: 'cp',
          errors: [],
          workflowGoal: 'goal',
          workflowStatus: DuoWorkflowStatus.FINISHED,
        };
      }

      beforeEach(() => {
        mockWorkflowManager.startWorkflow.mockResolvedValue({
          workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          events: finishedEvent(),
        });
      });

      it('retrieves user context from chatContextManager and forwards it', async () => {
        mockChatContextManager.retrieveContextItemsWithContent.mockResolvedValue([userItem]);

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);

        expect(mockChatContextManager.retrieveContextItemsWithContent).toHaveBeenCalledWith({
          newConversation: true,
          mode: 'agentic',
        });
        expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext: [userItem] }),
        );
      });

      it('merges system context ahead of user context for new conversations', async () => {
        mockSystemContextManager.getSystemContextItems.mockResolvedValue([systemItem]);
        mockChatContextManager.retrieveContextItemsWithContent.mockResolvedValue([userItem]);

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);

        expect(mockSystemContextManager.getSystemContextItems).toHaveBeenCalled();
        expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext: [systemItem, userItem] }),
        );
      });

      it('skips system context when continuing an existing workflow', async () => {
        mockSystemContextManager.getSystemContextItems.mockResolvedValue([systemItem]);
        mockChatContextManager.retrieveContextItemsWithContent.mockResolvedValue([userItem]);

        await notificationHandlers.startWorkflow({
          ...startPayload,
          existingWorkflowId: 'wf-existing',
        });
        await new Promise(process.nextTick);

        expect(mockSystemContextManager.getSystemContextItems).not.toHaveBeenCalled();
        expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext: [userItem] }),
        );
      });

      it('proceeds with user context only when system context retrieval fails', async () => {
        mockSystemContextManager.getSystemContextItems.mockRejectedValue(new Error('boom'));
        mockChatContextManager.retrieveContextItemsWithContent.mockResolvedValue([userItem]);

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);

        expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext: [userItem] }),
        );
      });

      it('proceeds with system context only when user context retrieval fails', async () => {
        mockSystemContextManager.getSystemContextItems.mockResolvedValue([systemItem]);
        mockChatContextManager.retrieveContextItemsWithContent.mockRejectedValue(new Error('boom'));

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);

        expect(mockWorkflowManager.startWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext: [systemItem] }),
        );
      });

      it('clears the user selection list and broadcasts the empty list once the workflow has started', async () => {
        mockChatContextManager.retrieveContextItemsWithContent.mockResolvedValue([userItem]);

        await notificationHandlers.startWorkflow(startPayload);
        await new Promise(process.nextTick);

        expect(mockChatContextManager.clearSelectedContextItems).toHaveBeenCalled();
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'setContextCurrentItemsResult',
          [],
        );
      });
    });
  });

  describe('when stopWorkflow notification is received', () => {
    it('stops the workflow via the workflow manager', async () => {
      await notificationHandlers.stopWorkflow({ workflowId: 'wf-1', source: 'chat' });

      expect(mockWorkflowManager.stopWorkflow).toHaveBeenCalledWith('wf-1');
    });

    it('tracks a WorkflowStopped telemetry event with the provided source', async () => {
      await notificationHandlers.stopWorkflow({ workflowId: 'wf-1', source: 'flows' });

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.WorkflowStopped,
        { source: 'flows', workflowId: 'wf-1', reason: 'stop_button_click' },
      );
    });
  });

  describe('when sendWorkflowEvent notification is received', () => {
    it('forwards the event to the workflow manager', async () => {
      mockWorkflowManager.sendEvent.mockResolvedValue(undefined);

      await notificationHandlers.sendWorkflowEvent({
        workflowId: 'wf-1',
        eventType: WorkflowEvent.RESUME,
      });

      expect(mockWorkflowManager.sendEvent).toHaveBeenCalledWith(
        'wf-1',
        WorkflowEvent.RESUME,
        undefined,
      );
    });

    it('swallows errors from the workflow manager', async () => {
      mockWorkflowManager.sendEvent.mockRejectedValue(new Error('boom'));

      await expect(
        notificationHandlers.sendWorkflowEvent({
          workflowId: 'wf-1',
          eventType: WorkflowEvent.RESUME,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('when appReady notification is received', () => {
    it('fetches repositories and sends initialState', async () => {
      mockAgentPlatformProjectService.getRepositories.mockResolvedValue(REPOS_READY);

      await notificationHandlers.appReady();
      await new Promise(process.nextTick);

      expect(mockAgentPlatformProjectService.getRepositories).toHaveBeenCalled();
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('initialState', {
        repositories: [REPO_WITH_PROJECT],
      });
    });

    describe('repository readiness', () => {
      const initialStateCalls = () =>
        mockMessageBus.sendNotification.mock.calls.filter(([event]) => event === 'initialState');

      const fireRepositoriesChange = (repositories: AgentPlatformRepository[]) => {
        const listener = mockAgentPlatformProjectService.onRepositoriesChange.mock.calls[0][0];
        listener({ repositories }, new AbortController().signal);
      };

      it('defers initialState while the snapshot has no projects yet', async () => {
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: [] });

        await notificationHandlers.appReady();
        await new Promise(process.nextTick);

        expect(initialStateCalls()).toHaveLength(0);

        // Host finishes discovery and surfaces a project.
        fireRepositoriesChange([REPO_WITH_PROJECT]);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('initialState', {
          repositories: [REPO_WITH_PROJECT],
        });
      });

      it('treats a project-less repository snapshot as not ready', async () => {
        const repoWithoutProjects: AgentPlatformRepository = {
          type: 'single',
          rootFsPath: '/repo',
          folderName: 'repo',
          projects: [],
        };
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({
          repositories: [repoWithoutProjects],
        });

        await notificationHandlers.appReady();
        await new Promise(process.nextTick);

        expect(initialStateCalls()).toHaveLength(0);

        fireRepositoriesChange([REPO_WITH_PROJECT]);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('initialState', {
          repositories: [REPO_WITH_PROJECT],
        });
      });

      it('falls back to an empty initialState after the timeout for empty workspaces', async () => {
        jest.useFakeTimers();
        try {
          mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: [] });

          await notificationHandlers.appReady();
          await Promise.resolve();
          expect(initialStateCalls()).toHaveLength(0);

          jest.advanceTimersByTime(5000);

          expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('initialState', {
            repositories: [],
          });
        } finally {
          jest.useRealTimers();
        }
      });

      it('sends later changes as setRepositories once initialState is out', async () => {
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue(REPOS_READY);

        await notificationHandlers.appReady();
        await new Promise(process.nextTick);

        const updated = [REPO_WITH_PROJECT, { ...REPO_WITH_PROJECT, rootFsPath: '/repo-2' }];
        fireRepositoriesChange(updated);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setRepositories', {
          repositories: updated,
        });
        expect(initialStateCalls()).toHaveLength(1);
      });
    });

    describe('skill slash commands', () => {
      beforeEach(() => {
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue(REPOS_READY);
      });

      it('sends setSkillSlashCommands when skills are available', async () => {
        const skillCommands = [
          { name: '/deploy', description: 'Deploy skill', skillName: 'deploy' },
        ];
        mockAgentSkillsResolver.getSkillSlashCommands.mockResolvedValue({
          commands: skillCommands,
          warnings: [],
        });

        await notificationHandlers.appReady();
        await new Promise(process.nextTick);

        expect(mockAgentSkillsResolver.getSkillSlashCommands).toHaveBeenCalled();
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'setSkillSlashCommands',
          skillCommands,
        );
      });

      it('skips the notification when no skill slash commands are available', async () => {
        mockAgentSkillsResolver.getSkillSlashCommands.mockResolvedValue({
          commands: [],
          warnings: [],
        });

        await notificationHandlers.appReady();
        await new Promise(process.nextTick);

        expect(
          mockMessageBus.sendNotification.mock.calls.find(
            ([event]) => event === 'setSkillSlashCommands',
          ),
        ).toBeUndefined();
      });

      it('logs a warning and does not throw when resolving skills fails', async () => {
        mockAgentSkillsResolver.getSkillSlashCommands.mockRejectedValue(new Error('boom'));

        await expect(notificationHandlers.appReady()).resolves.toBeUndefined();
        await new Promise(process.nextTick);

        expect(
          mockMessageBus.sendNotification.mock.calls.find(
            ([event]) => event === 'setSkillSlashCommands',
          ),
        ).toBeUndefined();
      });
    });

    describe('GID conversion', () => {
      const baseProject = {
        name: 'My Project',
        namespaceWithPath: 'group/project',
        remoteName: 'origin',
        duoAgenticChatAvailable: true,
      };

      async function getInitialStateRepositories(): Promise<AgentPlatformRepository[]> {
        await notificationHandlers.appReady();
        await new Promise(process.nextTick);
        const call = mockMessageBus.sendNotification.mock.calls.find(
          ([event]) => event === 'initialState',
        );
        return call?.[1].repositories ?? [];
      }

      it('converts GID id, namespaceId, and rootNamespaceId to numeric strings', async () => {
        const repos: AgentPlatformRepository[] = [
          {
            type: 'single',
            rootFsPath: '/repo',
            folderName: 'repo',
            projects: [
              {
                ...baseProject,
                id: 'gid://gitlab/Project/123',
                namespaceId: 'gid://gitlab/Group/456',
                rootNamespaceId: 'gid://gitlab/Group/789',
              },
            ],
          },
        ];
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: repos });

        const result = await getInitialStateRepositories();

        expect(result[0].projects[0]).toMatchObject({
          id: '123',
          namespaceId: '456',
          rootNamespaceId: '789',
        });
      });

      it('preserves null id, namespaceId, and rootNamespaceId as null', async () => {
        const repos: AgentPlatformRepository[] = [
          {
            type: 'single',
            rootFsPath: '/repo',
            folderName: 'repo',
            projects: [
              {
                ...baseProject,
                id: null,
                namespaceId: null,
                rootNamespaceId: null,
              },
            ],
          },
        ];
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: repos });

        const result = await getInitialStateRepositories();

        expect(result[0].projects[0]).toMatchObject({
          id: null,
          namespaceId: null,
          rootNamespaceId: null,
        });
      });

      it('converts only non-null fields and preserves null fields', async () => {
        const repos: AgentPlatformRepository[] = [
          {
            type: 'single',
            rootFsPath: '/repo',
            folderName: 'repo',
            projects: [
              {
                ...baseProject,
                id: 'gid://gitlab/Project/42',
                namespaceId: null,
                rootNamespaceId: null,
              },
            ],
          },
        ];
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: repos });

        const result = await getInitialStateRepositories();

        expect(result[0].projects[0]).toMatchObject({
          id: '42',
          namespaceId: null,
          rootNamespaceId: null,
        });
      });

      it('converts all projects across multiple repositories', async () => {
        const repos: AgentPlatformRepository[] = [
          {
            type: 'single',
            rootFsPath: '/repo-a',
            folderName: 'repo-a',
            projects: [
              {
                ...baseProject,
                id: 'gid://gitlab/Project/10',
                namespaceId: 'gid://gitlab/Group/20',
                rootNamespaceId: 'gid://gitlab/Group/30',
              },
            ],
          },
          {
            type: 'multiple',
            rootFsPath: '/repo-b',
            folderName: 'repo-b',
            projects: [
              {
                ...baseProject,
                id: 'gid://gitlab/Project/11',
                namespaceId: 'gid://gitlab/Group/21',
                rootNamespaceId: 'gid://gitlab/Group/31',
              },
              {
                ...baseProject,
                id: 'gid://gitlab/Project/12',
                namespaceId: null,
                rootNamespaceId: 'gid://gitlab/Group/32',
              },
            ],
          },
        ];
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: repos });

        const result = await getInitialStateRepositories();

        expect(result[0].projects[0]).toMatchObject({
          id: '10',
          namespaceId: '20',
          rootNamespaceId: '30',
        });
        expect(result[1].projects[0]).toMatchObject({
          id: '11',
          namespaceId: '21',
          rootNamespaceId: '31',
        });
        expect(result[1].projects[1]).toMatchObject({
          id: '12',
          namespaceId: null,
          rootNamespaceId: '32',
        });
      });

      it('preserves other project fields unchanged', async () => {
        const repos: AgentPlatformRepository[] = [
          {
            type: 'single',
            rootFsPath: '/repo',
            folderName: 'repo',
            projects: [
              {
                ...baseProject,
                id: 'gid://gitlab/Project/99',
                namespaceId: 'gid://gitlab/Group/88',
                rootNamespaceId: 'gid://gitlab/Group/77',
              },
            ],
          },
        ];
        mockAgentPlatformProjectService.getRepositories.mockResolvedValue({ repositories: repos });

        const result = await getInitialStateRepositories();

        expect(result[0].projects[0]).toMatchObject(baseProject);
        expect(result[0]).toMatchObject({
          type: 'single',
          rootFsPath: '/repo',
          folderName: 'repo',
        });
      });
    });
  });

  describe('when copyMessage notification is received', () => {
    it('forwards the message to the extension message bus', async () => {
      await notificationHandlers.copyMessage({ message: 'Hello, world!' });

      expect(mockExtensionMessageBus.sendNotification).toHaveBeenCalledWith('copyMessage', {
        message: 'Hello, world!',
      });
    });
  });

  describe('when copyCodeSnippet notification is received', () => {
    it('forwards the snippet to the extension message bus', async () => {
      await notificationHandlers.copyCodeSnippet({ snippet: 'const x = 1;' });

      expect(mockExtensionMessageBus.sendNotification).toHaveBeenCalledWith('copyCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });
  });

  describe('when insertCodeSnippet notification is received', () => {
    it('forwards the snippet to the extension message bus', async () => {
      await notificationHandlers.insertCodeSnippet({ snippet: 'const x = 1;' });

      expect(mockExtensionMessageBus.sendNotification).toHaveBeenCalledWith('insertCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });
  });

  describe('when selectProjectForWorkflow notification is received', () => {
    it('calls setSelectedProject on the project service', async () => {
      mockAgentPlatformProjectService.setSelectedProject.mockResolvedValue(undefined);

      await notificationHandlers.selectProjectForWorkflow({
        repositoryPath: '/path/to/repo',
        projectPath: 'group/project',
      });

      expect(mockAgentPlatformProjectService.setSelectedProject).toHaveBeenCalledWith(
        '/path/to/repo',
        'group/project',
      );
    });
  });

  describe('when checkUsageQuota notification is received', () => {
    it('asks the service whether usage credits are exhausted and pushes the result', async () => {
      mockUsageQuotaService.checkUsageCreditsExceeded.mockResolvedValue(true);

      await notificationHandlers.checkUsageQuota({
        rootNamespaceId: '7',
        projectId: '42',
        workflowDefinition: 'chat',
      });

      expect(mockUsageQuotaService.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        '7',
        'chat',
        '42',
      );
      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setUsageQuotaExceeded', {
        exceeded: true,
      });
    });

    it('pushes exceeded=false when the service says credits are fine', async () => {
      mockUsageQuotaService.checkUsageCreditsExceeded.mockResolvedValue(false);

      await notificationHandlers.checkUsageQuota({});

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setUsageQuotaExceeded', {
        exceeded: false,
      });
    });

    it('does not push when the underlying service throws', async () => {
      mockUsageQuotaService.checkUsageCreditsExceeded.mockRejectedValue(new Error('boom'));

      await notificationHandlers.checkUsageQuota({});

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
        'setUsageQuotaExceeded',
        expect.anything(),
      );
    });

    it('aborts the previous in-flight check when a new one arrives', async () => {
      const signals: AbortSignal[] = [];
      let resolveFirst: ((value: boolean) => void) | undefined;
      mockUsageQuotaService.checkUsageCreditsExceeded
        .mockImplementationOnce((signal: AbortSignal) => {
          signals.push(signal);
          return new Promise<boolean>((resolve) => {
            resolveFirst = resolve;
          });
        })
        .mockImplementationOnce((signal: AbortSignal) => {
          signals.push(signal);
          return Promise.resolve(true);
        });

      const firstCall = notificationHandlers.checkUsageQuota({ rootNamespaceId: '1' });
      const secondCall = notificationHandlers.checkUsageQuota({ rootNamespaceId: '2' });

      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);

      // Resolve the stale first call last; its result must be discarded.
      resolveFirst?.(false);
      await Promise.all([firstCall, secondCall]);

      const quotaCalls = mockMessageBus.sendNotification.mock.calls.filter(
        ([event]: [string]) => event === 'setUsageQuotaExceeded',
      );
      expect(quotaCalls).toEqual([['setUsageQuotaExceeded', { exceeded: true }]]);
    });
  });

  describe('when persistSelectedModel notification is received', () => {
    it('stores modelRef in storage', async () => {
      mockUserService.getUser.mockResolvedValue({} as never);

      await notificationHandlers.persistSelectedModel({ modelRef: 'claude-3-5-sonnet' });

      expect(mockUserService.getUser).toHaveBeenCalled();
      expect(mockStorage.set).toHaveBeenCalledWith(
        SELECTED_CHAT_MODEL_STORAGE_KEY,
        'claude-3-5-sonnet',
      );
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('deletes the stored model when modelRef is null', async () => {
      mockUserService.getUser.mockResolvedValue({} as never);

      await notificationHandlers.persistSelectedModel({ modelRef: null });

      expect(mockUserService.getUser).toHaveBeenCalled();
      expect(mockStorage.delete).toHaveBeenCalledWith(SELECTED_CHAT_MODEL_STORAGE_KEY);
      expect(mockStorage.set).not.toHaveBeenCalled();
    });
  });

  describe('when fetchAvailableModels request is received', () => {
    const baseModelsData = createFakePartial<AiChatAvailableModelsData>({
      aiChatAvailableModels: {
        defaultModel: { name: 'Claude', ref: 'claude-ref' },
        selectableModels: [],
        pinnedModel: null,
      },
    });

    it('returns userModelSwitchingEnabled true when instance version >= 18.5.0', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: { version: '18.5.0', featureFlags: [] },
      });

      const result = (await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      })) as AiChatAvailableModelsData & { userModelSwitchingEnabled: boolean };

      expect(mockWorkflowManager.fetchAvailableModels).toHaveBeenCalledWith('gid://gitlab/Group/1');
      expect(result.userModelSwitchingEnabled).toBe(true);
    });

    it('returns userModelSwitchingEnabled true when instance version > 18.5.0', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: { version: '19.0.0', featureFlags: [] },
      });

      const result = (await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      })) as { userModelSwitchingEnabled: boolean };

      expect(result.userModelSwitchingEnabled).toBe(true);
    });

    it('returns userModelSwitchingEnabled based on feature flag when version < 18.5.0 and flag is enabled', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: {
          version: '18.4.0',
          featureFlags: [{ name: 'ai_user_model_switching', enabled: true }],
        },
      });

      const result = await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      });

      expect(result.userModelSwitchingEnabled).toBe(true);
    });

    it('returns userModelSwitchingEnabled false when version < 18.5.0 and flag is disabled', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: {
          version: '18.4.0',
          featureFlags: [{ name: 'ai_user_model_switching', enabled: false }],
        },
      });

      const result = await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      });

      expect(result.userModelSwitchingEnabled).toBe(false);
    });

    it('returns userModelSwitchingEnabled false when version < 18.5.0 and flag is absent', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: { version: '18.4.0', featureFlags: [] },
      });

      const result = await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      });

      expect(result.userModelSwitchingEnabled).toBe(false);
    });

    it('returns userModelSwitchingEnabled false when metadata is null', async () => {
      mockWorkflowManager.fetchAvailableModels.mockResolvedValue({
        ...baseModelsData,
        metadata: null,
      });

      const result = await requestHandlers.fetchAvailableModels({
        rootNamespaceId: 'gid://gitlab/Group/1',
      });

      expect(result.userModelSwitchingEnabled).toBe(false);
    });
  });

  describe('when getPersistedSelectedModel request is received', () => {
    it('returns the stored model ref when user is authenticated', async () => {
      mockUserService.getUser.mockResolvedValue({} as never);
      mockStorage.get.mockResolvedValue('claude-3-5-sonnet');

      const result = await requestHandlers.getPersistedSelectedModel();

      expect(mockUserService.getUser).toHaveBeenCalled();
      expect(mockStorage.get).toHaveBeenCalledWith(SELECTED_CHAT_MODEL_STORAGE_KEY);
      expect(result).toBe('claude-3-5-sonnet');
    });

    it('returns null when no model is stored', async () => {
      mockUserService.getUser.mockResolvedValue({} as never);
      mockStorage.get.mockResolvedValue(undefined);

      const result = await requestHandlers.getPersistedSelectedModel();

      expect(result).toBeNull();
    });
  });

  describe('when fetchAgents request is received', () => {
    it('returns foundational and catalog agents', async () => {
      mockWorkflowManager.fetchFoundationalAgents.mockResolvedValue({
        aiFoundationalChatAgents: {
          nodes: [
            {
              id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/chat',
              name: 'GitLab Duo',
              description: 'General assistant',
              referenceWithVersion: 'chat',
            },
          ],
        },
      });
      mockWorkflowManager.fetchCatalogAgents.mockResolvedValue({
        aiCatalogConfiguredItems: {
          nodes: [
            {
              id: 'node-1',
              pinnedItemVersion: { id: 'pinned-v1' },
              item: {
                id: 'agent-1',
                name: 'Custom Agent',
                description: 'A custom agent',
                latestVersion: { id: 'latest-v1' },
              },
            },
          ],
        },
        metadata: { version: '18.7.0' },
      });

      const result = await requestHandlers.fetchAgents({
        projectId: '123',
        namespaceId: '456',
      });

      expect(mockWorkflowManager.fetchFoundationalAgents).toHaveBeenCalledWith(
        'gid://gitlab/Project/123',
        'gid://gitlab/Group/456',
      );
      expect(mockWorkflowManager.fetchCatalogAgents).toHaveBeenCalledWith(
        'gid://gitlab/Project/123',
      );

      expect(result.agents).toHaveLength(2);
      expect(result.agents[0]).toMatchObject({
        id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/chat',
        foundational: true,
      });
      expect(result.agents[1]).toMatchObject({
        id: 'agent-1',
        foundational: false,
        pinnedItemVersionId: 'pinned-v1',
      });
    });

    it('uses latestVersion for catalog agents on instances below 18.7.0', async () => {
      mockWorkflowManager.fetchFoundationalAgents.mockResolvedValue({
        aiFoundationalChatAgents: { nodes: [] },
      });
      mockWorkflowManager.fetchCatalogAgents.mockResolvedValue({
        aiCatalogConfiguredItems: {
          nodes: [
            {
              id: 'node-1',
              pinnedItemVersion: null,
              item: {
                id: 'agent-1',
                name: 'Custom Agent',
                description: 'A custom agent',
                latestVersion: { id: 'latest-v1' },
              },
            },
          ],
        },
        metadata: { version: '18.6.0' },
      });

      const result = await requestHandlers.fetchAgents({
        projectId: '123',
        namespaceId: '456',
      });

      expect(result.agents[0]?.pinnedItemVersionId).toBe('latest-v1');
    });

    it('skips catalog agents without pinnedItemVersion on 18.7+', async () => {
      mockWorkflowManager.fetchFoundationalAgents.mockResolvedValue({
        aiFoundationalChatAgents: { nodes: [] },
      });
      mockWorkflowManager.fetchCatalogAgents.mockResolvedValue({
        aiCatalogConfiguredItems: {
          nodes: [
            {
              id: 'node-1',
              item: {
                id: 'agent-1',
                name: 'No Pinned',
                description: 'Missing pinned version',
                latestVersion: { id: 'latest-v1' },
              },
            },
          ],
        },
        metadata: { version: '18.7.0' },
      });

      const result = await requestHandlers.fetchAgents({
        projectId: '123',
        namespaceId: '456',
      });

      expect(result.agents).toHaveLength(0);
    });

    it('returns empty agents when both fetches fail', async () => {
      mockWorkflowManager.fetchFoundationalAgents.mockRejectedValue(new Error('fail'));
      mockWorkflowManager.fetchCatalogAgents.mockRejectedValue(new Error('fail'));

      const result = await requestHandlers.fetchAgents({
        projectId: '123',
        namespaceId: '456',
      });

      expect(result.agents).toEqual([]);
    });

    it('returns foundational agents when catalog fetch fails', async () => {
      mockWorkflowManager.fetchFoundationalAgents.mockResolvedValue({
        aiFoundationalChatAgents: {
          nodes: [
            {
              id: 'f-1',
              name: 'Duo',
              description: 'desc',
              referenceWithVersion: 'chat',
            },
          ],
        },
      });
      mockWorkflowManager.fetchCatalogAgents.mockRejectedValue(new Error('fail'));

      const result = await requestHandlers.fetchAgents({
        projectId: '123',
        namespaceId: '456',
      });
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.id).toBe('f-1');
    });
  });

  describe('when getAgentFlowConfig request is received', () => {
    it('delegates to workflowManager and returns the config', async () => {
      mockWorkflowManager.fetchAgentFlowConfig.mockResolvedValue('yaml-flow-config');

      const result = await requestHandlers.getAgentFlowConfig({ agentVersionId: 'version-1' });

      expect(mockWorkflowManager.fetchAgentFlowConfig).toHaveBeenCalledWith('version-1');
      expect(result).toBe('yaml-flow-config');
    });

    it('returns empty string when fetch fails', async () => {
      mockWorkflowManager.fetchAgentFlowConfig.mockRejectedValue(new Error('not found'));

      const result = await requestHandlers.getAgentFlowConfig({ agentVersionId: 'version-1' });

      expect(result).toBe('');
    });
  });

  describe('when submitFeedback notification is received', () => {
    it('tracks the feedback event via the telemetry tracker', async () => {
      const feedbackContext: UserFeedbackContext = {
        workflowType: 'chat',
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        feedback: {
          feedbackType: 'thumbs_up',
          reason: 'helpful',
        },
      };

      await notificationHandlers.submitFeedback(feedbackContext);
      await new Promise(process.nextTick);

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.UserFeedback,
        {
          source: 'chat',
          feedbackType: 'thumbs_up',
          reason: 'helpful',
          workflowId: '123',
        },
      );
    });
  });
});
