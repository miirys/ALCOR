import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { DuoWorkflowInfo } from '@gitlab-org/graphql';
import { WorkflowType, DuoWorkflowStatus } from '@gitlab-lsp/workflow-api';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { defaultSlashCommands } from '../utils/slashCommands';
import { useChatStore } from './chatStore';
import { useAgentsStore } from './agentsStore';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  onNotification: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
}

const MOCK_WORKFLOW_INFO: DuoWorkflowInfo = {
  id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/1',
  humanStatus: 'running',
  updatedAt: '2025-12-15T21:39:47Z',
  goal: 'Fix the bug',
  workflowDefinition: 'duo_chat_test/v1',
  archived: false,
  aiCatalogItemVersionId: null,
  project: {
    fullPath: 'group/project',
    id: 'gid://gitlab/Project/1',
  },
  latestCheckpoint: {
    duoMessages: [
      { content: 'Fix the bug', messageType: 'user', toolInfo: null },
      { content: 'Working on it', messageType: 'agent', toolInfo: null },
    ],
  },
};

describe('chatStore', () => {
  let mockMessageBus: MockMessageBus;
  let store: ReturnType<typeof useChatStore>;
  let notificationHandlers: Record<string, (payload: unknown) => void>;

  beforeEach(() => {
    setActivePinia(createPinia());
    notificationHandlers = {};

    mockMessageBus = {
      onNotification: vi.fn((name: string, handler: (payload: unknown) => void) => {
        notificationHandlers[name] = handler;
      }),
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    store = useChatStore();
    store.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('does not reinitialize if already initialized', () => {
      store.initialize();

      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });

    it('uses an injected message bus when provided', () => {
      const freshStore = useChatStore();
      freshStore.dispose();

      const customBus: MockMessageBus = {
        onNotification: vi.fn(),
        sendNotification: vi.fn(),
        sendRequest: vi.fn(),
      };
      freshStore.initialize(customBus as never);

      expect(customBus.onNotification).toHaveBeenCalled();
      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });

    it('registers workflowStarted, workflowEvent, workflowCompleted and workflowError handlers', () => {
      expect(notificationHandlers.workflowStarted).toBeDefined();
      expect(notificationHandlers.workflowEvent).toBeDefined();
      expect(notificationHandlers.workflowCompleted).toBeDefined();
      expect(notificationHandlers.workflowError).toBeDefined();
    });
  });

  describe('initial state', () => {
    it('starts with null workflowId and empty messages', () => {
      expect(store.workflowId).toBeNull();
      expect(store.chatMessages).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.workflowStatus).toBe('');
      expect(store.workflowGoal).toBe('');
    });
  });

  describe('workflowStarted notification', () => {
    it('sets workflowId from the payload', () => {
      notificationHandlers.workflowStarted?.({ workflowId: 'wf-abc' });

      expect(store.workflowId).toBe('wf-abc');
    });
  });

  describe('workflowEvent notification', () => {
    it('updates workflowStatus and chatMessages', () => {
      notificationHandlers.workflowEvent?.({
        workflowId: 'wf-abc',
        workflowStatus: DuoWorkflowStatus.RUNNING,
        messages: [{ content: 'Hello', messageType: 'agent', toolInfo: null }],
      });

      expect(store.workflowStatus).toBe(DuoWorkflowStatus.RUNNING);
      expect(store.chatMessages).toEqual([
        { content: 'Hello', messageType: 'agent', toolInfo: null },
      ]);
    });
  });

  describe('workflowCompleted notification', () => {
    it('sets workflowStatus and clears loading', () => {
      store.setLoading(true);

      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-abc',
        status: DuoWorkflowStatus.FINISHED,
      });

      expect(store.workflowStatus).toBe(DuoWorkflowStatus.FINISHED);
      expect(store.isLoading).toBe(false);
    });

    it('sets error when the payload includes an error', () => {
      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-abc',
        status: DuoWorkflowStatus.FAILED,
        error: 'Something went wrong',
      });

      expect(store.error).toBe('Something went wrong');
    });

    it('does not set error when payload has no error field', () => {
      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-abc',
        status: DuoWorkflowStatus.FINISHED,
      });

      expect(store.error).toBeNull();
    });
  });

  describe('workflowError notification', () => {
    it('sets error and clears loading', () => {
      store.setLoading(true);

      notificationHandlers.workflowError?.({ message: 'Connection lost' });

      expect(store.error).toBe('Connection lost');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('dispose', () => {
    it('calls disposeDuoAgentPlatformMessageBus', () => {
      store.dispose();

      expect(DuoAgentPlatformMessageBusModule.disposeDuoAgentPlatformMessageBus).toHaveBeenCalled();
    });

    it('allows reinitialization after dispose', () => {
      store.dispose();

      const freshBus: MockMessageBus = {
        onNotification: vi.fn(),
        sendNotification: vi.fn(),
        sendRequest: vi.fn(),
      };
      store.initialize(freshBus as never);

      expect(freshBus.onNotification).toHaveBeenCalled();
    });
  });

  describe('$reset', () => {
    it('resets all state to initial values', () => {
      store.setWorkflowGoal('some goal');
      store.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
      store.setLoading(true);
      store.setError('some error');
      store.addMessage({ content: 'msg', messageType: 'user', toolInfo: null });

      store.$reset();

      expect(store.workflowId).toBeNull();
      expect(store.workflowGoal).toBe('');
      expect(store.workflowStatus).toBe('');
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.chatMessages).toEqual([]);
    });
  });

  describe('slash commands', () => {
    const skillCommands = [
      { name: '/deploy', description: 'Deploy skill', skillName: 'deploy' },
      { name: '/lint', description: 'Lint skill', skillName: 'lint' },
    ];

    it('exposes the default commands when no skills are registered', () => {
      expect(store.slashCommands).toEqual(defaultSlashCommands);
      expect(store.skillCommands).toEqual([]);
    });

    it('maps skill commands and appends them to the defaults', () => {
      store.setSkillSlashCommands(skillCommands);

      expect(store.skillCommands).toEqual([
        {
          name: '/deploy',
          description: 'Deploy skill',
          isSkill: true,
          skillName: 'deploy',
        },
        {
          name: '/lint',
          description: 'Lint skill',
          isSkill: true,
          skillName: 'lint',
        },
      ]);
      expect(store.slashCommands).toEqual([...defaultSlashCommands, ...store.skillCommands]);
    });

    it('replaces previously registered skill commands', () => {
      store.setSkillSlashCommands(skillCommands);
      store.setSkillSlashCommands([
        { name: '/build', description: 'Build skill', skillName: 'build' },
      ]);

      expect(store.skillCommands.map((c) => c.name)).toEqual(['/build']);
    });

    it('updates the commands via the setSkillSlashCommands notification', () => {
      notificationHandlers.setSkillSlashCommands?.(skillCommands);

      expect(store.skillCommands.map((c) => c.name)).toEqual(['/deploy', '/lint']);
    });

    it('clears skill commands on $reset', () => {
      store.setSkillSlashCommands(skillCommands);

      store.$reset();

      expect(store.skillCommands).toEqual([]);
      expect(store.slashCommands).toEqual(defaultSlashCommands);
    });
  });

  describe('setActiveChat', () => {
    it('sets the parsed workflowId and chatMessages from the workflow', () => {
      store.setActiveChat(MOCK_WORKFLOW_INFO);

      expect(store.workflowId).toBe('1');
      expect(store.chatMessages).toEqual(MOCK_WORKFLOW_INFO.latestCheckpoint?.duoMessages);
    });

    it('uses empty array when latestCheckpoint has no messages', () => {
      const workflowWithoutMessages: DuoWorkflowInfo = {
        ...MOCK_WORKFLOW_INFO,
        latestCheckpoint: null,
      };

      store.setActiveChat(workflowWithoutMessages);

      expect(store.chatMessages).toEqual([]);
    });
  });

  describe('copyMessage', () => {
    it('sends copyMessage notification', () => {
      store.copyMessage('Hello world');

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('copyMessage', {
        message: 'Hello world',
      });
    });

    it('skips if not initialized', () => {
      store.dispose();
      store.copyMessage('Hello world');

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith('copyMessage', {
        message: 'Hello world',
      });
    });
  });

  describe('copyCodeSnippet', () => {
    it('sends copyCodeSnippet notification', () => {
      store.copyCodeSnippet('const x = 1;');

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('copyCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });

    it('skips if not initialized', () => {
      store.dispose();
      store.copyCodeSnippet('const x = 1;');

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith('copyCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });
  });

  describe('insertCodeSnippet', () => {
    it('sends insertCodeSnippet notification', () => {
      store.insertCodeSnippet('const x = 1;');

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('insertCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });

    it('skips if not initialized', () => {
      store.dispose();
      store.insertCodeSnippet('const x = 1;');
      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith('insertCodeSnippet', {
        snippet: 'const x = 1;',
      });
    });
  });

  describe('setters', () => {
    it('setWorkflowGoal updates workflowGoal', () => {
      store.setWorkflowGoal('new goal');
      expect(store.workflowGoal).toBe('new goal');
    });

    it('setWorkflowStatus updates workflowStatus', () => {
      store.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
      expect(store.workflowStatus).toBe(DuoWorkflowStatus.RUNNING);
    });

    it('setLoading updates isLoading', () => {
      store.setLoading(true);
      expect(store.isLoading).toBe(true);
      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('setError updates error', () => {
      store.setError('oops');
      expect(store.error).toBe('oops');
      store.setError(null);
      expect(store.error).toBeNull();
    });

    it('addMessage appends to chatMessages', () => {
      store.addMessage({ content: 'first', messageType: 'user', toolInfo: null });
      store.addMessage({ content: 'second', messageType: 'agent', toolInfo: null });

      expect(store.chatMessages).toHaveLength(2);
      expect(store.chatMessages[1]?.content).toBe('second');
    });
  });

  describe('workflowType and isFlowMode', () => {
    it('defaults to CHAT workflow type', () => {
      expect(store.workflowType).toBe(WorkflowType.CHAT);
      expect(store.isFlowMode).toBe(false);
    });

    it('setWorkflowType updates workflowType', () => {
      store.setWorkflowType(WorkflowType.SOFTWARE_DEVELOPMENT);

      expect(store.workflowType).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
      expect(store.isFlowMode).toBe(true);
    });

    it('isFlowMode returns false for CHAT type', () => {
      store.setWorkflowType(WorkflowType.CHAT);

      expect(store.isFlowMode).toBe(false);
    });
  });

  describe('submitMessage', () => {
    const metadata = {
      projectId: 'gid://gitlab/Project/1',
      projectPath: 'group/project',
      namespaceId: 'gid://gitlab/Namespace/1',
      rootNamespaceId: 'gid://gitlab/Namespace/1',
      selectedModelIdentifier: 'claude-3',
    };

    describe('when no workflowId exists (new workflow)', () => {
      it('sends startWorkflow without existingWorkflowId', async () => {
        await store.submitMessage('Fix the bug', WorkflowType.CHAT, metadata);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            goal: 'Fix the bug',
            type: WorkflowType.CHAT,
            existingWorkflowId: undefined,
          }),
        );
      });

      it('sets loading and adds user message', async () => {
        await store.submitMessage('Fix the bug', WorkflowType.CHAT, metadata);

        expect(store.isLoading).toBe(true);
        expect(store.chatMessages[0]).toEqual({
          content: 'Fix the bug',
          messageType: 'user',
          toolInfo: null,
        });
      });

      it('passes metadata in the payload', async () => {
        await store.submitMessage('Fix the bug', WorkflowType.CHAT, metadata);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            metadata: expect.objectContaining({
              projectPath: 'group/project',
              selectedModelIdentifier: 'claude-3',
            }),
          }),
        );
      });
    });

    describe('when a workflowId exists (continue workflow)', () => {
      beforeEach(() => {
        notificationHandlers.workflowStarted?.({ workflowId: 'wf-existing' });
      });

      it('sends startWorkflow with existingWorkflowId', async () => {
        await store.submitMessage('Continue', WorkflowType.CHAT, metadata);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            goal: 'Continue',
            existingWorkflowId: 'wf-existing',
          }),
        );
      });
    });

    describe('when message is empty', () => {
      it('sets error and does not send notification', async () => {
        await store.submitMessage('   ', WorkflowType.CHAT, metadata);

        expect(store.error).toBe('Message cannot be empty');
        expect(mockMessageBus.sendNotification).not.toHaveBeenCalled();
      });
    });

    it('when message bus is not initialized and does not send notification', async () => {
      store.dispose();

      await store.submitMessage('Fix the bug', WorkflowType.CHAT, metadata);

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalled();
    });

    it('uses empty string for projectPath when not provided', async () => {
      await store.submitMessage('Fix the bug', WorkflowType.CHAT);

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          metadata: expect.objectContaining({ projectPath: '' }),
        }),
      );
    });

    describe('when submitting with SOFTWARE_DEVELOPMENT type', () => {
      it('sends startWorkflow with SOFTWARE_DEVELOPMENT type', async () => {
        await store.submitMessage('Build a feature', WorkflowType.SOFTWARE_DEVELOPMENT, metadata);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            goal: 'Build a feature',
            type: WorkflowType.SOFTWARE_DEVELOPMENT,
          }),
        );
      });

      it('does not include workflowDefinition or aiCatalogItemVersionId in flow payload', async () => {
        await store.submitMessage('Build a feature', WorkflowType.SOFTWARE_DEVELOPMENT, metadata);

        const call = mockMessageBus.sendNotification.mock.calls.find(
          (args) => args[0] === 'startWorkflow',
        );
        const payload = call?.[1];

        expect(payload.type).toBe(WorkflowType.SOFTWARE_DEVELOPMENT);
        expect(payload).not.toHaveProperty('workflowDefinition');
        expect(payload).not.toHaveProperty('aiCatalogItemVersionId');
      });
    });

    describe('when submitting with CHAT type', () => {
      it('includes workflowDefinition and agentVersionId from agents store', async () => {
        const agentsStore = useAgentsStore();
        agentsStore.initialize(mockMessageBus as never);

        await store.submitMessage('Ask a question', WorkflowType.CHAT, metadata);

        expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
          'startWorkflow',
          expect.objectContaining({
            type: WorkflowType.CHAT,
            workflowDefinition: agentsStore.workflowDefinition,
            aiCatalogItemVersionId: agentsStore.agentVersionId,
          }),
        );
      });
    });
  });

  describe('stopWorkflow', () => {
    beforeEach(() => {
      notificationHandlers.workflowStarted?.({ workflowId: 'wf-running' });
      store.setLoading(true);
    });

    it('sends stopWorkflow with the chat source', () => {
      store.stopWorkflow();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('stopWorkflow', {
        workflowId: 'wf-running',
        source: 'chat',
      });
    });

    it('sends the flows source when in flow mode', () => {
      store.setWorkflowType(WorkflowType.SOFTWARE_DEVELOPMENT);

      store.stopWorkflow();

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('stopWorkflow', {
        workflowId: 'wf-running',
        source: 'flows',
      });
    });

    it('does not optimistically change loading or status; waits for the backend', () => {
      store.stopWorkflow();

      expect(store.isLoading).toBe(true);
      expect(store.workflowStatus).toBe('');
      expect(store.isStopped).toBe(false);
    });

    it('reflects STOPPED only once the backend confirms', () => {
      store.stopWorkflow();
      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-running',
        status: DuoWorkflowStatus.STOPPED,
      });

      expect(store.isLoading).toBe(false);
      expect(store.workflowStatus).toBe(DuoWorkflowStatus.STOPPED);
      expect(store.isStopped).toBe(true);
    });

    it('does nothing when there is no active workflow', () => {
      store.$reset();

      store.stopWorkflow();

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
        'stopWorkflow',
        expect.anything(),
      );
    });
  });

  describe('isStopped', () => {
    it('is true after a workflow is reported stopped', () => {
      notificationHandlers.workflowStarted?.({ workflowId: 'wf-1' });
      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-1',
        status: DuoWorkflowStatus.STOPPED,
      });

      expect(store.isStopped).toBe(true);
    });

    it('is false while loading', () => {
      notificationHandlers.workflowStarted?.({ workflowId: 'wf-1' });
      store.setWorkflowStatus(DuoWorkflowStatus.STOPPED);
      store.setLoading(true);

      expect(store.isStopped).toBe(false);
    });
  });

  describe('canStop', () => {
    it('is false before the workflow reports a status (not yet connected)', () => {
      notificationHandlers.workflowStarted?.({ workflowId: 'wf-1' });
      store.setLoading(true);

      expect(store.canStop).toBe(false);
    });

    it('is true once the workflow reports a live status', () => {
      notificationHandlers.workflowEvent?.({
        workflowId: 'wf-1',
        workflowStatus: DuoWorkflowStatus.RUNNING,
        messages: [],
      });

      expect(store.canStop).toBe(true);
    });

    it('is false while awaiting a tool-call approval', () => {
      notificationHandlers.workflowEvent?.({
        workflowId: 'wf-1',
        workflowStatus: DuoWorkflowStatus.TOOL_APPROVAL,
        messages: [],
      });

      expect(store.canStop).toBe(false);
    });

    it('resets to false when a new message is submitted, until the run reconnects', async () => {
      notificationHandlers.workflowEvent?.({
        workflowId: 'wf-1',
        workflowStatus: DuoWorkflowStatus.RUNNING,
        messages: [],
      });
      expect(store.canStop).toBe(true);

      await store.submitMessage('Another question', WorkflowType.CHAT);

      expect(store.canStop).toBe(false);
    });
  });

  describe('isAwaitingApproval', () => {
    it('is false when workflowStatus is empty', () => {
      expect(store.isAwaitingApproval).toBe(false);
    });

    it('is false when workflowStatus is RUNNING', () => {
      store.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
      expect(store.isAwaitingApproval).toBe(false);
    });

    it('is true when workflowStatus is TOOL_APPROVAL', () => {
      store.setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);
      expect(store.isAwaitingApproval).toBe(true);
    });

    it('becomes true when a workflowEvent with TOOL_APPROVAL status arrives', () => {
      notificationHandlers.workflowEvent?.({
        workflowId: 'wf-1',
        workflowStatus: DuoWorkflowStatus.TOOL_APPROVAL,
        messages: [],
      });
      expect(store.isAwaitingApproval).toBe(true);
    });
  });

  describe('workflowCompleted notification when awaiting approval', () => {
    it('does not update workflowStatus when isAwaitingApproval is true', () => {
      store.setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);

      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-1',
        status: DuoWorkflowStatus.FINISHED,
      });

      expect(store.workflowStatus).toBe(DuoWorkflowStatus.TOOL_APPROVAL);
    });

    it('still clears loading when isAwaitingApproval is true', () => {
      store.setLoading(true);
      store.setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);

      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-1',
        status: DuoWorkflowStatus.FINISHED,
      });

      expect(store.isLoading).toBe(false);
    });

    it('updates workflowStatus normally when not awaiting approval', () => {
      store.setWorkflowStatus(DuoWorkflowStatus.RUNNING);

      notificationHandlers.workflowCompleted?.({
        workflowId: 'wf-1',
        status: DuoWorkflowStatus.FINISHED,
      });

      expect(store.workflowStatus).toBe(DuoWorkflowStatus.FINISHED);
    });
  });

  describe('setActiveChat with tool approval', () => {
    it('sets TOOL_APPROVAL status when the last message is a request', () => {
      const workflowWithRequest: DuoWorkflowInfo = {
        ...MOCK_WORKFLOW_INFO,
        latestCheckpoint: {
          duoMessages: [
            { content: 'Do something', messageType: 'user', toolInfo: null },
            {
              content: 'I need to run a command',
              messageType: 'request',
              toolInfo: JSON.stringify({ name: 'run_command', args: {} }),
            },
          ],
        },
      };

      store.setActiveChat(workflowWithRequest);

      expect(store.workflowStatus).toBe(DuoWorkflowStatus.TOOL_APPROVAL);
      expect(store.isAwaitingApproval).toBe(true);
    });

    it('does not set TOOL_APPROVAL when the last message is not a request', () => {
      store.setActiveChat(MOCK_WORKFLOW_INFO);

      expect(store.workflowStatus).not.toBe(DuoWorkflowStatus.TOOL_APPROVAL);
    });

    it('does not set TOOL_APPROVAL when there are no messages', () => {
      store.setActiveChat({ ...MOCK_WORKFLOW_INFO, latestCheckpoint: { duoMessages: [] } });

      expect(store.workflowStatus).not.toBe(DuoWorkflowStatus.TOOL_APPROVAL);
    });
  });

  describe('sendToolApproval', () => {
    it('sends a startWorkflow notification with the toolApproval payload', () => {
      store.workflowId = 'wf-123';

      store.sendToolApproval({
        userApproved: true,
        toolName: 'run_command',
        type: 'approve_once' as never,
        toolArgs: {},
      });

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          existingWorkflowId: 'wf-123',
          toolApproval: expect.objectContaining({ userApproved: true }),
        }),
      );
    });

    it('sends a rejection payload when userApproved is false', () => {
      store.workflowId = 'wf-123';

      store.sendToolApproval({ userApproved: false, message: 'Too risky' });

      expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
        'startWorkflow',
        expect.objectContaining({
          toolApproval: expect.objectContaining({ userApproved: false, message: 'Too risky' }),
        }),
      );
    });

    it('does nothing when messageBus is not initialized', () => {
      store.dispose();
      store.sendToolApproval({
        userApproved: true,
        toolName: 'run_command',
        type: 'approve_once' as never,
        toolArgs: {},
      });

      expect(mockMessageBus.sendNotification).not.toHaveBeenCalledWith(
        'startWorkflow',
        expect.anything(),
      );
    });
  });
});
