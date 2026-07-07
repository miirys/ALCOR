import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRouter } from 'vue-router';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { MOCK_WORKFLOWS } from '../mockData';
import { useHistoryStore } from '../stores/historyStore';
import { useChatStore } from '../stores/chatStore';
import { useModelsStore } from '../stores/modelsStore';
import { useAgentsStore } from '../stores/agentsStore';
import { useChat } from './useChat';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: vi.fn(),
}));

interface MockMessageBus {
  sendRequest: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
}

interface MockRouter {
  replace: ReturnType<typeof vi.fn>;
}

describe('useChat', () => {
  let mockMessageBus: MockMessageBus;
  let mockRouter: MockRouter;

  beforeEach(() => {
    setActivePinia(createPinia());

    mockMessageBus = {
      sendRequest: vi.fn().mockResolvedValue(null),
      sendNotification: vi.fn(),
      onNotification: vi.fn(),
    };

    mockRouter = {
      replace: vi.fn(),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    vi.mocked(useRouter).mockReturnValue(mockRouter as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('setActiveChat', () => {
    it('sets the active chat when a matching chat is found', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      // MOCK_WORKFLOWS[0] has id 'gid://gitlab/Ai::DuoWorkflows::Workflow/1'
      await setActiveChat('1');

      expect(chatStore.workflowId).toBe('1');
    });

    it('calls repositoriesStore.setWorkflowProject when selected chat has a project path', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('1');

      expect(chatStore.workflowProjectPath).toBe(MOCK_WORKFLOWS[0]!.project!.fullPath);
    });

    it('does not call setWorkflowProject when selected chat has no project', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      const { setActiveChat } = useChat();

      const workflowWithoutProject = { ...MOCK_WORKFLOWS[0]!, project: null };
      historyStore.chats = [workflowWithoutProject];

      await setActiveChat('1');

      expect(chatStore.workflowProjectPath).toBeNull();
    });

    it('does not call setWorkflowProject when selected chat project has no fullPath', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      const { setActiveChat } = useChat();

      const workflowWithoutFullPath = {
        ...MOCK_WORKFLOWS[0]!,
        project: { id: 'gid://gitlab/Project/1', fullPath: '' },
      };
      historyStore.chats = [workflowWithoutFullPath];

      await setActiveChat('1');

      expect(chatStore.workflowProjectPath).toBeNull();
    });

    it('logs a warning when the chat is not found', async () => {
      const historyStore = useHistoryStore();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('nonexistent-id');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-id'));

      consoleSpy.mockRestore();
    });

    it('does not set active chat when no matching chat is found', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('nonexistent-id');

      expect(chatStore.workflowId).toBeNull();
    });

    it('syncs the agent selection to the catalog version id when present', async () => {
      const historyStore = useHistoryStore();
      const agentsStore = useAgentsStore();
      const applySpy = vi.spyOn(agentsStore, 'selectAgentByRef').mockResolvedValue();
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('1');

      expect(applySpy).toHaveBeenCalledWith(MOCK_WORKFLOWS[0]!.aiCatalogItemVersionId);
    });

    it('falls back to workflowDefinition when no catalog version id is set', async () => {
      const historyStore = useHistoryStore();
      const agentsStore = useAgentsStore();
      const applySpy = vi.spyOn(agentsStore, 'selectAgentByRef').mockResolvedValue();
      const { setActiveChat } = useChat();

      // MOCK_WORKFLOWS[3] has aiCatalogItemVersionId: null
      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('4');

      expect(applySpy).toHaveBeenCalledWith(MOCK_WORKFLOWS[3]!.workflowDefinition);
    });

    it('does not sync the agent when chat is not found', async () => {
      const historyStore = useHistoryStore();
      const agentsStore = useAgentsStore();
      const applySpy = vi.spyOn(agentsStore, 'selectAgentByRef').mockResolvedValue();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { setActiveChat } = useChat();

      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('nonexistent-id');

      expect(applySpy).not.toHaveBeenCalled();
    });

    it('stores the parsed workflow id', async () => {
      const historyStore = useHistoryStore();
      const chatStore = useChatStore();
      const { setActiveChat } = useChat();

      // MOCK_WORKFLOWS[3] has id 'gid://gitlab/Ai::DuoWorkflows::Workflow/4'
      historyStore.chats = MOCK_WORKFLOWS;

      await setActiveChat('4');

      expect(chatStore.workflowId).toBe('4');
    });
  });

  describe('setSelectedModel', () => {
    it('updates the model when the selected model is different', async () => {
      const modelsStore = useModelsStore();
      const { setSelectedModel } = useChat();

      modelsStore.initialize(mockMessageBus as never);
      modelsStore.selectedModelRef = 'model-a';

      await setSelectedModel('model-b');

      expect(modelsStore.selectedModelRef).toBe('model-b');
    });

    it('does not update the model when the selected model is the same', async () => {
      const modelsStore = useModelsStore();
      const { setSelectedModel } = useChat();
      const setSelectedModelSpy = vi.spyOn(modelsStore, 'setSelectedModel');

      modelsStore.selectedModelRef = 'model-a';

      await setSelectedModel('model-a');

      expect(setSelectedModelSpy).not.toHaveBeenCalled();
    });

    it('calls startNewChat when there is an active workflow', async () => {
      const modelsStore = useModelsStore();
      const chatStore = useChatStore();
      const { setSelectedModel } = useChat();

      modelsStore.selectedModelRef = 'model-a';
      chatStore.workflowId = 'workflow-123';

      await setSelectedModel('model-b');

      expect(mockRouter.replace).toHaveBeenCalledWith({ name: 'chat' });
      expect(chatStore.workflowId).toBeNull();
    });

    it('does not call startNewChat when there is no active workflow', async () => {
      const modelsStore = useModelsStore();
      const chatStore = useChatStore();
      const { setSelectedModel } = useChat();

      modelsStore.selectedModelRef = 'model-a';
      chatStore.workflowId = null;

      await setSelectedModel('model-b');

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('resets the chat store when starting a new chat', async () => {
      const modelsStore = useModelsStore();
      const chatStore = useChatStore();
      const { setSelectedModel } = useChat();

      modelsStore.selectedModelRef = 'model-a';
      chatStore.workflowId = 'workflow-123';
      chatStore.workflowGoal = 'Some goal';
      chatStore.chatMessages = [
        { content: 'test message', messageType: 'user' as const, toolInfo: null },
      ];

      await setSelectedModel('model-b');

      expect(chatStore.workflowId).toBeNull();
      expect(chatStore.workflowGoal).toBe('');
      expect(chatStore.chatMessages).toEqual([]);
    });

    it('preserves the workflow when model is the same', async () => {
      const modelsStore = useModelsStore();
      const chatStore = useChatStore();
      const { setSelectedModel } = useChat();

      modelsStore.selectedModelRef = 'model-a';
      chatStore.workflowId = 'workflow-123';
      chatStore.workflowGoal = 'Some goal';

      await setSelectedModel('model-a');

      expect(chatStore.workflowId).toBe('workflow-123');
      expect(chatStore.workflowGoal).toBe('Some goal');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('setSelectedAgent', () => {
    it('selects the agent when it differs from the current selection', async () => {
      const agentsStore = useAgentsStore();
      const { setSelectedAgent } = useChat();

      const selectAgentSpy = vi.spyOn(agentsStore, 'selectAgent').mockResolvedValue();

      await setSelectedAgent('new-agent-id');

      expect(selectAgentSpy).toHaveBeenCalledWith('new-agent-id');
    });

    it('does not select when agentId matches the current selection', async () => {
      const agentsStore = useAgentsStore();
      const { setSelectedAgent } = useChat();

      const selectAgentSpy = vi.spyOn(agentsStore, 'selectAgent').mockResolvedValue();

      await setSelectedAgent(agentsStore.selectedAgentId);

      expect(selectAgentSpy).not.toHaveBeenCalled();
    });

    it('resets chat and navigates when there is an active workflow', async () => {
      const agentsStore = useAgentsStore();
      const chatStore = useChatStore();
      const { setSelectedAgent } = useChat();

      vi.spyOn(agentsStore, 'selectAgent').mockResolvedValue();
      chatStore.workflowId = 'workflow-123';
      chatStore.workflowGoal = 'Some goal';

      await setSelectedAgent('new-agent-id');

      expect(chatStore.workflowId).toBeNull();
      expect(mockRouter.replace).toHaveBeenCalledWith({ name: 'chat' });
    });

    it('does not reset chat when there is no active workflow', async () => {
      const agentsStore = useAgentsStore();
      const chatStore = useChatStore();
      const { setSelectedAgent } = useChat();

      vi.spyOn(agentsStore, 'selectAgent').mockResolvedValue();
      chatStore.workflowId = null;

      await setSelectedAgent('new-agent-id');

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });
});
