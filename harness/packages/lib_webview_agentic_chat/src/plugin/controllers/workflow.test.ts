import {
  WorkflowRunner,
  DuoWorkflowLatestCheckpoint,
  DuoWorkflowStatus,
  WorkflowType,
  WorkflowStatusCode,
  parseLatestCheckpointWorkflowData,
  DuoWorkflowEvent,
  generateErrorMessageFromStatusCode,
  isWorkflowExecutorErrorEvent,
  WorkflowExecutorError,
  WorkflowRetryEvent,
  ToolApprovalType,
} from '@gitlab-lsp/workflow-api';
import { NullLogger } from '@gitlab-org/logging';
import { SystemContextManager, AIContextItem, ChatContextManager } from '@gitlab-org/ai-context';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { SandboxUnavailableError } from '@gitlab-org/sandbox/errors';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { asyncGeneratorFromArray, createFakePartial } from '@gitlab-org/test-utils';
import {
  DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
  DUO_NO_NAMESPACE_DETECTED_MESSAGE,
  GitLabApiService,
} from '@gitlab-org/core';
import { MessageBus } from '@gitlab-org/message-bus';
import { DuoAgentPlatformTracker, DuoAgentPlatformEvent } from '@gitlab-org/telemetry';

import { initWorkflowController } from './workflow';
import { NO_REPLY } from './constants';

// Mock functions to spy on them but preserve original implementation
jest.mock('@gitlab-lsp/workflow-api', () => {
  const actualWorkflowApi = jest.requireActual('@gitlab-lsp/workflow-api');
  return {
    ...actualWorkflowApi,
    isWorkflowExecutorErrorEvent: jest.fn(actualWorkflowApi.isWorkflowExecutorErrorEvent),
  };
});

const runningCheckpoint: DuoWorkflowLatestCheckpoint = {
  duoWorkflowWorkflows: {
    nodes: [
      {
        latestCheckpoint: {
          checkpoint: JSON.stringify({
            channel_values: {
              status: 'Execution',
            },
          }),
          errors: [],
          workflowStatus: DuoWorkflowStatus.RUNNING,
          workflowGoal: 'Fix this',
        },
        project: {
          fullPath: 'gitlab-org/gitlab',
        },
      },
    ],
  },
};
const checkpointWithoutGoal: DuoWorkflowLatestCheckpoint = {
  duoWorkflowWorkflows: {
    nodes: [
      {
        latestCheckpoint: {
          checkpoint: JSON.stringify({
            channel_values: {
              status: 'Execution',
            },
          }),
          errors: [],
          workflowStatus: DuoWorkflowStatus.RUNNING,
          workflowGoal: '',
        },
        project: {
          fullPath: 'gitlab-org/gitlab',
        },
      },
    ],
  },
};

describe('WorkflowController', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workflowController: any;
  let mockWorkflowApi: jest.Mocked<WorkflowRunner>;
  let mockSubCallback: jest.MockedFunction<(message: DuoWorkflowEvent, workflowId: string) => void>;
  let mockSecretRedactor: SecretRedactor;
  let mockGitlabApiService: GitLabApiService;
  let mockMessageBus: MessageBus;

  const mockDuoAgentPlatformTracker = createFakePartial<DuoAgentPlatformTracker>({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(true),
  });
  let chatContextManager: ChatContextManager;
  let systemContextManager: SystemContextManager;
  let mockMcpManager: McpManagerWorkflowExecutorAdaptor;

  beforeEach(() => {
    mockMcpManager = createFakePartial<McpManagerWorkflowExecutorAdaptor>({
      preWarm: jest.fn(),
    });
    mockSubCallback = jest.fn();
    mockWorkflowApi = {
      getGraphqlData: jest.fn(),
      disconnectCable: jest.fn(),
      runWorkflow: jest.fn().mockReturnValue(asyncGeneratorFromArray([])),
      stopWorkflow: jest.fn(),
      interruptRunningCommand: jest.fn(),
      createWorkflow: jest.fn().mockResolvedValue('1'),
      preCreateWorkflow: jest.fn(),
      sendEvent: jest.fn(),
      updateStatus: jest.fn(),
      getProjectPath: jest.fn(),
      getNamespacePath: jest.fn(),
      getServerCapabilities: jest.fn().mockReturnValue(['tool_call_approval']),
    } as unknown as jest.Mocked<WorkflowRunner>;

    chatContextManager = createFakePartial<ChatContextManager>({
      retrieveContextItemsWithContent: jest.fn().mockResolvedValue([]),
      clearSelectedContextItems: jest.fn(),
    });

    systemContextManager = createFakePartial<SystemContextManager>({
      precalculateOnWorkflowStart: jest.fn().mockResolvedValue(undefined),
      getSystemContextItems: jest.fn().mockResolvedValue([]),
    });

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn().mockImplementation((input: string) => input),
    });

    mockGitlabApiService = createFakePartial<GitLabApiService>({
      instanceInfo: {
        instanceVersion: '18.3.0',
      },
    });

    mockMessageBus = createFakePartial<MessageBus>({
      sendNotification: jest.fn(),
    });

    workflowController = initWorkflowController(
      mockWorkflowApi,
      mockSubCallback,
      mockMessageBus,
      new NullLogger(),
      chatContextManager,
      systemContextManager,
      mockSecretRedactor,
      mockGitlabApiService,
      mockDuoAgentPlatformTracker,
      mockMcpManager,
    );
  });

  describe('getWorkflowById', () => {
    describe('version fallback behavior', () => {
      describe('when instance version is >= 18.3', () => {
        let newVersionController: ReturnType<typeof initWorkflowController>;

        beforeEach(() => {
          const newVersionGitlabApiService = createFakePartial<GitLabApiService>({
            instanceInfo: {
              instanceVersion: '18.3.0',
            },
          });

          newVersionController = initWorkflowController(
            mockWorkflowApi,
            mockSubCallback,
            mockMessageBus,
            new NullLogger(),
            chatContextManager,
            systemContextManager,
            mockSecretRedactor,
            newVersionGitlabApiService,
            mockDuoAgentPlatformTracker,
            mockMcpManager,
          );

          mockWorkflowApi.getGraphqlData.mockResolvedValueOnce(runningCheckpoint);
        });

        it('uses the new latestCheckpoint query', async () => {
          await newVersionController.getWorkflowById({ workflowId: '1' });

          expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
            query: expect.stringContaining('latestCheckpoint'),
            variables: { workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1' },
          });
        });

        it('does not call the old duoWorkflowEvents query', async () => {
          await newVersionController.getWorkflowById({ workflowId: '1' });

          expect(mockWorkflowApi.getGraphqlData).not.toHaveBeenCalledWith({
            query: expect.stringContaining('duoWorkflowEvents'),
            variables: expect.any(Object),
          });
        });
      });

      describe('when instance version is < 18.3', () => {
        let oldVersionController: ReturnType<typeof initWorkflowController>;

        beforeEach(() => {
          const oldVersionGitlabApiService = createFakePartial<GitLabApiService>({
            instanceInfo: {
              instanceVersion: '18.2.0',
            },
          });

          oldVersionController = initWorkflowController(
            mockWorkflowApi,
            mockSubCallback,
            mockMessageBus,
            new NullLogger(),
            chatContextManager,
            systemContextManager,
            mockSecretRedactor,
            oldVersionGitlabApiService,
            mockDuoAgentPlatformTracker,
            mockMcpManager,
          );

          const oldFormatResponse = {
            duoWorkflowEvents: {
              nodes: [
                {
                  checkpoint: JSON.stringify({
                    channel_values: { status: 'Execution' },
                  }),
                  errors: [],
                  workflowStatus: DuoWorkflowStatus.RUNNING,
                  workflowGoal: 'Fix this',
                },
              ],
            },
            duoWorkflowWorkflows: {
              nodes: [
                {
                  id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1',
                  status: DuoWorkflowStatus.RUNNING,
                  project: {
                    fullPath: 'gitlab-org/gitlab',
                  },
                },
              ],
            },
          };
          mockWorkflowApi.getGraphqlData.mockResolvedValueOnce(oldFormatResponse);
        });

        it('uses the old duoWorkflowEvents query', async () => {
          await oldVersionController.getWorkflowById({ workflowId: '1' });

          expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
            query: expect.stringContaining('duoWorkflowEvents'),
            variables: { workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1' },
          });
        });

        it('does not call the new latestCheckpoint query', async () => {
          await oldVersionController.getWorkflowById({ workflowId: '1' });

          expect(mockWorkflowApi.getGraphqlData).not.toHaveBeenCalledWith({
            query: expect.stringContaining('latestCheckpoint'),
            variables: expect.any(Object),
          });
        });
      });
    });

    describe('when latest checkpoint query returns data', () => {
      const latestCheckpointResponse = {
        duoWorkflowWorkflows: {
          nodes: [
            {
              latestCheckpoint: {
                errors: [],
                workflowStatus: DuoWorkflowStatus.RUNNING,
                checkpoint: JSON.stringify({
                  ts: '2023-01-01T00:00:00Z',
                  channel_values: { status: 'Planning' },
                }),
                workflowGoal: 'Latest goal',
              },
              project: {
                fullPath: 'gitlab-org/gitlab-lsp',
              },
            },
          ],
        },
      };

      beforeEach(() => {
        mockWorkflowApi.getGraphqlData.mockResolvedValueOnce(latestCheckpointResponse);
      });

      it('uses latest checkpoint data', async () => {
        const results = await workflowController.getWorkflowById({ workflowId: '1' });

        expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          {
            eventName: 'workflowCheckpoint',
            data: expect.objectContaining({
              workflowStatus: DuoWorkflowStatus.RUNNING,
              workflowGoal: 'Latest goal',
            }),
          },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.RUNNING },
          { eventName: 'workflowGoal', data: 'Latest goal' },
          { eventName: 'setWorkflowProject', data: 'gitlab-org/gitlab-lsp' },
        ]);
      });
    });

    describe('when latest checkpoint query returns empty', () => {
      beforeEach(() => {
        mockWorkflowApi.getGraphqlData.mockResolvedValueOnce({
          duoWorkflowWorkflows: {
            nodes: [
              {
                latestCheckpoint: null,
              },
            ],
          },
        });
      });

      it('returns default data without setWorkflowProject event', async () => {
        const results = await workflowController.getWorkflowById({ workflowId: '1' });

        expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledTimes(1);

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          {
            eventName: 'workflowCheckpoint',
            data: {
              errors: [],
              workflowStatus: DuoWorkflowStatus.RUNNING,
              checkpoint: {
                ts: expect.any(String),
                channel_values: { status: 'Planning' },
              },
              workflowGoal: '',
            },
          },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.RUNNING },
        ]);
      });
    });

    describe('when the workflow is fetched successfully', () => {
      beforeEach(() => {
        mockWorkflowApi.getGraphqlData.mockResolvedValue(runningCheckpoint);
      });

      it('returns the expected payload', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });
        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);
      });
    });

    describe('when the goal is empty', () => {
      beforeEach(() => {
        mockWorkflowApi.getGraphqlData.mockResolvedValue(checkpointWithoutGoal);
      });
      it('returns the expected payload without the goal but with project', async () => {
        const results = await workflowController.getWorkflowById({ workflowId: '1' });
        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          {
            eventName: 'workflowCheckpoint',
            data: (() => {
              const result = parseLatestCheckpointWorkflowData(checkpointWithoutGoal);
              return result.isOk() ? result.value : null;
            })(),
          },
          {
            eventName: 'workflowStatus',
            data: DuoWorkflowStatus.RUNNING,
          },
          { eventName: 'setWorkflowProject', data: 'gitlab-org/gitlab' },
        ]);
      });
    });

    describe('when the workflow fails to be fetched', () => {
      beforeEach(() => {
        mockWorkflowApi.getGraphqlData.mockRejectedValue(new Error('Problem with Workflow API'));
      });

      it('returns the errored payload', async () => {
        const results = await workflowController.getWorkflowById({ workflowId: '1' });
        expect(results).toEqual([
          {
            eventName: 'workflowError',
            data: {
              message: 'Error fetching workflow: Problem with Workflow API',
            },
          },
        ]);
      });
    });
  });

  describe('startWorkflow', () => {
    describe('when an existing workflow ID is passed', () => {
      const additionalContext = createFakePartial<AIContextItem[]>([
        {
          id: '1',
          category: 'file',
        },
        {
          id: '2',
          category: 'issue',
        },
      ]);
      beforeEach(async () => {
        mockWorkflowApi.getGraphqlData.mockResolvedValue(runningCheckpoint);
        jest
          .mocked(chatContextManager.retrieveContextItemsWithContent)
          .mockResolvedValue(additionalContext);

        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          existingWorkflowId: '1',
          metadata: {},
        });
      });

      it('passes the existing workflow ID to runWorkflow', async () => {
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'test-goal',
            type: 'test-type',
            existingWorkflowId: '1',
            metadata: {},
          }),
        );
      });

      it('passes AIContext when running workflow', () => {
        expect(chatContextManager.retrieveContextItemsWithContent).toHaveBeenCalled();
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ additionalContext }),
        );
      });

      it('returns empty array for existing workflow', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test',
          type: WorkflowType.CHAT,
          existingWorkflowId: '1',
          metadata: {},
        });

        expect(results).toEqual([]);
      });

      it('does not call createWorkflow', async () => {
        expect(mockWorkflowApi.createWorkflow).not.toHaveBeenCalled();
      });
    });

    describe('when preCreatedWorkflowId is provided', () => {
      beforeEach(() => {
        jest.mocked(chatContextManager.retrieveContextItemsWithContent).mockResolvedValue([]);
      });

      it('does not call createWorkflow', async () => {
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          preCreatedWorkflowId: 'pre-created-123',
          metadata: {},
        });

        expect(mockWorkflowApi.createWorkflow).not.toHaveBeenCalled();
      });

      it('returns the expected payload', async () => {
        // Mock runWorkflow to return an async generator that yields no events
        mockWorkflowApi.runWorkflow.mockReturnValue(asyncGeneratorFromArray([]));

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          preCreatedWorkflowId: 'pre-created-123',
          metadata: {},
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: 'pre-created-123' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);
      });
    });

    describe('when both existingWorkflowId and preCreatedWorkflowId are provided', () => {
      beforeEach(() => {
        jest.mocked(chatContextManager.retrieveContextItemsWithContent).mockResolvedValue([]);
      });

      it('does not call createWorkflow', async () => {
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          existingWorkflowId: 'existing-123',
          preCreatedWorkflowId: 'pre-created-123',
          metadata: {},
        });

        expect(mockWorkflowApi.createWorkflow).not.toHaveBeenCalled();
      });

      it('returns empty array for existing workflow', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test',
          type: WorkflowType.CHAT,
          existingWorkflowId: '1',
          preCreatedWorkflowId: 'pre-created-123',
          metadata: {},
        });

        expect(results).toEqual([]);
      });
    });

    describe('when no workflow IDs are provided', () => {
      const testMetadata = {
        projectId: 'gid://gitlab/Project/278964',
        namespaceId: 'gid://gitlab/Group/9970',
      };

      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('1');
      });

      it('calls createWorkflow', async () => {
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          metadata: testMetadata,
        });

        expect(mockWorkflowApi.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          'test-type',
          undefined,
          undefined,
          testMetadata,
          undefined,
        );
      });

      it('calls runWorkflow with created workflow ID', async () => {
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
          metadata: testMetadata,
        });

        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'test-goal',
            type: 'test-type',
            existingWorkflowId: '1',
            metadata: testMetadata,
          }),
        );
      });

      it('returns the expected payload', async () => {
        mockWorkflowApi.runWorkflow.mockReturnValue(asyncGeneratorFromArray([]));

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });
        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);
      });

      it('clears selected context items ', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        // Extract and resolve the promise from results to trigger clearSelectedContextItems
        const completionPromise = results.find((r: unknown) => r instanceof Promise);
        if (completionPromise) {
          await completionPromise;
        }

        expect(chatContextManager.clearSelectedContextItems).toHaveBeenCalled();
      });

      it('passes along the given flow config and catalog item', async () => {
        const aiCatalogItemVersionId = 'agent 4';
        const flowConfig = 'flow config';
        const workflowDefinition = 'test_agent/v1';
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.CHAT,
          aiCatalogItemVersionId,
          flowConfig,
          workflowDefinition,
          metadata: {},
        });

        expect(mockWorkflowApi.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          WorkflowType.CHAT,
          workflowDefinition,
          aiCatalogItemVersionId,
          {},
          undefined,
        );

        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfig,
            workflowDefinition,
            aiCatalogItemVersionId,
          }),
        );
      });

      it('passes flowConfigId, flowConfigSchemaVersion, flowVersion, and additionalOptions to runWorkflow', async () => {
        const flowConfigId = 'software_development';
        const flowConfigSchemaVersion = 'v1';
        const flowVersion = '1.0.0';
        const additionalOptions = { preApprovedAgentPrivileges: [] };

        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.SOFTWARE_DEVELOPMENT,
          metadata: testMetadata,
          flowConfigId,
          flowConfigSchemaVersion,
          flowVersion,
          additionalOptions,
        });

        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigId,
            flowConfigSchemaVersion,
            flowVersion,
            additionalOptions,
          }),
        );
      });

      it('passes additionalOptions to createWorkflow', async () => {
        const additionalOptions = { preApprovedAgentPrivileges: [] };

        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.SOFTWARE_DEVELOPMENT,
          metadata: testMetadata,
          additionalOptions,
        });

        expect(mockWorkflowApi.createWorkflow).toHaveBeenCalledWith(
          'test-goal',
          WorkflowType.SOFTWARE_DEVELOPMENT,
          undefined,
          undefined,
          testMetadata,
          additionalOptions,
        );
      });
    });

    describe('when workflow creation fails', () => {
      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockRejectedValue(new Error('Workflow creation failed'));
      });

      it('returns specific creation failed error', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowError', data: 'The service could not create the workflow.' },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
        ]);
      });

      it('surfaces the not-entitled Duo message instead of the generic creation error', async () => {
        mockWorkflowApi.createWorkflow.mockRejectedValue(
          new Error(DUO_NAMESPACE_NOT_ENTITLED_MESSAGE),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowError', data: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
        ]);
      });

      it('surfaces the no-namespace Duo message instead of the generic creation error', async () => {
        mockWorkflowApi.createWorkflow.mockRejectedValue(
          new Error(DUO_NO_NAMESPACE_DETECTED_MESSAGE),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowError', data: DUO_NO_NAMESPACE_DETECTED_MESSAGE },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
        ]);
      });

      it('returns usage quota exceeded event when insufficient credits message is returned', async () => {
        mockWorkflowApi.createWorkflow.mockRejectedValue(
          new Error(
            '403 Forbidden - session failed to start due to insufficient GitLab credits. Purchase more credits to continue.',
          ),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          {
            eventName: 'setUsageQuotaExceeded',
            data: { exceeded: true, isMidStream: true },
          },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
        ]);
      });
    });

    describe('when the workflow fails to start', () => {
      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('1');
        mockWorkflowApi.runWorkflow.mockImplementation(async function* () {
          yield* [];
          throw new Error('Error starting workflow');
        });
      });

      it('returns initial success and handles errors in background', async () => {
        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);
      });
    });

    describe('when context retrieval fails', () => {
      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('1');
        jest
          .mocked(chatContextManager.retrieveContextItemsWithContent)
          .mockRejectedValue(new Error('Context retrieval failed'));
      });

      it('includes processing error in response and continues with empty context', async () => {
        // Mock runWorkflow to return successful completion
        mockWorkflowApi.runWorkflow.mockReturnValue(asyncGeneratorFromArray([]));

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual(
          expect.arrayContaining([
            {
              eventName: 'workflowError',
              data: 'An error occurred while retrieving attached context items. Chat will proceed without them.',
            },
          ]),
        );

        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            additionalContext: [],
          }),
        );
      });
    });

    describe('error handling in runWorkflow', () => {
      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('1');
      });

      it('handles WorkflowExecutorErrorEvent from async generator', async () => {
        const errorEvent = new WorkflowExecutorError('Workflow execution failed', 1);

        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(true);
        mockWorkflowApi.runWorkflow.mockImplementation(() => asyncGeneratorFromArray([errorEvent]));

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.CHAT,
          metadata: {},
          additionalContext: [],
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'Workflow execution failed',
        });

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'workflowStatus',
          DuoWorkflowStatus.FAILED,
        );
      });

      it('sends setUsageQuotaExceeded when WorkflowExecutorError has USAGE_QUOTA_EXCEEDED status', async () => {
        const quotaErrorEvent = new WorkflowExecutorError(
          'Quota exceeded',
          WorkflowStatusCode.USAGE_QUOTA_EXCEEDED,
        );

        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(true);
        mockWorkflowApi.runWorkflow.mockImplementation(() =>
          asyncGeneratorFromArray([quotaErrorEvent]),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.CHAT,
          metadata: {},
          additionalContext: [],
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('setUsageQuotaExceeded', {
          exceeded: true,
          isMidStream: true,
        });
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'workflowStatus',
          DuoWorkflowStatus.FAILED,
        );
      });

      it('processes normal workflow events and completes successfully', async () => {
        const workflowEvent = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Running' } }),
          errors: [],
          metadata: 'test-metadata',
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockWorkflowApi.runWorkflow.mockImplementation(() =>
          asyncGeneratorFromArray([workflowEvent]),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: WorkflowType.CHAT,
          metadata: {},
          additionalContext: [],
        });

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockSubCallback).toHaveBeenCalledWith(workflowEvent, '1');
        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);
      });

      it('processes multiple workflow events before completing', async () => {
        const event1 = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Planning' } }),
          errors: [],
          metadata: 'metadata-1',
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        const event2 = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Execution' } }),
          errors: [],
          metadata: 'metadata-2',
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockWorkflowApi.runWorkflow.mockImplementation(() =>
          asyncGeneratorFromArray([event1, event2]),
        );

        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockSubCallback).toHaveBeenCalledTimes(2);
        expect(mockSubCallback).toHaveBeenNthCalledWith(1, event1, '1');
        expect(mockSubCallback).toHaveBeenNthCalledWith(2, event2, '1');
      });

      it('calls isWorkflowExecutorErrorEvent for each yielded event', async () => {
        const event1: DuoWorkflowEvent = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Planning' } }),
          errors: [],
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        const event2: DuoWorkflowEvent = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Execution' } }),
          errors: [],
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        jest.mocked(isWorkflowExecutorErrorEvent).mockClear();
        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockWorkflowApi.runWorkflow.mockImplementation(() =>
          asyncGeneratorFromArray([event1, event2]),
        );

        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(isWorkflowExecutorErrorEvent).toHaveBeenCalledTimes(2);
        expect(isWorkflowExecutorErrorEvent).toHaveBeenNthCalledWith(1, event1);
        expect(isWorkflowExecutorErrorEvent).toHaveBeenNthCalledWith(2, event2);
      });

      it('stops processing events after encountering an error event', async () => {
        const regularEvent: DuoWorkflowEvent = {
          checkpoint: JSON.stringify({ channel_values: { status: 'Running' } }),
          errors: [],
          workflowGoal: 'test-goal',
          workflowStatus: DuoWorkflowStatus.RUNNING,
        };

        const errorEvent = new WorkflowExecutorError('Critical error occurred', 2);

        jest
          .mocked(isWorkflowExecutorErrorEvent)
          .mockReturnValueOnce(false) // Regular event
          .mockReturnValueOnce(true); // Error event

        mockWorkflowApi.runWorkflow.mockImplementation(() =>
          asyncGeneratorFromArray([regularEvent, errorEvent]),
        );

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockSubCallback).toHaveBeenCalledTimes(1);
        expect(mockSubCallback).toHaveBeenCalledWith(regularEvent, '1');
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'Critical error occurred',
        });
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'workflowStatus',
          DuoWorkflowStatus.FAILED,
        );
      });

      describe('iterator exhaustion handling', () => {
        beforeEach(() => {
          mockWorkflowApi.createWorkflow.mockResolvedValue('1');
          jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        });

        it('sends INPUT_REQUIRED when exhausts in RUNNING state', async () => {
          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([
              {
                checkpoint: JSON.stringify({ channel_values: { status: 'Running' } }),
                errors: [],
                workflowGoal: 'test-goal',
                workflowStatus: DuoWorkflowStatus.RUNNING,
              },
            ]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
            'workflowStatus',
            DuoWorkflowStatus.INPUT_REQUIRED,
          );
        });

        it('sends INPUT_REQUIRED when exhausts in CREATED state', async () => {
          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([
              {
                checkpoint: JSON.stringify({ channel_values: { status: 'Created' } }),
                errors: [],
                workflowGoal: 'test-goal',
                workflowStatus: DuoWorkflowStatus.CREATED,
              },
            ]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
            'workflowStatus',
            DuoWorkflowStatus.INPUT_REQUIRED,
          );
        });

        it('does not send status when exhausts in FINISHED state', async () => {
          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([
              {
                checkpoint: JSON.stringify({ channel_values: { status: 'Completed' } }),
                errors: [],
                workflowGoal: 'test-goal',
                workflowStatus: DuoWorkflowStatus.FINISHED,
              },
            ]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowStatus',
            expect.anything(),
          );
        });

        it('does not send status when exhausts in INPUT_REQUIRED state', async () => {
          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([
              {
                checkpoint: JSON.stringify({ channel_values: { status: 'Waiting' } }),
                errors: [],
                workflowGoal: 'test-goal',
                workflowStatus: DuoWorkflowStatus.INPUT_REQUIRED,
              },
            ]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowStatus',
            expect.anything(),
          );
        });

        it('does not send status when no events received', async () => {
          mockWorkflowApi.runWorkflow.mockImplementation(() => asyncGeneratorFromArray([]));

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowStatus',
            expect.anything(),
          );
        });
      });

      describe('when a WorkflowRetryEvent is interleaved in the stream', () => {
        beforeEach(() => {
          mockWorkflowApi.createWorkflow.mockResolvedValue('1');
          jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        });

        const retryEvent: WorkflowRetryEvent = {
          kind: 'retry',
          attempt: 1,
          maxAttempts: 3,
          backoffMs: 500,
        };

        it('skips the retry event and only forwards real workflow events to the callback', async () => {
          const runningEvent: DuoWorkflowEvent = {
            checkpoint: JSON.stringify({ channel_values: { status: 'Running' } }),
            errors: [],
            workflowGoal: 'test-goal',
            workflowStatus: DuoWorkflowStatus.RUNNING,
          };
          const finishedEvent: DuoWorkflowEvent = {
            checkpoint: JSON.stringify({ channel_values: { status: 'Completed' } }),
            errors: [],
            workflowGoal: 'test-goal',
            workflowStatus: DuoWorkflowStatus.FINISHED,
          };

          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([runningEvent, retryEvent, finishedEvent]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          // Only the two real events reach the callback, not the retry event
          expect(mockSubCallback).toHaveBeenCalledTimes(2);
          expect(mockSubCallback).toHaveBeenNthCalledWith(1, runningEvent, '1');
          expect(mockSubCallback).toHaveBeenNthCalledWith(2, finishedEvent, '1');
          expect(mockSubCallback).not.toHaveBeenCalledWith(retryEvent, '1');

          // lastStatus ends up as FINISHED (terminal), so no INPUT_REQUIRED is sent.
          // This proves the retry event did not overwrite lastStatus to undefined.
          expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowStatus',
            DuoWorkflowStatus.INPUT_REQUIRED,
          );
        });

        it('does not send workflowError for a retry event and preserves in-progress lastStatus (regression)', async () => {
          const runningEvent: DuoWorkflowEvent = {
            checkpoint: JSON.stringify({ channel_values: { status: 'Running' } }),
            errors: [],
            workflowGoal: 'test-goal',
            workflowStatus: DuoWorkflowStatus.RUNNING,
          };

          mockWorkflowApi.runWorkflow.mockImplementation(() =>
            asyncGeneratorFromArray([runningEvent, retryEvent]),
          );

          await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });

          // The retry event must not be treated as an error
          expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
            'workflowError',
            expect.anything(),
          );

          // Only the real RUNNING event was forwarded
          expect(mockSubCallback).toHaveBeenCalledTimes(1);
          expect(mockSubCallback).toHaveBeenCalledWith(runningEvent, '1');

          // Last REAL status was RUNNING (in-progress), so iterator exhaustion sends
          // INPUT_REQUIRED. This proves the retry event did not corrupt lastStatus.
          expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
            'workflowStatus',
            DuoWorkflowStatus.INPUT_REQUIRED,
          );
        });
      });
    });

    describe('when runWorkflow throws an error', () => {
      beforeEach(() => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('1');
      });

      function mockThrow(error: unknown): void {
        mockWorkflowApi.runWorkflow.mockImplementation(async function* () {
          yield* [];
          throw error;
        });
      }

      async function startAndFlush() {
        await workflowController.startWorkflow({ goal: 'test-goal', type: 'test-type' });
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
      }

      it('handles error message from runWorkflow failure', async () => {
        mockThrow(new Error('Workflow run failed'));

        const results = await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(results).toEqual([
          { eventName: 'workflowStarted', data: '1' },
          { eventName: 'setContextCurrentItemsResult', data: [] },
        ]);

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'Workflow run failed',
          statusCode: undefined,
        });
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'workflowStatus',
          DuoWorkflowStatus.FAILED,
        );
      });

      it('passes the SandboxUnavailableError message through verbatim', async () => {
        const sandboxMessage =
          'Sandbox is enabled but sandbox provider is not available (missing_dependencies).';
        mockThrow(new SandboxUnavailableError(sandboxMessage, 'missing_dependencies'));

        await startAndFlush();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: sandboxMessage,
        });
      });

      it('uses status-code-derived message for thrown WorkflowExecutorError (regression: if/else if fall-through)', async () => {
        // Pre-fix, this branch was overwritten by the `error instanceof Error` branch
        // and incorrectly returned the literal error.message instead of the status-code message.
        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(true);
        mockThrow(
          new WorkflowExecutorError(
            'raw-message-should-not-be-used',
            WorkflowStatusCode.AUTH_TOKEN_ERROR,
          ),
        );

        await startAndFlush();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: generateErrorMessageFromStatusCode(WorkflowStatusCode.AUTH_TOKEN_ERROR),
        });
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith('workflowError', {
          message: 'raw-message-should-not-be-used',
        });
      });

      it('maps a thrown number to a status-code message', async () => {
        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockThrow(WorkflowStatusCode.SERVICE_CONNECTION_FAILED);

        await startAndFlush();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: generateErrorMessageFromStatusCode(WorkflowStatusCode.SERVICE_CONNECTION_FAILED),
        });
      });

      it('passes a thrown string through unchanged', async () => {
        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockThrow('raw string failure');

        await startAndFlush();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: 'raw string failure',
        });
      });

      it('falls back to generateErrorMessageFromStatusCode(null) for unknown shapes', async () => {
        jest.mocked(isWorkflowExecutorErrorEvent).mockReturnValue(false);
        mockThrow({ unexpected: 'shape' });

        await startAndFlush();

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('workflowError', {
          message: generateErrorMessageFromStatusCode(null),
        });
      });
    });
  });

  describe('startWorkflow - system context behavior', () => {
    const mockSystemContextItems: AIContextItem[] = [
      {
        id: 'system-rule-1',
        category: 'user_rule' as const,
        content: 'The user wants you to adhere to these rules:\nBe concise and helpful.',
        metadata: {
          title: 'User instruction',
          enabled: true,
          subType: 'user_rule' as const,
          icon: 'user',
          secondaryText: 'chat-rules.md',
          subTypeLabel: 'User instruction',
        },
      },
    ];

    const mockUserContextItems: AIContextItem[] = [
      {
        id: 'user-context-1',
        category: 'file' as const,
        content: 'Some file content',
        metadata: {
          title: 'Selected file',
          enabled: true,
          subType: 'local_file_search' as const,
          icon: 'file',
          secondaryText: 'example.js',
          subTypeLabel: 'File',
        },
      },
    ];

    beforeEach(() => {
      mockWorkflowApi.createWorkflow.mockResolvedValue('new-workflow-123');
      mockWorkflowApi.runWorkflow.mockReturnValue(asyncGeneratorFromArray([]));
      jest
        .mocked(chatContextManager.retrieveContextItemsWithContent)
        .mockResolvedValue(mockUserContextItems);
      jest.mocked(systemContextManager.getSystemContextItems).mockReset();
      jest
        .mocked(systemContextManager.getSystemContextItems)
        .mockResolvedValue(mockSystemContextItems);
    });

    describe('when starting a new workflow (no existingWorkflowId)', () => {
      it('includes both system context and user context', async () => {
        await workflowController.startWorkflow({
          goal: 'test-goal',
          type: 'test-type',
        });

        expect(systemContextManager.getSystemContextItems).toHaveBeenCalled();
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'test-goal',
            type: 'test-type',
            existingWorkflowId: 'new-workflow-123',
            additionalContext: [...mockSystemContextItems, ...mockUserContextItems],
            toolApproval: undefined,
          }),
        );
      });
    });

    describe('when adding to an existing workflow (existingWorkflowId provided)', () => {
      it('excludes system context and includes only user context', async () => {
        await workflowController.startWorkflow({
          goal: 'follow-up message',
          type: 'test-type',
          existingWorkflowId: 'existing-workflow-456',
        });

        expect(systemContextManager.getSystemContextItems).not.toHaveBeenCalled();
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'follow-up message',
            type: 'test-type',
            existingWorkflowId: 'existing-workflow-456',
            additionalContext: mockUserContextItems,
            toolApproval: undefined,
          }),
        );
      });
    });

    describe('when using a pre-created workflow (preCreatedWorkflowId provided)', () => {
      it('includes both system context and user context', async () => {
        await workflowController.startWorkflow({
          goal: 'first message',
          type: 'test-type',
          preCreatedWorkflowId: 'pre-created-789',
        });

        expect(systemContextManager.getSystemContextItems).toHaveBeenCalled();
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'first message',
            type: 'test-type',
            existingWorkflowId: 'pre-created-789',
            additionalContext: [...mockSystemContextItems, ...mockUserContextItems],
            toolApproval: undefined,
          }),
        );
      });
    });
  });

  describe('stopWorkflow', () => {
    it('calls the stopWorkflow function', async () => {
      const workflowId = 'mock-id';
      await workflowController.stopWorkflow({ workflowId });
      expect(mockWorkflowApi.stopWorkflow).toHaveBeenCalledWith(workflowId);
    });
  });

  describe('interruptRunningCommand', () => {
    it('calls the interruptRunningCommand function', async () => {
      const workflowId = 'mock-id';
      await workflowController.interruptRunningCommand({ workflowId });
      expect(mockWorkflowApi.interruptRunningCommand).toHaveBeenCalledWith(workflowId);
    });

    it('returns NO_REPLY', async () => {
      const result = await workflowController.interruptRunningCommand({ workflowId: 'mock-id' });
      expect(result).toBe(NO_REPLY);
    });
  });

  describe('trackEvent', () => {
    it('tracks telemetry event ', async () => {
      await workflowController.trackEvent({
        event: DuoAgentPlatformEvent.WorkflowStopped,
        context: {
          source: 'chat',
          reason: 'stop_button_click',
          workflowId: 'test-workflow-id',
        },
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.WorkflowStopped,
        { source: 'chat', reason: 'stop_button_click', workflowId: 'test-workflow-id' },
      );
    });

    it('returns NO_REPLY', async () => {
      const result = await workflowController.trackEvent({
        event: DuoAgentPlatformEvent.WorkflowStopped,
        context: {
          reason: 'stop_button_click',
          workflowId: 'test-workflow-id',
        },
      });
      expect(result).toBe(NO_REPLY);
    });
  });

  describe('startWorkflow - tool approval telemetry', () => {
    beforeEach(() => {
      mockDuoAgentPlatformTracker.trackEvent = jest.fn().mockResolvedValue(undefined);
      mockWorkflowApi.createWorkflow.mockResolvedValue('workflow-123');
    });

    it('tracks ToolApprovalSubmitted with scope "once" when tool is approved once', async () => {
      await workflowController.startWorkflow({
        goal: '',
        type: WorkflowType.CHAT,
        existingWorkflowId: 'wf-1',
        metadata: {},
        toolApproval: {
          userApproved: true,
          toolName: 'run_command',
          type: ToolApprovalType.APPROVE_ONCE,
        },
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        {
          source: 'chat',
          toolName: 'run_command',
          approvalScope: 'once',
          workflowId: 'wf-1',
        },
      );
    });

    it('tracks ToolApprovalSubmitted with scope "session" when tool is approved for session', async () => {
      await workflowController.startWorkflow({
        goal: '',
        type: WorkflowType.CHAT,
        existingWorkflowId: 'wf-2',
        metadata: {},
        toolApproval: {
          userApproved: true,
          toolName: 'read_file',
          type: ToolApprovalType.APPROVE_FOR_SESSION,
          toolArgs: { path: '/tmp' },
        },
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        {
          source: 'chat',
          toolName: 'read_file',
          approvalScope: 'session',
          workflowId: 'wf-2',
        },
      );
    });

    it('tracks ToolApprovalSubmitted with scope "pattern" when tool is approved with a pattern', async () => {
      await workflowController.startWorkflow({
        goal: '',
        type: WorkflowType.CHAT,
        existingWorkflowId: 'wf-3',
        metadata: {},
        toolApproval: {
          userApproved: true,
          toolName: 'run_command',
          type: ToolApprovalType.APPROVE_PATTERN_FOR_SESSION,
          pattern: 'echo *',
        },
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        {
          source: 'chat',
          toolName: 'run_command',
          approvalScope: 'pattern',
          workflowId: 'wf-3',
        },
      );
    });

    it('does not track ToolApprovalSubmitted when tool approval is not present', async () => {
      await workflowController.startWorkflow({
        goal: 'test',
        type: WorkflowType.CHAT,
        metadata: {},
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).not.toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        expect.anything(),
      );
    });

    it('does not track ToolApprovalSubmitted when tool is rejected', async () => {
      await workflowController.startWorkflow({
        goal: '',
        type: WorkflowType.CHAT,
        existingWorkflowId: 'wf-3',
        metadata: {},
        toolApproval: {
          userApproved: false,
          message: 'Tool call rejected by user',
        },
      });

      expect(mockDuoAgentPlatformTracker.trackEvent).not.toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        expect.anything(),
      );
    });
  });

  describe('preCreateWorkflow', () => {
    const draftGoal = 'Test draft goal';
    const type = 'chat';
    const aiCatalogItemVersionId = 'agent 4';
    const workflowDefinition = 'test_agent/v1';

    beforeEach(() => {
      mockWorkflowApi.preCreateWorkflow = jest.fn();
    });

    describe('when pre-creation is successful', () => {
      beforeEach(() => {
        mockWorkflowApi.preCreateWorkflow.mockResolvedValue('pre-created-workflow-123');
      });

      it('returns workflow ID', async () => {
        const result = await workflowController.preCreateWorkflow({
          draftGoal,
          type,
          aiCatalogItemVersionId,
          workflowDefinition,
          metadata: {},
        });

        expect(mockWorkflowApi.preCreateWorkflow).toHaveBeenCalledWith(
          draftGoal,
          type,
          workflowDefinition,
          aiCatalogItemVersionId,
          {},
        );
        expect(result).toEqual({
          eventName: 'workflowPreCreated',
          data: 'pre-created-workflow-123',
        });
      });
    });

    describe('when pre-creation fails', () => {
      beforeEach(() => {
        mockWorkflowApi.preCreateWorkflow.mockRejectedValue(new Error('Pre-creation failed'));
      });

      it('returns workflowPreCreationError event', async () => {
        const result = await workflowController.preCreateWorkflow({ draftGoal, type });

        expect(result).toEqual({ eventName: 'workflowPreCreationError', data: null });
      });
    });

    describe('sends system context items', () => {
      const mockSystemContextItems: AIContextItem[] = [
        {
          id: 'agent_user_environment_os_info',
          category: 'agent_user_environment',
          content: JSON.stringify({ platform: 'darwin', architecture: 'arm64' }),
          metadata: {
            title: 'OS Information',
            enabled: true,
            subType: 'os',
            icon: 'computer',
            secondaryText: '',
            subTypeLabel: 'System',
          },
        },
      ];

      beforeEach(() => {
        mockWorkflowApi.preCreateWorkflow.mockResolvedValue('pre-created-workflow-123');
      });

      it('retrieves and sends system context items', async () => {
        jest
          .mocked(systemContextManager.getSystemContextItems)
          .mockResolvedValue(mockSystemContextItems);

        await workflowController.preCreateWorkflow({
          draftGoal: 'test-goal',
          type: 'chat',
        });

        await new Promise(process.nextTick);

        expect(systemContextManager.precalculateOnWorkflowStart).toHaveBeenCalled();
        expect(systemContextManager.getSystemContextItems).toHaveBeenCalled();
        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'setSystemContextItems',
          mockSystemContextItems,
        );
      });

      it('handles errors during getSystemContextItems gracefully', async () => {
        jest
          .mocked(systemContextManager.getSystemContextItems)
          .mockRejectedValue(new Error('Failed to get items'));

        await workflowController.preCreateWorkflow({
          draftGoal: 'test-goal',
          type: 'chat',
        });

        await new Promise(process.nextTick);

        expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
          'setSystemContextItems',
          expect.anything(),
        );
      });
    });

    describe('pre-warms MCP servers', () => {
      beforeEach(() => {
        mockWorkflowApi.preCreateWorkflow.mockResolvedValue('pre-created-workflow-123');
      });

      describe('when metadata.rootFsPath is provided', () => {
        it('calls mcpManager.preWarm with the workspace path', async () => {
          await workflowController.preCreateWorkflow({
            draftGoal: 'test-goal',
            type: 'chat',
            metadata: { rootFsPath: '/workspace/my-project' },
          });

          expect(mockMcpManager.preWarm).toHaveBeenCalledWith('/workspace/my-project');
        });
      });

      describe('when metadata.rootFsPath is absent', () => {
        it('does not call mcpManager.preWarm', async () => {
          await workflowController.preCreateWorkflow({
            draftGoal: 'test-goal',
            type: 'chat',
            metadata: {},
          });

          expect(mockMcpManager.preWarm).not.toHaveBeenCalled();
        });
      });

      describe('when pre-creation fails', () => {
        beforeEach(() => {
          mockWorkflowApi.preCreateWorkflow.mockRejectedValue(new Error('Pre-creation failed'));
        });

        it('does not call mcpManager.preWarm', async () => {
          await workflowController.preCreateWorkflow({
            draftGoal: 'test-goal',
            type: 'chat',
            metadata: { rootFsPath: '/workspace/my-project' },
          });

          expect(mockMcpManager.preWarm).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('redactUserMessage', () => {
    describe('when redaction succeeds', () => {
      beforeEach(() => {
        jest.mocked(mockSecretRedactor.redactSecrets).mockReturnValue('redacted content');
      });

      it('returns ok result with redacted content', () => {
        const result = workflowController.redactUserMessage({ content: 'original content' });

        expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledWith(
          'original content',
          'user-input',
        );
        expect(result.isOk()).toBe(true);
        expect(result.value).toBe('redacted content');
      });
    });

    describe('when redaction fails', () => {
      beforeEach(() => {
        jest.mocked(mockSecretRedactor.redactSecrets).mockImplementation(() => {
          throw new Error('Redaction service unavailable');
        });
      });

      it('returns error result with user-friendly message', () => {
        const result = workflowController.redactUserMessage({ content: 'content with secrets' });

        expect(result.isErr()).toBe(true);
        expect(result.error).toBe(
          'An error occurred while performing secret redaction checks on your message. Your message was not sent.',
        );
      });
    });
  });

  describe('retrieveContextItemsWithContent request parameter', () => {
    beforeEach(() => {
      mockWorkflowApi.createWorkflow.mockResolvedValue('new-workflow-123');
      mockWorkflowApi.runWorkflow.mockReturnValue(asyncGeneratorFromArray([]));
      jest.mocked(chatContextManager.retrieveContextItemsWithContent).mockResolvedValue([]);
      jest.mocked(systemContextManager.getSystemContextItems).mockResolvedValue([]);
    });

    it('passes newConversation: true when no existingWorkflowId', async () => {
      await workflowController.startWorkflow({
        goal: 'test-goal',
        type: 'test-type',
      });

      expect(chatContextManager.retrieveContextItemsWithContent).toHaveBeenCalledWith({
        newConversation: true,
        mode: 'agentic',
      });
    });

    it('passes newConversation: false when existingWorkflowId is provided', async () => {
      await workflowController.startWorkflow({
        goal: 'follow-up message',
        type: 'test-type',
        existingWorkflowId: 'existing-456',
      });

      expect(chatContextManager.retrieveContextItemsWithContent).toHaveBeenCalledWith({
        newConversation: false,
        mode: 'agentic',
      });
    });
  });
});
