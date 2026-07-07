import { storeToRefs } from 'pinia';
import type { AiDuoWorkflowsWorkflowID } from '@gitlab-org/graphql';
import { computed, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useHistoryStore } from '../stores/historyStore';
import { useChatStore } from '../stores/chatStore';
import { useRepositoriesStore } from '../stores/repositoriesStore';
import { useModelsStore } from '../stores/modelsStore';
import { useAgentsStore } from '../stores/agentsStore';
import { useAIContextStore } from '../stores/aiContextStore';

export function useChat() {
  const router = useRouter();

  const historyStore = useHistoryStore();
  const activeChatStore = useChatStore();
  const repositoriesStore = useRepositoriesStore();
  const modelsStore = useModelsStore();
  const agentsStore = useAgentsStore();
  const aiContextStore = useAIContextStore();

  const { chats, areChatsLoading, error, pageInfo, searchTerm } = storeToRefs(historyStore);
  const { selectedRootFsPath } = storeToRefs(repositoriesStore);
  const { chatMessages } = storeToRefs(activeChatStore);

  const currentProject = computed(() => {
    const currentPath =
      activeChatStore.workflowProjectPath || repositoriesStore.selectedProjectPath;
    return repositoriesStore.allProjects.find(
      (project) => project.namespaceWithPath === currentPath,
    );
  });

  watchEffect(async () => {
    const id = currentProject.value?.rootNamespaceId;
    if (id) await modelsStore.fetchAvailableModels(id);
  });

  watchEffect(async () => {
    const projectId = currentProject.value?.id;
    const namespaceId = currentProject.value?.namespaceId;
    if (projectId && namespaceId) await agentsStore.fetchAgents(projectId, namespaceId);
  });

  watchEffect(async () => {
    if (currentProject.value) {
      await aiContextStore.getContextCategories();
    }
  });

  async function setActiveChat(workflowId: string) {
    const DuoWorkflowsWorkflowId: AiDuoWorkflowsWorkflowID = `gid://gitlab/Ai::DuoWorkflows::Workflow/${workflowId}`;
    const selectedChat = chats.value.find((chat) => chat.id === DuoWorkflowsWorkflowId);
    if (selectedChat) {
      activeChatStore.setActiveChat(selectedChat);
      if (selectedChat.project?.fullPath) {
        activeChatStore.setWorkflowProject(selectedChat.project.fullPath);
      }
      await agentsStore.selectAgentByRef(
        selectedChat.aiCatalogItemVersionId ?? selectedChat.workflowDefinition,
      );
    } else {
      console.warn(`Chat with ID ${DuoWorkflowsWorkflowId} not found`);
    }
  }

  async function setSelectedModel(modelRef: string) {
    if (modelsStore.selectedModelRef !== modelRef) {
      modelsStore.setSelectedModel(modelRef);
      if (activeChatStore.workflowId) {
        // start new chat
        activeChatStore.$reset();
        await router.replace({ name: 'chat' });
      }
    }
  }

  async function setSelectedAgent(agentId: string) {
    if (agentsStore.selectedAgentId !== agentId) {
      await agentsStore.selectAgent(agentId);
      if (activeChatStore.workflowId) {
        // start new chat
        activeChatStore.$reset();
        await router.replace({ name: 'chat' });
      }
    }
  }

  return {
    chats,
    getChatThreads: historyStore.getChatThreads,
    searchChatThreads: historyStore.searchChatThreads,
    deleteChatThread: historyStore.deleteWorkflow,
    areChatsLoading,
    searchTerm,
    error,
    pageInfo,

    // active chat
    activeChatMessages: chatMessages,
    setActiveChat,
    resetActiveChat: activeChatStore.$reset,
    currentProject,
    rootFsPath: selectedRootFsPath,
    workflowId: activeChatStore.workflowId,
    workflowType: 'chat' as const,
    setSelectedModel,
    setSelectedAgent,
  };
}
