import { setActivePinia, createPinia } from 'pinia';
import { WorkflowType, DuoWorkflowStatus, WorkflowEvent } from '@gitlab-lsp/workflow-api';
import { DEFAULT_DOCKER_IMAGE, CHAT_MODE, FLOW_MODE, toolApprovalTypes } from '../constants.ts';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useWorkflowStore } from './workflow';
import { useMainStore } from './main';
import { useRequestErrorStore } from './request_error';
import { useAgentStore } from './agents';
import { useRepositoriesStore } from './repositories';

describe('Workflow Store', () => {
  let workflowStore;
  let mainStore;
  let requestErrorStore;
  let agentStore;
  let repositoriesStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    mainStore = useMainStore();
    workflowStore = useWorkflowStore();
    requestErrorStore = useRequestErrorStore();
    agentStore = useAgentStore();
    repositoriesStore = useRepositoriesStore();

    // Set up a mock project in repositories store
    repositoriesStore.repositories = [
      {
        type: 'single',
        rootFsPath: '/path/to/repo',
        folderName: 'repo',
        projects: [
          {
            id: 'gid://gitlab/Project/5',
            name: 'test-project',
            namespaceWithPath: 'namespace/test-project',
            remoteName: 'origin',
            duoAgenticChatAvailable: true,
            namespaceId: 'gid://gitlab/Namespace/2',
            rootNamespaceId: 'gid://gitlab/Namespace/1',
          },
        ],
      },
    ];
    repositoriesStore.selectedProjectPath = 'namespace/test-project';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getWorkflowById', () => {
    it('sets loading state and sends request to get workflow by ID', () => {
      const workflowId = '123';
      workflowStore.getWorkflowById(workflowId);
    });
  });

  describe('resetActiveWorkflow', () => {
    it('resets the active workflow to its initial state', () => {
      workflowStore.activeWorkflow = {
        id: '123',
        goal: 'Test Goal',
        status: 'ACTIVE',
        checkpoint: { test: 'checkpoint' },
      };
      workflowStore.resetActiveWorkflow();
      expect(workflowStore.activeWorkflow).toEqual({
        id: '',
        goal: '',
        status: '',
        checkpoint: {},
      });
    });
  });

  describe('cancelActiveWorkflow', () => {
    it('resets workflow status to INPUT_REQUIRED when in CHAT mode', () => {
      mainStore.mode = CHAT_MODE;
      workflowStore.activeWorkflow = {
        id: '123',
        goal: 'Test Goal',
        status: 'RUNNING',
        checkpoint: { test: 'checkpoint' },
      };
      workflowStore.cancelActiveWorkflow();
      expect(workflowStore.activeWorkflow.status).toBe(DuoWorkflowStatus.INPUT_REQUIRED);
      expect(workflowStore.activeWorkflow.goal).toBe('');
    });

    it('resets workflow status to STOPPED when in FLOW mode', () => {
      mainStore.mode = FLOW_MODE;
      workflowStore.activeWorkflow = {
        id: '123',
        goal: 'Test Goal',
        status: 'RUNNING',
        checkpoint: { test: 'checkpoint' },
      };
      workflowStore.cancelActiveWorkflow();
      expect(workflowStore.activeWorkflow.status).toBe(DuoWorkflowStatus.STOPPED);
      expect(workflowStore.activeWorkflow.goal).toBe('');
    });
  });

  describe('runWorkflow', () => {
    it('sends request to start the workflow with goal, image, metadata, type, and agent data', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.flowConfig = 'test-flow-config';
      agentStore.agentVersionId = 'agent-version-123';
      agentStore.workflowDefinition = 'test_agent/v1';
      workflowStore.activeWorkflow.goal = 'Test Goal';
      workflowStore.runWorkflow();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
        goal: 'Test Goal',
        image: DEFAULT_DOCKER_IMAGE,
        type: WorkflowType.CHAT,
        workflowDefinition: 'test_agent/v1',
        existingWorkflowId: null,
        preCreatedWorkflowId: null,
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        flowConfig: 'test-flow-config',
        aiCatalogItemVersionId: 'agent-version-123',
      });
    });

    it('sends request without agent data when no agent is selected', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.flowConfig = '';
      agentStore.agentVersionId = '';
      agentStore.workflowDefinition = 'test_agent/v1';
      workflowStore.activeWorkflow.goal = 'Test Goal';
      workflowStore.runWorkflow();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
        goal: 'Test Goal',
        image: DEFAULT_DOCKER_IMAGE,
        type: WorkflowType.CHAT,
        workflowDefinition: 'test_agent/v1',
        existingWorkflowId: null,
        preCreatedWorkflowId: null,
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        flowConfig: '',
        aiCatalogItemVersionId: '',
      });
    });
  });

  describe('setWorkflowId', () => {
    it('sets the ID of the active workflow', () => {
      const workflowId = '456';
      workflowStore.setWorkflowId(workflowId);
      expect(workflowStore.activeWorkflow.id).toBe(workflowId);
    });
  });

  describe('setWorkflowCheckpoint', () => {
    const newestCheckpoint = {
      channel_values: {
        ui_chat_log: [
          { message_type: 'user', content: 'Message 1' },
          { message_type: 'assistant', content: 'Response 1' },
          { message_type: 'user', content: 'Message 2' },
        ],
      },
    };

    it('sets the checkpoint of the active workflow', () => {
      workflowStore.setWorkflowCheckpoint({ checkpoint: newestCheckpoint });
      expect(workflowStore.activeWorkflow.checkpoint).toEqual(newestCheckpoint);
    });

    it('removes pending user messages when they appear in uiChatLog', async () => {
      const userMessage = 'Message 2';
      const timestamp = new Date();

      workflowStore.addMessageToChat({ content: userMessage, message_type: 'user', timestamp });
      workflowStore.addMessageToChat({
        content: 'assistant response',
        message_type: 'assistant',
        timestamp: new Date(),
      });
      workflowStore.setWorkflowCheckpoint({ checkpoint: newestCheckpoint });

      // The pending user message should be removed, but assistant message should remain
      expect(workflowStore.pendingMessages).toHaveLength(1);
      expect(workflowStore.pendingMessages[0].message_type).toBe('assistant');
      expect(workflowStore.pendingMessages[0].content).toBe('assistant response');
    });
  });

  describe('setWorkflowGoal', () => {
    it('sets the goal of the active workflow', () => {
      const goal = 'Test Goal';
      workflowStore.setWorkflowGoal(goal);
      expect(workflowStore.activeWorkflow.goal).toBe(goal);
    });
  });

  describe('setWorkflowLoading', () => {
    it('sets the loading state of the active workflow', () => {
      workflowStore.setWorkflowLoading(true);

      expect(workflowStore.isLoadingWorkflow).toBe(true);
    });
  });

  describe('setWorkflowStatus', () => {
    it('sets the status of the active workflow', () => {
      const status = 'ACTIVE';
      workflowStore.setWorkflowStatus(status);
      expect(workflowStore.activeWorkflow.status).toBe(status);
    });

    it('sets status of the active workflow to empty by default', () => {
      const status = undefined;
      workflowStore.setWorkflowStatus(status);
      expect(workflowStore.activeWorkflow.status).toBe('');
    });
  });

  describe('startWorkflow', () => {
    it('send the runWorkflow event', () => {
      workflowStore.activeWorkflow.goal = 'Test Goal';
      const runWorkflowSpy = jest.spyOn(workflowStore, 'runWorkflow');

      workflowStore.startWorkflow();
      expect(runWorkflowSpy).toHaveBeenCalledWith();
    });
  });

  describe('stopWorkflow', () => {
    it('sends request to cancel the workflow with workflowId', () => {
      const workflowId = '123';
      workflowStore.stopWorkflow(workflowId);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('stopWorkflow', {
        workflowId,
      });
    });
  });

  describe('interruptRunningCommand', () => {
    it('sends request to interrupt the running command with workflowId', () => {
      const workflowId = '123';
      workflowStore.interruptRunningCommand(workflowId);
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'interruptRunningCommand',
        { workflowId },
      );
    });
  });

  describe('onInitialState', () => {
    const mockInitialState = { goal: 'someValue' };

    beforeEach(() => {
      workflowStore.onInitialState(mockInitialState);
    });
    it('updates the store', () => {
      expect(workflowStore.initialState).toEqual(mockInitialState);
      expect(workflowStore.workflowGoal).toBe(mockInitialState.goal);
    });
  });

  describe('preCreateWorkflow', () => {
    const draftGoal = 'Test draft goal';

    describe('when no workflow exists', () => {
      it('creates a promise and sends request', () => {
        mainStore.mode = CHAT_MODE;
        workflowStore.preCreateWorkflow(draftGoal);

        expect(workflowStore.preCreateWorkflowPromise).toBeInstanceOf(Promise);
        expect(workflowStore.preCreateWorkflowResolve).toBeInstanceOf(Function);
        expect(workflowStore.preCreateWorkflowProjectPath).toBe('namespace/test-project');
        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('preCreateWorkflow', {
          draftGoal,
          type: WorkflowType.CHAT,
          workflowDefinition: 'chat',
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          aiCatalogItemVersionId: '',
        });
      });
    });

    describe('when a promise already exists', () => {
      beforeEach(() => {
        workflowStore.preCreateWorkflow(draftGoal);
      });

      it('does not create a new promise', () => {
        const firstPromise = workflowStore.preCreateWorkflowPromise;

        workflowStore.preCreateWorkflow('Another draft goal');

        expect(workflowStore.preCreateWorkflowPromise).toBe(firstPromise);
        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledTimes(1);
      });
    });

    describe('when an active workflow exists', () => {
      beforeEach(() => {
        workflowStore.activeWorkflow.id = 'existing-workflow-id';
      });

      it('does not pre-create', () => {
        workflowStore.preCreateWorkflow(draftGoal);

        expect(workflowStore.preCreateWorkflowPromise).toBeNull();
        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalled();
      });
    });
  });

  describe('setPreCreatedWorkflowId', () => {
    describe('when a pre-create promise exists', () => {
      let promise;

      beforeEach(() => {
        workflowStore.preCreateWorkflow('Test goal');
        promise = workflowStore.preCreateWorkflowPromise;
      });

      it('resolves the promise with the workflow ID', async () => {
        workflowStore.setPreCreatedWorkflowId('pre-created-id');

        const result = await promise;
        expect(result).toBe('pre-created-id');
      });
    });

    describe('when no resolve function exists', () => {
      it('does nothing', () => {
        workflowStore.setPreCreatedWorkflowId('some-id');
        // Should not throw
      });
    });
  });

  describe('setPreCreationWorkflowError', () => {
    describe('when a pre-create promise exists', () => {
      let promise;

      beforeEach(() => {
        workflowStore.preCreateWorkflow('Test goal');
        promise = workflowStore.preCreateWorkflowPromise;
        // Add a catch handler to prevent unhandled rejection
        promise.catch(() => {});
      });

      it('rejects the promise with an error', async () => {
        workflowStore.setPreCreationWorkflowError();

        await expect(promise).rejects.toThrow('Workflow pre-creation failed');
      });

      it('does not reset pre-create state', () => {
        workflowStore.setPreCreationWorkflowError();

        // State should remain to prevent re-triggering pre-creation
        expect(workflowStore.preCreateWorkflowPromise).not.toBeNull();
        expect(workflowStore.preCreateWorkflowReject).not.toBeNull();
        expect(workflowStore.preCreateWorkflowProjectPath).toBe('namespace/test-project');
      });
    });

    describe('when no reject function exists', () => {
      it('does nothing', () => {
        workflowStore.setPreCreationWorkflowError();
        // Should not throw
      });
    });
  });

  describe('resetPreCreateState', () => {
    it('clears promise, resolve function, reject function, and project path', () => {
      workflowStore.preCreateWorkflow('Test goal');
      expect(workflowStore.preCreateWorkflowPromise).not.toBeNull();
      expect(workflowStore.preCreateWorkflowResolve).not.toBeNull();
      expect(workflowStore.preCreateWorkflowReject).not.toBeNull();
      expect(workflowStore.preCreateWorkflowProjectPath).toBe('namespace/test-project');

      workflowStore.resetPreCreateState();

      expect(workflowStore.preCreateWorkflowPromise).toBeNull();
      expect(workflowStore.preCreateWorkflowResolve).toBeNull();
      expect(workflowStore.preCreateWorkflowReject).toBeNull();
      expect(workflowStore.preCreateWorkflowProjectPath).toBeNull();
    });
  });

  describe('runWorkflow with pre-creation', () => {
    beforeEach(() => {
      workflowStore.activeWorkflow.goal = 'Test Goal';
    });

    describe('when pre-created workflow ID is available', () => {
      beforeEach(() => {
        agentStore.flowConfig = 'pre-created-flow-config';
        agentStore.agentVersionId = 'pre-created-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.preCreateWorkflow('Draft goal');
        workflowStore.setPreCreatedWorkflowId('pre-created-123');
      });

      it('uses pre-created workflow ID with agent data', async () => {
        mainStore.mode = CHAT_MODE;
        await workflowStore.runWorkflow();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: 'Test Goal',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          existingWorkflowId: null,
          preCreatedWorkflowId: 'pre-created-123',
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          flowConfig: 'pre-created-flow-config',
          aiCatalogItemVersionId: 'pre-created-agent-version',
        });
      });

      it('resets pre-create state after running workflow', async () => {
        await workflowStore.runWorkflow();

        expect(workflowStore.preCreateWorkflowPromise).toBeNull();
        expect(workflowStore.preCreateWorkflowResolve).toBeNull();
        expect(workflowStore.preCreateWorkflowProjectPath).toBeNull();
      });
    });

    describe('when project changes after pre-creation', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'test-flow-config';
        agentStore.agentVersionId = 'test-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';

        // Pre-create workflow for original project
        workflowStore.preCreateWorkflow('Draft goal');
        workflowStore.setPreCreatedWorkflowId('pre-created-123');

        // Change project
        repositoriesStore.selectedProjectPath = 'namespace/different-project';
      });

      it('discards pre-created workflow and creates new one', async () => {
        await workflowStore.runWorkflow();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: 'Test Goal',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          existingWorkflowId: null,
          preCreatedWorkflowId: null, // Should be null since project changed
          metadata: expect.objectContaining({
            projectPath: 'namespace/different-project',
          }),
          flowConfig: 'test-flow-config',
          aiCatalogItemVersionId: 'test-agent-version',
        });
      });

      it('resets pre-create state when project changed', async () => {
        await workflowStore.runWorkflow();

        expect(workflowStore.preCreateWorkflowPromise).toBeNull();
        expect(workflowStore.preCreateWorkflowResolve).toBeNull();
        expect(workflowStore.preCreateWorkflowProjectPath).toBeNull();
      });
    });

    describe('when pre-creation fails', () => {
      const expectedStartWorkflowData = {
        goal: 'Test Goal',
        image: DEFAULT_DOCKER_IMAGE,
        type: WorkflowType.CHAT,
        workflowDefinition: 'test_agent/v1',
        existingWorkflowId: null,
        preCreatedWorkflowId: null,
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        flowConfig: 'failed-flow-config',
        aiCatalogItemVersionId: 'failed-agent-version',
      };

      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'failed-flow-config';
        agentStore.agentVersionId = 'failed-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.preCreateWorkflowProjectPath = 'namespace/different-test-project';
        repositoriesStore.selectedProjectPath = 'namespace/test-project';
        workflowStore.preCreateWorkflow('Draft goal');
      });

      it('handles failure gracefully and includes agent data when promise immediately rejects', async () => {
        // Reject the promise immediately
        workflowStore.preCreateWorkflowPromise = Promise.reject(new Error('Pre-creation failed'));

        // Resolve the promise - this allows the test to fail if the previous line is not present
        // Otherwise success and the failure fall-through would look identical
        // This way, a bug in the runWorkflow `catch` block might be caught by this test
        workflowStore.setPreCreatedWorkflowId('1');

        await workflowStore.runWorkflow();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expectedStartWorkflowData,
        );
      });

      it('handles failure gracefully and includes agent data when promise is rejected via external event', async () => {
        const promise = workflowStore.preCreateWorkflowPromise;
        const workflowPromise = workflowStore.runWorkflow();

        workflowStore.setPreCreationWorkflowError();

        await workflowPromise;

        await expect(promise).rejects.toThrow('Workflow pre-creation failed');

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expectedStartWorkflowData,
        );
      });
    });

    describe('when resuming existing workflow', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'existing-flow-config';
        agentStore.agentVersionId = 'existing-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.preCreateWorkflow('Draft goal');
        mockMessageBusBridge.sendNotification.mockClear();
      });

      it('does not wait for pre-creation and includes agent data', async () => {
        await workflowStore.runWorkflow({ isExistingWorkflow: true });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: 'Test Goal',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          existingWorkflowId: '',
          preCreatedWorkflowId: null,
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          flowConfig: 'existing-flow-config',
          aiCatalogItemVersionId: 'existing-agent-version',
        });
      });
    });
  });

  describe('resetActiveWorkflow', () => {
    it('resets pre-create state along with active workflow', () => {
      workflowStore.preCreateWorkflow('Test goal');
      workflowStore.activeWorkflow = { id: '123', goal: 'Test', status: 'RUNNING', checkpoint: {} };

      workflowStore.resetActiveWorkflow();

      expect(workflowStore.activeWorkflow).toEqual({
        id: '',
        goal: '',
        status: '',
        checkpoint: {},
      });
      expect(workflowStore.preCreateWorkflowPromise).toBeNull();
      expect(workflowStore.preCreateWorkflowResolve).toBeNull();
    });
  });

  describe('redactMessage', () => {
    const message = 'test message with potential secrets';

    describe('when redaction succeeds', () => {
      beforeEach(() => {
        mockMessageBusBridge.sendRequest.mockResolvedValue({ value: 'redacted message' });
      });

      it('returns success result with redacted content', async () => {
        const result = await workflowStore.redactMessage(message);

        expect(mockMessageBusBridge.sendRequest).toHaveBeenCalledWith('redactUserMessage', {
          content: message,
        });
        expect(result).toEqual({ value: 'redacted message' });
      });
    });

    describe('when redaction fails', () => {
      const errorMessage = 'Redaction service unavailable';

      beforeEach(() => {
        mockMessageBusBridge.sendRequest.mockResolvedValue({ error: errorMessage });
      });

      it('returns error result and sets request error', async () => {
        const setRequestErrorSpy = jest.spyOn(requestErrorStore, 'setRequestError');

        const result = await workflowStore.redactMessage(message);

        expect(result).toEqual({ error: errorMessage });
        expect(setRequestErrorSpy).toHaveBeenCalledWith(errorMessage);
      });
    });
  });

  describe('sendToolApprovalWorkflow', () => {
    beforeEach(() => {
      mainStore.mode = CHAT_MODE;
      agentStore.flowConfig = 'test-flow-config';
      agentStore.agentVersionId = 'test-agent-version';
      agentStore.workflowDefinition = 'test_agent/v1';
      workflowStore.activeWorkflow.id = 'workflow-123';
    });

    describe('when approving a tool', () => {
      it('sends approval payload with userApproved true', () => {
        workflowStore.sendToolApprovalWorkflow({ isApproved: true });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            toolApproval: {
              userApproved: true,
              toolName: '',
              type: 'approve-tool-once',
            },
          }),
        );
      });

      describe('and custom type is provided', () => {
        it('uses the custom type', () => {
          workflowStore.sendToolApprovalWorkflow({ isApproved: true, type: 'custom-type' });

          expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
            'startWorkflow',
            expect.objectContaining({
              toolApproval: expect.objectContaining({
                type: 'custom-type',
              }),
            }),
          );
        });
      });

      describe('and tool info is available in uiChatLog', () => {
        beforeEach(() => {
          workflowStore.activeWorkflow.checkpoint = {
            channel_values: {
              ui_chat_log: [
                {
                  message_type: 'tool',
                  tool_info: { name: 'test-tool' },
                },
              ],
            },
          };
        });

        it('includes the tool name', () => {
          workflowStore.sendToolApprovalWorkflow({ isApproved: true });

          expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
            'startWorkflow',
            expect.objectContaining({
              toolApproval: expect.objectContaining({
                toolName: 'test-tool',
              }),
            }),
          );
        });
      });
    });

    describe('when approving with a pattern', () => {
      it('sends pattern payload without toolArgs', () => {
        workflowStore.sendToolApprovalWorkflow({
          isApproved: true,
          type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
          pattern: 'git checkout *',
        });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            toolApproval: {
              userApproved: true,
              toolName: '',
              pattern: 'git checkout *',
              type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
            },
          }),
        );
      });

      it('includes toolArgs in non-pattern approvals', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              {
                message_type: 'tool',
                tool_info: { name: 'run_command', args: { command: 'ls -la' } },
              },
            ],
          },
        };

        workflowStore.sendToolApprovalWorkflow({
          isApproved: true,
          type: toolApprovalTypes.APPROVE_FOR_SESSION,
        });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            toolApproval: expect.objectContaining({
              toolArgs: { command: 'ls -la' },
            }),
          }),
        );
      });
    });

    describe('when rejecting a tool', () => {
      it('sends rejection payload with userApproved false', () => {
        workflowStore.sendToolApprovalWorkflow({ isApproved: false });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            toolApproval: {
              userApproved: false,
              message: 'Tool call rejected by user',
            },
          }),
        );
      });

      describe('and custom message is provided', () => {
        it('uses the custom message', () => {
          workflowStore.sendToolApprovalWorkflow({
            isApproved: false,
            message: 'Custom rejection',
          });

          expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
            'startWorkflow',
            expect.objectContaining({
              toolApproval: expect.objectContaining({
                message: 'Custom rejection',
              }),
            }),
          );
        });
      });
    });

    describe('common workflow parameters', () => {
      it('includes workflow metadata and configuration', () => {
        workflowStore.sendToolApprovalWorkflow({ isApproved: true });

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: '',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          existingWorkflowId: 'workflow-123',
          toolApproval: expect.any(Object),
          flowConfig: 'test-flow-config',
          aiCatalogItemVersionId: 'test-agent-version',
        });
      });
    });
  });

  describe('approveToolCall', () => {
    it('sends workflow start request with approval and agent data', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.flowConfig = 'approval-flow-config';
      agentStore.agentVersionId = 'approval-agent-version';
      agentStore.workflowDefinition = 'test_agent/v1';
      workflowStore.activeWorkflow.id = 'workflow-123';

      workflowStore.approveToolCall();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
        goal: '',
        image: DEFAULT_DOCKER_IMAGE,
        type: WorkflowType.CHAT,
        workflowDefinition: 'test_agent/v1',
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        existingWorkflowId: 'workflow-123',
        toolApproval: {
          toolName: '',
          type: 'approve-tool-once',
          userApproved: true,
        },
        flowConfig: 'approval-flow-config',
        aiCatalogItemVersionId: 'approval-agent-version',
      });
    });

    it('passes type and pattern for pattern approvals', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.flowConfig = 'approval-flow-config';
      agentStore.agentVersionId = 'approval-agent-version';
      agentStore.workflowDefinition = 'test_agent/v1';
      workflowStore.activeWorkflow.id = 'workflow-123';

      workflowStore.approveToolCall(
        toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
        'git checkout *',
      );

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          toolApproval: {
            userApproved: true,
            toolName: '',
            pattern: 'git checkout *',
            type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
          },
        }),
      );
    });
  });

  describe('rejectToolCall', () => {
    describe('when in chat mode', () => {
      it('does not send workflow event', () => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'rejection-flow-config';
        agentStore.agentVersionId = 'rejection-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-456';

        workflowStore.rejectToolCall('Custom rejection message');

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledTimes(1);
        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalledWith(
          'sendWorkflowEvent',
          expect.anything(),
        );
      });

      it('sends workflow start request with rejection and agent data', () => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'rejection-flow-config';
        agentStore.agentVersionId = 'rejection-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-456';

        workflowStore.rejectToolCall('Custom rejection message');

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: '',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          existingWorkflowId: 'workflow-456',
          toolApproval: {
            userApproved: false,
            message: 'Custom rejection message',
          },
          flowConfig: 'rejection-flow-config',
          aiCatalogItemVersionId: 'rejection-agent-version',
        });
      });

      it('uses default rejection message when none provided', () => {
        mainStore.mode = CHAT_MODE;
        agentStore.flowConfig = 'default-rejection-flow-config';
        agentStore.agentVersionId = 'default-rejection-agent-version';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-789';

        workflowStore.rejectToolCall();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: '',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.CHAT,
          workflowDefinition: 'test_agent/v1',
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          existingWorkflowId: 'workflow-789',
          toolApproval: {
            userApproved: false,
            message: 'Tool call rejected by user',
          },
          flowConfig: 'default-rejection-flow-config',
          aiCatalogItemVersionId: 'default-rejection-agent-version',
        });
      });
    });

    describe('when in flow mode', () => {
      it('sends workflow event with correct payload', () => {
        mainStore.mode = FLOW_MODE;
        agentStore.flowConfig = 'rejection-flow-config';
        agentStore.agentVersionId = '';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-456';

        workflowStore.rejectToolCall('Custom rejection message');

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('sendWorkflowEvent', {
          eventType: WorkflowEvent.MESSAGE,
          workflowId: 'workflow-456',
          message: {
            message: 'Custom rejection message',
            type: 'user',
          },
        });
      });

      it('sends workflow start request with rejection and agent data', () => {
        mainStore.mode = FLOW_MODE;
        agentStore.flowConfig = 'rejection-flow-config';
        agentStore.agentVersionId = '';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-456';

        workflowStore.rejectToolCall('Custom rejection message');

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('startWorkflow', {
          goal: '',
          image: DEFAULT_DOCKER_IMAGE,
          type: WorkflowType.SOFTWARE_DEVELOPMENT,
          workflowDefinition: WorkflowType.SOFTWARE_DEVELOPMENT,
          metadata: {
            projectId: '5',
            projectPath: 'namespace/test-project',
            namespaceId: '2',
            rootNamespaceId: '1',
            rootFsPath: '/path/to/repo',
            selectedModelIdentifier: null,
          },
          existingWorkflowId: 'workflow-456',
          toolApproval: {
            userApproved: false,
            message: 'Custom rejection message',
          },
          flowConfig: 'rejection-flow-config',
          aiCatalogItemVersionId: '',
        });
      });

      it('uses default rejection message when none provided', () => {
        mainStore.mode = FLOW_MODE;
        agentStore.flowConfig = 'default-rejection-flow-config';
        agentStore.agentVersionId = '';
        agentStore.workflowDefinition = 'test_agent/v1';
        workflowStore.activeWorkflow.id = 'workflow-789';

        workflowStore.rejectToolCall();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('sendWorkflowEvent', {
          eventType: WorkflowEvent.MESSAGE,
          workflowId: 'workflow-789',
          message: {
            message: 'Tool call rejected by user',
            type: 'user',
          },
        });
      });
    });
  });

  describe('preCreateWorkflow with agent data', () => {
    const draftGoal = 'Test draft goal';

    it('includes agent version ID in pre-creation request', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.agentVersionId = 'pre-create-agent-version';
      agentStore.workflowDefinition = 'test_agent/v1';

      workflowStore.preCreateWorkflow(draftGoal);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('preCreateWorkflow', {
        draftGoal,
        type: WorkflowType.CHAT,
        workflowDefinition: 'test_agent/v1',
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        aiCatalogItemVersionId: 'pre-create-agent-version',
      });
    });

    it('includes empty agent version ID when none selected', () => {
      mainStore.mode = CHAT_MODE;
      agentStore.agentVersionId = '';

      workflowStore.preCreateWorkflow(draftGoal);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('preCreateWorkflow', {
        draftGoal,
        type: WorkflowType.CHAT,
        workflowDefinition: 'chat',
        metadata: {
          projectId: '5',
          projectPath: 'namespace/test-project',
          namespaceId: '2',
          rootNamespaceId: '1',
          rootFsPath: '/path/to/repo',
          selectedModelIdentifier: null,
        },
        aiCatalogItemVersionId: '',
      });
    });
  });

  describe('workflowType getter', () => {
    describe('when mainStore mode is CHAT_MODE', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
      });

      it('returns WorkflowType.CHAT', () => {
        expect(workflowStore.workflowType).toBe(WorkflowType.CHAT);
      });
    });

    describe('when mainStore mode is FLOW_MODE', () => {
      beforeEach(() => {
        mainStore.mode = FLOW_MODE;
      });

      it('returns WorkflowType.SOFTWARE_DEVELOPMENT', () => {
        expect(workflowStore.workflowType).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
      });
    });
  });

  describe('isChatFlow getter', () => {
    describe('when workflowType is CHAT', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
      });

      it('returns true', () => {
        expect(workflowStore.isChatFlow).toBe(true);
      });
    });

    describe('when workflowType is not CHAT', () => {
      beforeEach(() => {
        mainStore.mode = FLOW_MODE;
      });

      it('returns false', () => {
        expect(workflowStore.isChatFlow).toBe(false);
      });
    });
  });

  describe('flowDefinition getter', () => {
    describe('when workflowType is SOFTWARE_DEVELOPMENT', () => {
      beforeEach(() => {
        mainStore.mode = FLOW_MODE;
      });

      it('returns WorkflowType.SOFTWARE_DEVELOPMENT', () => {
        expect(workflowStore.flowDefinition).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
      });
    });

    describe('when workflowType is CHAT', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
        agentStore.workflowDefinition = 'custom_agent/v1';
      });

      it('returns agentStore.workflowDefinition', () => {
        expect(workflowStore.flowDefinition).toBe('custom_agent/v1');
      });
    });

    describe('when workflowType is CHAT and no agent is selected', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
        agentStore.workflowDefinition = 'chat';
      });

      it('returns default chat workflow definition', () => {
        expect(workflowStore.flowDefinition).toBe('chat');
      });
    });
  });

  describe('sendWorkflowEvent', () => {
    beforeEach(() => {
      workflowStore.activeWorkflow.id = 'workflow-123';
    });

    it('sends workflow event notification with event type and workflow ID', () => {
      workflowStore.sendWorkflowEvent(WorkflowEvent.RESUME);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('sendWorkflowEvent', {
        eventType: WorkflowEvent.RESUME,
        workflowId: 'workflow-123',
        message: undefined,
      });
    });

    describe('when message is provided', () => {
      it('includes message in notification', () => {
        const message = { content: 'test message' };

        workflowStore.sendWorkflowEvent(WorkflowEvent.MESSAGE, message);

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('sendWorkflowEvent', {
          eventType: WorkflowEvent.MESSAGE,
          workflowId: 'workflow-123',
          message,
        });
      });
    });
  });

  describe('steps getter', () => {
    describe('when plan steps are available in checkpoint', () => {
      beforeEach(() => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            plan: {
              steps: [
                { id: '1', description: 'Step 1', status: 'Completed' },
                { id: '2', description: 'Step 2', status: 'Running' },
              ],
            },
          },
        };
      });

      it('returns the steps array', () => {
        expect(workflowStore.steps).toEqual([
          { id: '1', description: 'Step 1', status: 'Completed' },
          { id: '2', description: 'Step 2', status: 'Running' },
        ]);
      });
    });

    describe('when no plan steps are available', () => {
      beforeEach(() => {
        workflowStore.activeWorkflow.checkpoint = null;
      });

      it('returns empty array', () => {
        expect(workflowStore.steps).toEqual([]);
      });
    });

    describe('when checkpoint exists but has no plan', () => {
      beforeEach(() => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {},
        };
      });

      it('returns empty array', () => {
        expect(workflowStore.steps).toEqual([]);
      });
    });
  });

  describe('resumeWorkflow', () => {
    describe('when in flow mode', () => {
      beforeEach(() => {
        mainStore.mode = FLOW_MODE;
      });

      it('sends workflow event and then starts workflow', async () => {
        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalled();
        await workflowStore.resumeWorkflow();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledTimes(2);

        expect(mockMessageBusBridge.sendNotification.mock.calls.at(0)).toMatchObject([
          'sendWorkflowEvent',
          expect.objectContaining({
            eventType: WorkflowEvent.RESUME,
          }),
        ]);

        expect(mockMessageBusBridge.sendNotification.mock.calls.at(1)).toMatchObject([
          'startWorkflow',
          expect.objectContaining({
            type: WorkflowType.SOFTWARE_DEVELOPMENT,
          }),
        ]);
      });
    });

    describe('when in chat mode', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
      });

      it('only calls start workflow', async () => {
        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalled();
        await workflowStore.resumeWorkflow();

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledTimes(1);

        expect(mockMessageBusBridge.sendNotification.mock.calls.at(0)).toMatchObject([
          'startWorkflow',
          expect.objectContaining({
            type: WorkflowType.CHAT,
          }),
        ]);
      });
    });
  });

  describe('rejectPlan', () => {
    const feedbackMessage = 'Please add error handling to step 2';

    beforeEach(() => {
      mainStore.mode = FLOW_MODE;
      workflowStore.activeWorkflow.id = 'workflow-123';
      agentStore.flowConfig = 'test-flow-config';
      agentStore.agentVersionId = 'agent-version-123';
    });

    it('sends MESSAGE event with user feedback', () => {
      workflowStore.rejectPlan(feedbackMessage);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('sendWorkflowEvent', {
        eventType: WorkflowEvent.MESSAGE,
        workflowId: 'workflow-123',
        message: {
          message: feedbackMessage,
          type: 'user',
        },
      });
    });

    it('calls runWorkflow with existingWorkflowId', async () => {
      await workflowStore.rejectPlan(feedbackMessage);

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          goal: '',
          existingWorkflowId: 'workflow-123',
        }),
      );
    });

    it('sends workflow event before running workflow', async () => {
      await workflowStore.rejectPlan(feedbackMessage);

      const { calls } = mockMessageBusBridge.sendNotification.mock;

      expect(calls[0][0]).toBe('sendWorkflowEvent');
      expect(calls[1][0]).toBe('startWorkflow');
    });

    describe('when flow registry FF is enabled', () => {
      beforeEach(() => {
        mainStore.softwareDevelopmentFlowRegistryEnabled = true;
      });

      it('sends Approval.Rejected via sendToolApprovalWorkflow instead of MESSAGE event', async () => {
        await workflowStore.rejectPlan(feedbackMessage);

        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalledWith(
          'sendWorkflowEvent',
          expect.anything(),
        );
        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            toolApproval: { userApproved: false, message: feedbackMessage },
            flowConfigId: 'software_development',
            flowConfigSchemaVersion: 'v1',
            flowVersion: '1.0.0',
          }),
        );
      });
    });
  });

  describe('resumeWorkflow (flow registry)', () => {
    beforeEach(() => {
      mainStore.mode = FLOW_MODE;
      mainStore.softwareDevelopmentFlowRegistryEnabled = true;
      workflowStore.activeWorkflow.id = 'workflow-123';
      agentStore.flowConfig = 'test-flow-config';
      agentStore.agentVersionId = 'agent-version-123';
    });

    it('sends Approval.Approved via sendToolApprovalWorkflow without RESUME event', async () => {
      await workflowStore.resumeWorkflow();

      expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalledWith(
        'sendWorkflowEvent',
        expect.anything(),
      );
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          toolApproval: expect.objectContaining({ userApproved: true }),
          flowConfigId: 'software_development',
          flowConfigSchemaVersion: 'v1',
          flowVersion: '1.0.0',
        }),
      );
    });
  });

  describe('onConnectionLost', () => {
    beforeEach(() => {
      workflowStore.isLoadingWorkflow = true;
      workflowStore.activeWorkflow.status = DuoWorkflowStatus.RUNNING;
    });

    it('sets workflow loading to false', () => {
      workflowStore.onConnectionLost();

      expect(workflowStore.isLoadingWorkflow).toBe(false);
    });

    it('sets workflow status to INPUT_REQUIRED', () => {
      workflowStore.onConnectionLost();

      expect(workflowStore.activeWorkflow.status).toBe(DuoWorkflowStatus.INPUT_REQUIRED);
    });

    it('sets a request error with the connection lost message', () => {
      const setRequestErrorSpy = jest.spyOn(requestErrorStore, 'setRequestError');

      workflowStore.onConnectionLost();

      expect(setRequestErrorSpy).toHaveBeenCalledWith({
        message: 'Connection lost. The workflow was interrupted.',
      });
    });
  });

  describe('system context items', () => {
    const mockSystemContextItems = [
      {
        id: 'agent_user_environment_os_info',
        category: 'agent_user_environment',
        content: JSON.stringify({ platform: 'darwin', architecture: 'arm64' }),
      },
      {
        id: 'agent_user_environment_shell_info',
        category: 'agent_user_environment',
        content: JSON.stringify({ shell_name: 'zsh', shell_type: 'unix' }),
      },
    ];

    describe('setSystemContextItems', () => {
      it('sets system context items in state', () => {
        workflowStore.setSystemContextItems(mockSystemContextItems);

        expect(workflowStore.systemContextItems).toEqual(mockSystemContextItems);
      });

      it('sets empty array when items is null', () => {
        workflowStore.setSystemContextItems(null);

        expect(workflowStore.systemContextItems).toEqual([]);
      });

      it('sets empty array when items is undefined', () => {
        workflowStore.setSystemContextItems(undefined);

        expect(workflowStore.systemContextItems).toEqual([]);
      });
    });

    describe('clearSystemContextItems', () => {
      it('clears system context items from state', () => {
        workflowStore.setSystemContextItems(mockSystemContextItems);
        expect(workflowStore.systemContextItems).toEqual(mockSystemContextItems);

        workflowStore.clearSystemContextItems();

        expect(workflowStore.systemContextItems).toEqual([]);
      });
    });
  });

  describe('chatMessages getter', () => {
    const createMessage = (content, type = 'user', timestamp = new Date()) => ({
      content,
      message_type: type,
      role: type,
      timestamp,
    });

    beforeEach(() => {
      // Reset cache between tests
      workflowStore.$state.chatMessagesCache = null;
    });

    it('returns empty array when no messages exist', () => {
      expect(workflowStore.chatMessages).toEqual([]);
    });

    it('filters out agent messages with component_name planner', () => {
      workflowStore.activeWorkflow.checkpoint = {
        channel_values: {
          ui_chat_log: [
            createMessage('Plan summary', 'agent', new Date('2023-01-01T00:00:00Z')),
            {
              content: 'Plan summary',
              message_type: 'agent',
              role: 'agent',
              timestamp: new Date('2023-01-01T00:00:01Z'),
              component_name: 'planner',
            },
            {
              content: 'Approve the plan',
              message_type: 'request',
              message_sub_type: 'approval',
              role: 'request',
              timestamp: new Date('2023-01-01T00:00:02Z'),
              component_name: 'plan_approval',
            },
          ],
        },
      };
      const result = workflowStore.chatMessages;
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.component_name !== 'planner')).toBe(true);
    });

    it('filters out user messages with component_name plan_approval', () => {
      workflowStore.activeWorkflow.checkpoint = {
        channel_values: {
          ui_chat_log: [
            {
              content: 'Approve the plan',
              message_type: 'request',
              message_sub_type: 'approval',
              role: 'request',
              timestamp: new Date('2023-01-01T00:00:00Z'),
              component_name: 'plan_approval',
            },
            // executor echo — kept
            {
              content: 'no need to document it',
              message_type: 'user',
              role: 'user',
              timestamp: new Date('2023-01-01T00:00:01.000Z'),
              message_id: 'user-fe9737a6',
              status: 'success',
              component_name: null,
            },
            // plan_approval duplicate — filtered out
            {
              content: 'no need to document it',
              message_type: 'user',
              role: 'user',
              timestamp: new Date('2023-01-01T00:00:01.020Z'),
              message_id: 'user-55b9eeee',
              status: null,
              component_name: 'plan_approval',
            },
          ],
        },
      };

      const result = workflowStore.chatMessages;

      expect(result).toHaveLength(2);
      expect(result.find((m) => m.message_id === 'user-fe9737a6')).toBeDefined();
      expect(result.find((m) => m.message_id === 'user-55b9eeee')).toBeUndefined();
    });

    it('combines uiChatLog and pendingMessages', () => {
      workflowStore.activeWorkflow.checkpoint = {
        channel_values: {
          ui_chat_log: [createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z'))],
        },
      };
      workflowStore.pendingMessages = [
        createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
      ];

      const result = workflowStore.chatMessages;

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Message 1');
      expect(result[1].content).toBe('Message 2');
    });

    it('sorts messages by timestamp', () => {
      workflowStore.activeWorkflow.checkpoint = {
        channel_values: {
          ui_chat_log: [createMessage('Message 2', 'user', new Date('2023-01-01T00:00:02Z'))],
        },
      };
      workflowStore.pendingMessages = [
        createMessage('Message 1', 'assistant', new Date('2023-01-01T00:00:01Z')),
        createMessage('Message 3', 'user', new Date('2023-01-01T00:00:03Z')),
      ];

      const result = workflowStore.chatMessages;

      expect(result[0].content).toBe('Message 1');
      expect(result[1].content).toBe('Message 2');
      expect(result[2].content).toBe('Message 3');
    });

    describe('caching behavior', () => {
      it('returns cached array when messages have not changed', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [createMessage('Message 1', 'user')],
          },
        };

        const firstCall = workflowStore.chatMessages;
        const secondCall = workflowStore.chatMessages;

        // Should return the exact same array reference
        expect(firstCall).toBe(secondCall);
      });

      it('returns new array when messages change', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [createMessage('Message 1', 'user')],
          },
        };

        const firstCall = workflowStore.chatMessages;

        // Change the messages
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [createMessage('Message 1 updated', 'user')],
          },
        };

        const secondCall = workflowStore.chatMessages;

        // Should return a different array reference
        expect(firstCall).not.toBe(secondCall);
      });
    });

    describe('streaming optimization', () => {
      it('only updates last message when streaming (last message content changes)', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
              createMessage('Chunk 1', 'assistant', new Date('2023-01-01T00:00:02Z')),
            ],
          },
        };

        const firstCall = workflowStore.chatMessages;
        const firstMessage1 = firstCall[0];
        const firstMessage2 = firstCall[1];

        // Update only the last message (streaming)
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
              createMessage('Chunk 1 Chunk 2', 'assistant', new Date('2023-01-01T00:00:02Z')),
            ],
          },
        };

        const secondCall = workflowStore.chatMessages;

        // First two messages should have the same object reference
        expect(secondCall[0]).toBe(firstMessage1);
        expect(secondCall[1]).toBe(firstMessage2);
        // Last message should be a new object
        expect(secondCall[2]).not.toBe(firstCall[2]);
        expect(secondCall[2].content).toBe('Chunk 1 Chunk 2');
      });
    });

    describe('append optimization', () => {
      it('preserves existing message references when appending new message', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
            ],
          },
        };

        const firstCall = workflowStore.chatMessages;
        const firstMessage1 = firstCall[0];
        const firstMessage2 = firstCall[1];

        // Append a new message
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
              createMessage('Message 3', 'user', new Date('2023-01-01T00:00:02Z')),
            ],
          },
        };

        const secondCall = workflowStore.chatMessages;

        // Existing messages should have the same object references
        expect(secondCall[0]).toBe(firstMessage1);
        expect(secondCall[1]).toBe(firstMessage2);
        // New message should be added
        expect(secondCall[2].content).toBe('Message 3');
        expect(secondCall).toHaveLength(3);
      });
    });

    describe('message removal', () => {
      it('rebuilds array when messages are removed', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
              createMessage('Message 3', 'user', new Date('2023-01-01T00:00:02Z')),
            ],
          },
        };

        const firstCall = workflowStore.chatMessages;
        expect(firstCall).toHaveLength(3);

        // Remove last message
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
            ],
          },
        };

        const secondCall = workflowStore.chatMessages;

        expect(secondCall).toHaveLength(2);
        expect(secondCall[0].content).toBe('Message 1');
        expect(secondCall[1].content).toBe('Message 2');
      });
    });

    describe('full rebuild', () => {
      it('rebuilds entire array when multiple messages change', () => {
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Message 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Message 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
            ],
          },
        };

        const firstCall = workflowStore.chatMessages;

        // Change both messages
        workflowStore.activeWorkflow.checkpoint = {
          channel_values: {
            ui_chat_log: [
              createMessage('Updated 1', 'user', new Date('2023-01-01T00:00:00Z')),
              createMessage('Updated 2', 'assistant', new Date('2023-01-01T00:00:01Z')),
            ],
          },
        };

        const secondCall = workflowStore.chatMessages;

        expect(secondCall).toHaveLength(2);
        expect(secondCall[0].content).toBe('Updated 1');
        expect(secondCall[1].content).toBe('Updated 2');
        // Should be different references since it's a full rebuild
        expect(secondCall).not.toBe(firstCall);
      });
    });
  });

  describe('isApprovingPlan', () => {
    const setCheckpointWithLog = (uiChatLog) => {
      workflowStore.setWorkflowCheckpoint({
        checkpoint: { channel_values: { ui_chat_log: uiChatLog } },
      });
    };

    it('returns true for legacy PLAN_APPROVAL_REQUIRED status regardless of FF', () => {
      mainStore.softwareDevelopmentFlowRegistryEnabled = false;
      workflowStore.setWorkflowStatus(DuoWorkflowStatus.PLAN_APPROVAL);
      expect(workflowStore.isApprovingPlan).toBe(true);
    });

    describe('when FF is disabled', () => {
      beforeEach(() => {
        mainStore.softwareDevelopmentFlowRegistryEnabled = false;
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
      });

      it('returns false even when last message is a plan approval request', () => {
        setCheckpointWithLog([
          { message_type: 'request', message_sub_type: 'approval', content: 'Approve?' },
        ]);
        expect(workflowStore.isApprovingPlan).toBe(false);
      });
    });

    describe('when FF is enabled', () => {
      beforeEach(() => {
        mainStore.softwareDevelopmentFlowRegistryEnabled = true;
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
      });

      it('returns true when status is INPUT_REQUIRED and last message is a plan approval request', () => {
        setCheckpointWithLog([
          { message_type: 'tool', message_sub_type: 'list_dir', content: 'tool result' },
          { message_type: 'request', message_sub_type: 'approval', content: 'Approve?' },
        ]);
        expect(workflowStore.isApprovingPlan).toBe(true);
      });

      it('returns false when last message is not a request', () => {
        setCheckpointWithLog([
          { message_type: 'agent', message_sub_type: null, content: 'Plan summary' },
        ]);
        expect(workflowStore.isApprovingPlan).toBe(false);
      });

      it('returns false when last message is request but not approval sub_type', () => {
        setCheckpointWithLog([
          { message_type: 'request', message_sub_type: 'input', content: 'Enter value' },
        ]);
        expect(workflowStore.isApprovingPlan).toBe(false);
      });

      it('returns false when ui_chat_log is empty', () => {
        setCheckpointWithLog([]);
        expect(workflowStore.isApprovingPlan).toBe(false);
      });

      it('returns false when status is not INPUT_REQUIRED', () => {
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
        setCheckpointWithLog([
          { message_type: 'request', message_sub_type: 'approval', content: 'Approve?' },
        ]);
        expect(workflowStore.isApprovingPlan).toBe(false);
      });
    });
  });

  describe('steps (v1 todo_write)', () => {
    const makeTodoWriteMessage = (todos) => ({
      message_type: 'tool',
      message_sub_type: 'todo_write',
      component_name: 'planner',
      tool_info: { args: { todos }, name: 'todo_write', tool_response: '' },
    });

    const setCheckpointWithLog = (uiChatLog) => {
      workflowStore.setWorkflowCheckpoint({
        checkpoint: { channel_values: { ui_chat_log: uiChatLog } },
      });
    };

    describe('when FF is disabled', () => {
      beforeEach(() => {
        mainStore.softwareDevelopmentFlowRegistryEnabled = false;
      });

      it('returns legacy plan steps from channel_values', () => {
        workflowStore.setWorkflowCheckpoint({
          checkpoint: {
            channel_values: {
              plan: { steps: [{ id: '1', description: 'Step 1', status: 'Completed' }] },
            },
          },
        });
        expect(workflowStore.steps).toEqual([
          { id: '1', description: 'Step 1', status: 'Completed' },
        ]);
      });
    });

    describe('when FF is enabled', () => {
      beforeEach(() => {
        mainStore.softwareDevelopmentFlowRegistryEnabled = true;
      });

      it('maps todo statuses to step_status_badge values', () => {
        setCheckpointWithLog([
          makeTodoWriteMessage([
            { description: 'Task A', status: 'completed' },
            { description: 'Task B', status: 'in_progress' },
            { description: 'Task C', status: 'failed' },
            { description: 'Task D', status: 'pending' },
          ]),
        ]);
        expect(workflowStore.steps).toEqual([
          { id: '0', description: 'Task A', status: 'Completed' },
          { id: '1', description: 'Task B', status: 'In Progress' },
          { id: '2', description: 'Task C', status: 'Cancelled' },
          { id: '3', description: 'Task D', status: 'Not Started' },
        ]);
      });

      it('uses the last todo_write message when there are multiple', () => {
        setCheckpointWithLog([
          makeTodoWriteMessage([{ description: 'Old task', status: 'pending' }]),
          { message_type: 'agent', content: 'Working...' },
          makeTodoWriteMessage([{ description: 'Updated task', status: 'in_progress' }]),
        ]);
        expect(workflowStore.steps).toHaveLength(1);
        expect(workflowStore.steps[0].description).toBe('Updated task');
        expect(workflowStore.steps[0].status).toBe('In Progress');
      });

      it('returns empty array when no todo_write message exists', () => {
        workflowStore.setWorkflowCheckpoint({
          checkpoint: {
            channel_values: {
              ui_chat_log: [
                { message_type: 'tool', message_sub_type: 'list_dir', content: 'files' },
              ],
              plan: { steps: [{ id: '1', description: 'Legacy step', status: 'Completed' }] },
            },
          },
        });
        expect(workflowStore.steps).toEqual([]);
      });

      it('returns empty array when no todo_write and no plan.steps', () => {
        setCheckpointWithLog([
          { message_type: 'tool', message_sub_type: 'list_dir', content: 'files' },
        ]);
        expect(workflowStore.steps).toEqual([]);
      });

      it('returns empty array when ui_chat_log is empty and no plan.steps', () => {
        setCheckpointWithLog([]);
        expect(workflowStore.steps).toEqual([]);
      });
    });
  });
});
