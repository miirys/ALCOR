import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  WorkflowStartedPayload,
  WorkflowEventPayload,
  WorkflowCompletedPayload,
  WorkflowErrorPayload,
  AgentSkillSlashCommand,
} from '@gitlab-org/lib-duo-agent-platform/webview';
import type { DuoMessage, DuoWorkflowInfo } from '@gitlab-org/graphql';
import type { WorkflowMetadata, ToolApproval } from '@gitlab-lsp/workflow-api';
import { WorkflowType, DuoWorkflowStatus, isAwaitingToolApproval } from '@gitlab-lsp/workflow-api';
import { tryParseGitLabGidToString } from '@gitlab-org/core';
import {
  getDuoAgentPlatformMessageBus,
  disposeDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';
import { defaultSlashCommands } from '../utils/slashCommands';
import type { GitlabChatSlashCommand } from '../utils/slashCommands';
import { useAgentsStore } from './agentsStore';

export const useChatStore = defineStore('chat', () => {
  const workflowType = ref<WorkflowType>(WorkflowType.CHAT);

  const workflowId = ref<string | null>(null);
  const workflowGoal = ref<string>('');
  const workflowStatus = ref<DuoWorkflowStatus | ''>('');
  const workflowProjectPath = ref<string | null>(null);
  const chatMessages = ref<DuoMessage[]>([]);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // commands
  const skillCommands = ref<GitlabChatSlashCommand[]>([]);

  let messageBus: DuoAgentPlatformMessageBus | null = null;

  function initialize(injectedMessageBus?: DuoAgentPlatformMessageBus) {
    if (messageBus) {
      return;
    }

    if (injectedMessageBus) {
      messageBus = injectedMessageBus;
    } else {
      messageBus = getDuoAgentPlatformMessageBus();
    }

    setupListeners();
  }

  function setWorkflowType(type: WorkflowType) {
    workflowType.value = type;
  }

  const isFlowMode = computed(() => workflowType.value === WorkflowType.SOFTWARE_DEVELOPMENT);

  const slashCommands = computed<GitlabChatSlashCommand[]>(() => [
    ...defaultSlashCommands,
    ...skillCommands.value,
  ]);

  function setSkillSlashCommands(commands: AgentSkillSlashCommand[]) {
    skillCommands.value = commands.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      isSkill: true,
      skillName: cmd.skillName,
    }));
  }

  const isAwaitingApproval = computed(() => {
    const status = workflowStatus.value;
    return status !== '' && isAwaitingToolApproval(status);
  });

  const isStopped = computed(
    () =>
      !isLoading.value &&
      Boolean(workflowId.value) &&
      workflowStatus.value === DuoWorkflowStatus.STOPPED,
  );

  // Mirrors agentic chat: a run is only stoppable once the backend has reported a
  // live status (the workflow has "connected") and it is not awaiting a tool approval.
  const canStop = computed(() => {
    const status = workflowStatus.value;
    return status !== '' && !isAwaitingToolApproval(status);
  });

  function setupListeners() {
    if (!messageBus) return;

    messageBus.onNotification('workflowStarted', (payload: WorkflowStartedPayload) => {
      workflowId.value = payload.workflowId;
    });

    messageBus.onNotification('workflowEvent', (payload: WorkflowEventPayload) => {
      setWorkflowStatus(payload.workflowStatus);
      chatMessages.value = payload.messages;
    });

    messageBus.onNotification('workflowCompleted', (payload: WorkflowCompletedPayload) => {
      if (!isAwaitingApproval.value) {
        setWorkflowStatus(payload.status);
      } else if (
        payload.status === DuoWorkflowStatus.FAILED ||
        payload.status === DuoWorkflowStatus.STOPPED
      ) {
        setWorkflowStatus(payload.status);
      }
      isLoading.value = false;
      if (payload.error) {
        error.value = payload.error;
      }
    });

    messageBus.onNotification('workflowError', (payload: WorkflowErrorPayload) => {
      error.value = payload.message;
      isLoading.value = false;
      if (isAwaitingApproval.value) {
        setWorkflowStatus('');
      }
    });

    messageBus.onNotification('setSkillSlashCommands', setSkillSlashCommands);
  }

  function dispose() {
    disposeDuoAgentPlatformMessageBus();
    messageBus = null;
  }

  function $reset() {
    workflowId.value = null;
    workflowGoal.value = '';
    setWorkflowStatus('');
    workflowProjectPath.value = null;
    isLoading.value = false;
    error.value = null;
    chatMessages.value = [];
    skillCommands.value = [];
  }

  function setActiveChat(workflow: DuoWorkflowInfo) {
    workflowId.value = tryParseGitLabGidToString(workflow.id);
    const messages = workflow.latestCheckpoint?.duoMessages || [];
    chatMessages.value = messages;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.messageType === 'request' && lastMessage.toolInfo) {
      setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);
    }
  }

  function copyMessage(message: string) {
    if (!messageBus) {
      return;
    }
    messageBus.sendNotification('copyMessage', { message });
  }

  function openUrl(url: string) {
    if (!messageBus) {
      return;
    }
    messageBus.sendNotification('openUrl', { url });
  }

  function copyCodeSnippet(snippet: string) {
    if (!messageBus) {
      return;
    }
    messageBus.sendNotification('copyCodeSnippet', { snippet });
  }

  function insertCodeSnippet(snippet: string) {
    if (!messageBus) {
      return;
    }
    messageBus.sendNotification('insertCodeSnippet', { snippet });
  }

  function sendToolApproval(toolApproval: ToolApproval) {
    if (!messageBus) {
      return;
    }
    setLoading(true);
    const agentsStore = useAgentsStore();
    messageBus.sendNotification('startWorkflow', {
      goal: '',
      type: workflowType.value,
      metadata: {
        projectPath: workflowProjectPath.value || '',
      },
      existingWorkflowId: workflowId.value ?? undefined,
      workflowDefinition: agentsStore.workflowDefinition,
      aiCatalogItemVersionId: agentsStore.agentVersionId,
      flowConfig: agentsStore.flowConfig || undefined,
      additionalContext: [],
      toolApproval,
    });
  }

  function setWorkflowGoal(goal: string) {
    workflowGoal.value = goal;
  }

  function setWorkflowStatus(status: DuoWorkflowStatus | '') {
    workflowStatus.value = status;
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage;
  }

  function addMessage(message: DuoMessage) {
    chatMessages.value.push(message);
  }

  function createChatPayload(message: string, metadata?: Partial<WorkflowMetadata>) {
    const agentsStore = useAgentsStore();
    return {
      goal: message,
      type: WorkflowType.CHAT,
      metadata: {
        projectId: metadata?.projectId,
        projectPath: metadata?.projectPath || '',
        namespaceId: metadata?.namespaceId,
        rootNamespaceId: metadata?.rootNamespaceId,
        selectedModelIdentifier: metadata?.selectedModelIdentifier || '',
        rootFsPath: metadata?.rootFsPath,
      },
      existingWorkflowId: workflowId.value ?? undefined,
      workflowDefinition: agentsStore.workflowDefinition,
      aiCatalogItemVersionId: agentsStore.agentVersionId,
      flowConfig: agentsStore.flowConfig || undefined,
      additionalContext: [],
    };
  }

  function createFlowPayload(message: string, metadata?: Partial<WorkflowMetadata>) {
    const agentsStore = useAgentsStore();

    return {
      goal: message,
      type: WorkflowType.SOFTWARE_DEVELOPMENT,
      metadata: {
        projectId: metadata?.projectId,
        projectPath: metadata?.projectPath || '',
        namespaceId: metadata?.namespaceId,
        rootNamespaceId: metadata?.rootNamespaceId,
        selectedModelIdentifier: metadata?.selectedModelIdentifier || '',
        rootFsPath: metadata?.rootFsPath,
      },
      existingWorkflowId: workflowId.value ?? undefined,
      flowConfig: agentsStore.flowConfig || undefined,
      additionalContext: [],
    };
  }

  async function submitMessage(
    message: string,
    type: WorkflowType,
    metadata?: Partial<WorkflowMetadata>,
  ) {
    try {
      if (!messageBus) {
        return;
      }

      if (!message.trim()) {
        throw new Error('Message cannot be empty');
      }

      setLoading(true);
      setError(null);
      // Clear the previous status so Stop stays disabled until the run reconnects.
      setWorkflowStatus('');

      // Set the workflow goal
      setWorkflowGoal(message);

      // Create a user message object
      const userMessage: DuoMessage = {
        content: message,
        messageType: 'user',
        toolInfo: null,
      };

      // Add the message to the chat
      addMessage(userMessage);

      const workflowPayload =
        type === WorkflowType.CHAT
          ? createChatPayload(message, metadata)
          : createFlowPayload(message, metadata);

      messageBus.sendNotification('startWorkflow', workflowPayload);
      if (metadata?.projectPath) {
        workflowProjectPath.value = metadata.projectPath;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit message';
      setError(errorMessage);
      setLoading(false);
    }
  }

  /**
   * Request a graceful stop of the running workflow.
   */
  function stopWorkflow() {
    if (!messageBus || !workflowId.value) return;

    messageBus.sendNotification('stopWorkflow', {
      workflowId: workflowId.value,
      source: isFlowMode.value ? 'flows' : 'chat',
    });
  }

  /**
   * Set the project from an active workflow (locks the selector)
   */
  function setWorkflowProject(projectPath: string) {
    workflowProjectPath.value = projectPath;
  }

  /**
   * Clear the workflow project lock (when navigating away)
   */
  function clearWorkflowProject() {
    workflowProjectPath.value = null;
  }

  return {
    initialize,
    dispose,
    $reset,

    workflowId,
    workflowType,
    workflowGoal,
    workflowStatus,
    workflowProjectPath,
    isLoading,
    isFlowMode,
    isStopped,
    canStop,
    isAwaitingApproval,
    error,

    chatMessages,

    setActiveChat,
    copyMessage,
    openUrl,
    copyCodeSnippet,
    insertCodeSnippet,
    sendToolApproval,
    setWorkflowGoal,
    setWorkflowStatus,
    setWorkflowProject,
    clearWorkflowProject,
    setLoading,
    setError,
    addMessage,
    submitMessage,
    stopWorkflow,
    setWorkflowType,

    slashCommands,
    skillCommands,
    setSkillSlashCommands,
  };
});
