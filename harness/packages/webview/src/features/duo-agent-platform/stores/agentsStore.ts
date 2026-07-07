import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent } from '@gitlab-org/lib-duo-agent-platform/webview';
import {
  getDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
  disposeDuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';

export const DEFAULT_AGENT: Agent = {
  id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/chat',
  name: 'GitLab Duo',
  referenceWithVersion: 'chat',
  description:
    'Your general development assistant. Get help with code, planning, security, project management, and more.',
  foundational: true,
};

export const useAgentsStore = defineStore('agents', () => {
  let messageBus: DuoAgentPlatformMessageBus | null = null;

  const isLoading = ref(false);
  const agents = ref<Agent[]>([DEFAULT_AGENT]);
  const selectedAgentId = ref<string>(DEFAULT_AGENT.id);
  const flowConfig = ref('');
  const error = ref<string | null>(null);

  const selectedAgent = computed(
    () => agents.value.find((a) => a.id === selectedAgentId.value) ?? DEFAULT_AGENT,
  );

  const workflowDefinition = computed(() => {
    const agent = selectedAgent.value;
    return agent.foundational ? (agent.referenceWithVersion ?? 'chat') : '';
  });

  const agentVersionId = computed(() => {
    const agent = selectedAgent.value;
    return agent.foundational ? '' : (agent.pinnedItemVersionId ?? '');
  });

  function initialize(injectedMessageBus?: DuoAgentPlatformMessageBus) {
    if (messageBus) return;
    messageBus = injectedMessageBus ?? getDuoAgentPlatformMessageBus();
  }

  async function fetchAgents(projectId: string, namespaceId: string) {
    if (!messageBus) return;
    isLoading.value = true;
    error.value = null;
    try {
      const result = await messageBus.sendRequest('fetchAgents', { projectId, namespaceId });
      agents.value = result.agents.length > 0 ? result.agents : [DEFAULT_AGENT];
      await validateSelection();
    } catch (err) {
      error.value = `Failed to get more agents: ${err instanceof Error ? err.message : 'Unknown error'}`;
      agents.value = [DEFAULT_AGENT];
    } finally {
      isLoading.value = false;
    }
  }

  async function selectAgent(agentId: string) {
    const agent = agents.value.find((a) => a.id === agentId);
    if (!agent) return;

    selectedAgentId.value = agentId;
    flowConfig.value = '';

    if (!agent.foundational && messageBus) {
      try {
        flowConfig.value = await messageBus.sendRequest('getAgentFlowConfig', {
          agentVersionId: agentVersionId.value,
        });
      } catch (err) {
        console.error(
          `Failed to get flow config: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
        flowConfig.value = '';
      }
    }
  }

  async function validateSelection() {
    const stillAvailable = agents.value.some((a) => a.id === selectedAgentId.value);
    if (!stillAvailable) {
      await selectAgent(agents.value[0]?.id ?? DEFAULT_AGENT.id);
    }
  }

  async function selectAgentByRef(agentRef: string | null) {
    if (!agentRef) {
      await selectAgent(DEFAULT_AGENT.id);
      return;
    }
    const match = agents.value.find(
      (a) => a.referenceWithVersion === agentRef || a.pinnedItemVersionId === agentRef,
    );
    await selectAgent(match?.id ?? DEFAULT_AGENT.id);
  }

  function $reset() {
    isLoading.value = false;
    agents.value = [DEFAULT_AGENT];
    selectedAgentId.value = DEFAULT_AGENT.id;
    flowConfig.value = '';
    error.value = null;
  }

  function dispose() {
    disposeDuoAgentPlatformMessageBus();
    messageBus = null;
  }

  return {
    isLoading,
    agents,
    selectedAgent,
    selectedAgentId,
    workflowDefinition,
    agentVersionId,
    flowConfig,
    error,

    initialize,
    fetchAgents,
    selectAgent,
    selectAgentByRef,
    $reset,
    dispose,
  };
});
