import { defineStore } from 'pinia';
import { DuoWorkflowStatus, WorkflowEvent, WorkflowType } from '@gitlab-lsp/workflow-api';
import { DEFAULT_DOCKER_IMAGE, toolApprovalTypes } from '../constants.ts';
import { mapChatMessage, hashMessage } from '../utils/chat_message_helpers';
import { getIDfromGraphqlId } from '../../../common/utils.ts';
import { useMainStore } from './main';
import { useRequestErrorStore } from './request_error';
import { useAgentStore } from './agents';
import { useChatAvailableModelsStore } from './chat_available_models';
import { useRepositoriesStore } from './repositories';

/**
 * Get project ID from repositories store, ensuring GraphQL IDs are parsed
 */
function getProjectId() {
  const repositoriesStore = useRepositoriesStore();
  const projectId = repositoriesStore.currentProjectId;

  // Parse GraphQL ID if it's in the format gid://gitlab/Project/123
  return projectId ? getIDfromGraphqlId(projectId) : null;
}

/**
 * Get namespace ID with fallback to mainStore, ensuring GraphQL IDs are parsed
 */
function getNamespaceId() {
  const repositoriesStore = useRepositoriesStore();
  const mainStore = useMainStore();

  const namespaceId = repositoriesStore.currentNamespaceId || mainStore.namespaceId;

  // Parse GraphQL ID if it's in the format gid://gitlab/Namespace/123
  return namespaceId ? getIDfromGraphqlId(namespaceId) : null;
}

/**
 * Get root namespace ID from repositories store, ensuring GraphQL IDs are parsed
 */
function getRootNamespaceId() {
  const repositoriesStore = useRepositoriesStore();

  const rootNamespaceId = repositoriesStore.currentRootNamespaceId;

  // Parse GraphQL ID if it's in the format gid://gitlab/Namespace/123
  return rootNamespaceId ? getIDfromGraphqlId(rootNamespaceId) : null;
}

/**
 * Returns true for internal planner agent messages that should be hidden from the UI.
 * These are emitted only by the flow-registry `software_development/v1` flow and are
 * duplicated by the subsequent plan approval request message. The legacy
 * `software_development` flow never emits messages with component_name === 'planner',
 * so this filter is safe to apply unconditionally.
 */
function isPlannerMessage(msg) {
  return msg.message_type === 'agent' && msg.component_name === 'planner';
}

/**
 * Returns true for user messages emitted by the plan_approval component in the
 * flow-registry `software_development/v1` flow. These are duplicates of the
 * executor-layer echo that is already present in ui_chat_log with no component_name.
 * The legacy `software_development` flow never emits user messages with
 * component_name === 'plan_approval', so this filter is safe to apply unconditionally.
 */
function isPlanApprovalUserMessage(msg) {
  return msg.message_type === 'user' && msg.component_name === 'plan_approval';
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    isLoadingWorkflow: false,
    initialState: {},
    activeWorkflow: {
      id: '',
      goal: '',
      status: '',
      checkpoint: {},
      supportsSessionApprovals: false, // Whether full stack supports session-wide approvals
      supportsPatternApprovals: false, // Whether full stack supports pattern-based approvals
    },
    pendingMessages: [],
    preCreateWorkflowPromise: null,
    preCreateWorkflowResolve: null,
    preCreateWorkflowReject: null,
    preCreateWorkflowProjectPath: null, // Track which project the pre-created workflow belongs to
    systemContextItems: [],
    chatMessagesCache: null,
  }),
  getters: {
    workflowId: (state) => state.activeWorkflow.id,
    workflowGoal: (state) => state.activeWorkflow.goal,
    workflowStatus: (state) => state.activeWorkflow.status,
    workflowCheckpoint: (state) => state.activeWorkflow.checkpoint,
    supportsSessionApprovals: (state) => state.activeWorkflow.supportsSessionApprovals,
    supportsPatternApprovals: (state) => state.activeWorkflow.supportsPatternApprovals,
    workflowType: () => {
      const mainStore = useMainStore();
      return mainStore.workflowType;
    },
    flowDefinition: (state) => {
      const agentStore = useAgentStore();
      if (state.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT) {
        const mainStore = useMainStore();
        return mainStore.softwareDevelopmentFlowRegistryEnabled
          ? WorkflowType.SOFTWARE_DEVELOPMENT_V1
          : WorkflowType.SOFTWARE_DEVELOPMENT;
      }
      return agentStore.workflowDefinition;
    },
    // Returns flow-registry routing fields when the FF is enabled for software_development,
    // otherwise returns the legacy workflowDefinition field.
    flowRegistryParams: (state) => {
      const mainStore = useMainStore();
      if (
        mainStore.softwareDevelopmentFlowRegistryEnabled &&
        state.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT
      ) {
        return {
          flowConfigId: 'software_development',
          flowConfigSchemaVersion: 'v1',
          flowVersion: '1.0.0',
          // Explicitly send an empty array so Rails does not fall back to its default
          // of [READ_WRITE_FILES, READ_ONLY_GITLAB], which would pre-approve file write
          // tools and bypass the plan approval step in the flow registry YAML.
          additionalOptions: { preApprovedAgentPrivileges: [] },
        };
      }
      const agentStore = useAgentStore();
      return {
        workflowDefinition:
          state.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT
            ? WorkflowType.SOFTWARE_DEVELOPMENT
            : agentStore.workflowDefinition,
      };
    },
    isChatFlow: (state) => {
      return state.workflowType === WorkflowType.CHAT;
    },
    isApprovingPlan: (state) => {
      // Legacy flow: PLAN_APPROVAL_REQUIRED status
      if (state.activeWorkflow.status === DuoWorkflowStatus.PLAN_APPROVAL) return true;
      // Flow registry: INPUT_REQUIRED + last ui_chat_log entry is a plan approval request
      const mainStore = useMainStore();
      if (
        mainStore.softwareDevelopmentFlowRegistryEnabled &&
        state.activeWorkflow.status === DuoWorkflowStatus.INPUT_REQUIRED
      ) {
        const uiChatLog = state.activeWorkflow.checkpoint?.channel_values?.ui_chat_log || [];
        const lastMessage = uiChatLog[uiChatLog.length - 1];
        return (
          lastMessage?.message_type === 'request' && lastMessage?.message_sub_type === 'approval'
        );
      }
      return false;
    },
    uiChatLog: (state) => state.activeWorkflow.checkpoint?.channel_values?.ui_chat_log || [],
    steps: (state) => {
      const mainStore = useMainStore();
      if (mainStore.softwareDevelopmentFlowRegistryEnabled) {
        // v1 flow: extract todos from the last todo_write tool message in ui_chat_log
        const uiChatLog = state.activeWorkflow.checkpoint?.channel_values?.ui_chat_log || [];
        const lastTodoWrite = [...uiChatLog]
          .reverse()
          .find((msg) => msg.message_sub_type === 'todo_write');
        if (lastTodoWrite) {
          const TODO_STATUS_MAP = {
            completed: 'Completed',
            in_progress: 'In Progress',
            failed: 'Cancelled',
          };
          const todos = lastTodoWrite.tool_info?.args?.todos ?? [];
          return todos.map((todo, index) => ({
            id: String(index),
            description: todo.description,
            status: TODO_STATUS_MAP[todo.status] ?? 'Not Started',
          }));
        }
        return [];
      }
      return state.activeWorkflow.checkpoint?.channel_values?.plan?.steps || [];
    },
    chatMessages: (state) => {
      // Combine and sort source messages, filtering out planner agent messages
      // which are duplicated by the subsequent request/approval message.
      const sourceMessages = [...state.uiChatLog, ...state.pendingMessages]
        .filter((msg) => !isPlannerMessage(msg) && !isPlanApprovalUserMessage(msg))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Initialize cache if needed
      if (!state.chatMessagesCache) {
        state.chatMessagesCache = {
          hashes: [],
          messages: [],
        };
      }

      const cache = state.chatMessagesCache;
      const newHashes = sourceMessages.map((msg) => hashMessage(msg));

      // Quick check: nothing changed at all
      if (
        newHashes.length === cache.hashes.length &&
        newHashes.every((hash, i) => hash === cache.hashes[i])
      ) {
        return cache.messages;
      }

      const { supportsSessionApprovals, supportsPatternApprovals } = state.activeWorkflow;
      const mapMsg = (msg) =>
        mapChatMessage(msg, supportsSessionApprovals, supportsPatternApprovals);

      // Check if messages were removed (array got shorter)
      if (newHashes.length < cache.hashes.length) {
        // Messages were dropped - rebuild to ensure clean state
        cache.messages = sourceMessages.map((msg) => mapMsg(msg));
        cache.hashes = newHashes;
        return cache.messages;
      }

      // Optimize for streaming: only last message changed
      const isStreamingUpdate =
        newHashes.length === cache.hashes.length &&
        newHashes.length > 0 &&
        newHashes.slice(0, -1).every((hash, i) => hash === cache.hashes[i]) &&
        newHashes[newHashes.length - 1] !== cache.hashes[cache.hashes.length - 1];

      if (isStreamingUpdate) {
        // Only update the last message - keep all other references intact
        const lastIndex = newHashes.length - 1;
        const updatedMessages = [...cache.messages]; // Shallow copy to trigger reactivity
        updatedMessages[lastIndex] = mapMsg(sourceMessages[lastIndex]);
        cache.messages = updatedMessages;
        cache.hashes[lastIndex] = newHashes[lastIndex];
        return cache.messages;
      }

      // Optimize for new message appended
      const isNewMessageAppended =
        newHashes.length === cache.hashes.length + 1 &&
        newHashes.slice(0, -1).every((hash, i) => hash === cache.hashes[i]);

      if (isNewMessageAppended) {
        // Just append the new message - create new array to trigger reactivity
        const newMessage = mapMsg(sourceMessages[sourceMessages.length - 1]);
        cache.messages = [...cache.messages, newMessage]; // Shallow copy + append
        cache.hashes.push(newHashes[newHashes.length - 1]);
        return cache.messages;
      }

      // For other changes, rebuild the entire array
      cache.messages = sourceMessages.map((msg) => mapMsg(msg));
      cache.hashes = newHashes;
      return cache.messages;
    },
  },
  actions: {
    addMessageToChat(message) {
      this.pendingMessages.push(message);
    },
    async redactMessage(message) {
      const result = await this.sendRequest('redactUserMessage', { content: message });

      if (result.error) {
        useRequestErrorStore().setRequestError(result.error);
      }

      return result;
    },
    sendToolApprovalWorkflow({ isApproved, ...options }) {
      const repositoriesStore = useRepositoriesStore();
      const { flowConfig, agentVersionId } = useAgentStore();
      const { selectedModelRef } = useChatAvailableModelsStore();

      const lastMessage = this.uiChatLog[this.uiChatLog.length - 1];
      const toolName = lastMessage?.tool_info?.name || '';
      const toolArgs = lastMessage?.tool_info?.args;

      let approvalPayload;
      if (options.type === toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION) {
        approvalPayload = {
          userApproved: true,
          toolName,
          pattern: options.pattern,
          type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
        };
      } else {
        approvalPayload = {
          userApproved: true,
          toolName,
          toolArgs,
          type: options.type ?? toolApprovalTypes.APPROVE_TOOL_ONCE,
        };
      }

      const rejectedPayload = {
        userApproved: false,
        message: options.message ?? 'Tool call rejected by user',
      };

      const toolApproval = isApproved ? approvalPayload : rejectedPayload;

      this.sendNotification('startWorkflow', {
        goal: '',
        image: DEFAULT_DOCKER_IMAGE,
        type: this.workflowType,
        ...this.flowRegistryParams,
        metadata: {
          projectId: getProjectId(),
          projectPath: repositoriesStore.selectedProjectPath,
          namespaceId: getNamespaceId(),
          rootNamespaceId: getRootNamespaceId(),
          selectedModelIdentifier: selectedModelRef,
          rootFsPath: repositoriesStore.currentRepository?.rootFsPath,
        },
        existingWorkflowId: this.workflowId,
        toolApproval,
        flowConfig,
        aiCatalogItemVersionId: agentVersionId,
      });
    },
    approveToolCall(type, pattern) {
      // The legacy Python flow needs an explicit RESUME event to Rails to transition
      // status before the gateway fetches it. Registry flows must NOT send this —
      // the gateway uses the TOOL_CALL_APPROVAL_REQUIRED status to know it should
      // resume the pending interrupt(). Sending RESUME first races with the
      // StartWorkflowRequest, causing the gateway to see RUNNING/RETRY instead and
      // hang waiting for a Command(resume=...) that never arrives.
      const mainStore = useMainStore();
      const { agentVersionId } = useAgentStore();
      const isFlowRegistry =
        (mainStore.softwareDevelopmentFlowRegistryEnabled &&
          this.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT) ||
        agentVersionId;
      if (!this.isChatFlow && !isFlowRegistry) {
        this.sendWorkflowEvent(WorkflowEvent.RESUME);
      }
      this.sendToolApprovalWorkflow({ isApproved: true, type, pattern });
    },
    refetchWorkflowData(workflowId = this.workflowId) {
      const mainStore = useMainStore();

      mainStore.log({
        level: 'debug',
        message: `Fetching Duo Agent Platform data for ID: ${workflowId}`,
      });
      this.sendNotification('getWorkflowById', { workflowId, isRefetch: true });
    },
    rejectToolCall(message = 'Tool call rejected by user') {
      const mainStore = useMainStore();
      const { agentVersionId } = useAgentStore();
      const isFlowRegistry =
        (mainStore.softwareDevelopmentFlowRegistryEnabled &&
          this.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT) ||
        agentVersionId;
      if (!this.isChatFlow && !isFlowRegistry) {
        this.sendWorkflowEvent(WorkflowEvent.MESSAGE, { message, type: 'user' });
      }

      this.sendToolApprovalWorkflow({ isApproved: false, message });
    },
    getWorkflowById(workflowId) {
      this.setWorkflowLoading(true);

      this.sendNotification('getWorkflowById', { workflowId });
    },
    onInitialState(initialState) {
      this.initialState = initialState;

      if (initialState.goal) {
        this.setWorkflowGoal(initialState.goal);
        this.startWorkflow();
      }
    },
    resetInitialState() {
      this.initialState = {};
    },
    cancelActiveWorkflow() {
      this.pendingMessages = [];
      this.activeWorkflow = {
        ...this.activeWorkflow,
        goal: '',
        status:
          this.workflowType === WorkflowType.CHAT
            ? DuoWorkflowStatus.INPUT_REQUIRED
            : DuoWorkflowStatus.STOPPED,
      };
      this.resetPreCreateState();
    },
    resetActiveWorkflow() {
      this.activeWorkflow = {
        id: '',
        goal: '',
        status: '',
        checkpoint: {},
      };
      this.resetPreCreateState();
    },
    async rejectPlan(message) {
      const mainStore = useMainStore();
      const isFlowRegistry =
        mainStore.softwareDevelopmentFlowRegistryEnabled &&
        this.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT;

      if (isFlowRegistry) {
        this.sendToolApprovalWorkflow({ isApproved: false, message });
        return;
      }

      this.sendWorkflowEvent(WorkflowEvent.MESSAGE, {
        message,
        type: 'user',
      });
      await this.runWorkflow({ isExistingWorkflow: true });
    },
    async resumeWorkflow() {
      const mainStore = useMainStore();
      const isFlowRegistry =
        mainStore.softwareDevelopmentFlowRegistryEnabled &&
        this.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT;

      if (isFlowRegistry) {
        this.sendToolApprovalWorkflow({ isApproved: true });
        return;
      }

      if (mainStore.isFlowTab) {
        this.sendWorkflowEvent(WorkflowEvent.RESUME);
      }

      await this.runWorkflow({ isExistingWorkflow: true });
    },
    sendWorkflowEvent(eventType, message) {
      this.sendNotification('sendWorkflowEvent', {
        eventType,
        workflowId: this.activeWorkflow.id,
        message,
      });
    },
    async runWorkflow({ isExistingWorkflow = false } = {}) {
      const repositoriesStore = useRepositoriesStore();

      let preCreatedWorkflowId = null;
      if (!isExistingWorkflow && this.preCreateWorkflowPromise) {
        // Check if project changed since pre-creation
        if (this.preCreateWorkflowProjectPath !== repositoriesStore.selectedProjectPath) {
          this.resetPreCreateState();
        } else {
          try {
            preCreatedWorkflowId = await this.preCreateWorkflowPromise;
            // Legacy code: ignore unused variable during ESLint 9 upgrade
            // eslint-disable-next-line no-unused-vars
          } catch (e) {
            // pre-creating the workflow is a nice-to-have, if it fails we carry on and the workflow is created by the executor later
          }
        }
      }
      const { flowConfig, agentVersionId } = useAgentStore();
      const { selectedModelRef } = useChatAvailableModelsStore();

      this.sendNotification('startWorkflow', {
        goal: this.activeWorkflow.goal,
        image: DEFAULT_DOCKER_IMAGE,
        type: this.workflowType,
        ...this.flowRegistryParams,
        metadata: {
          projectId: getProjectId(),
          projectPath: repositoriesStore.selectedProjectPath,
          namespaceId: getNamespaceId(),
          rootNamespaceId: getRootNamespaceId(),
          selectedModelIdentifier: selectedModelRef,
          rootFsPath: repositoriesStore.currentRepository?.rootFsPath,
        },
        existingWorkflowId: isExistingWorkflow ? this.workflowId : null,
        preCreatedWorkflowId,
        flowConfig,
        aiCatalogItemVersionId: agentVersionId,
      });

      if (this.preCreateWorkflowPromise) {
        this.resetPreCreateState();
      }
    },
    setWorkflowStarted(id) {
      this.setWorkflowId(id);
      this.setWorkflowLoading(false);

      // Lock project selector to the current project
      const repositoriesStore = useRepositoriesStore();
      if (repositoriesStore.selectedProjectPath) {
        repositoriesStore.setWorkflowProject(repositoriesStore.selectedProjectPath);
      }
    },
    setWorkflowId(id) {
      this.activeWorkflow.id = id;
    },
    setWorkflowCheckpoint({ checkpoint, supportsSessionApprovals, supportsPatternApprovals }) {
      const incomingUiChatLog = checkpoint?.channel_values?.ui_chat_log || [];
      this.activeWorkflow.checkpoint = checkpoint;
      this.activeWorkflow.supportsSessionApprovals =
        supportsSessionApprovals || this.activeWorkflow.supportsSessionApprovals;
      this.activeWorkflow.supportsPatternApprovals =
        supportsPatternApprovals || this.activeWorkflow.supportsPatternApprovals;
      this.removePendingMessages(incomingUiChatLog);
    },
    setWorkflowGoal(goal) {
      this.activeWorkflow.goal = goal;
    },
    setWorkflowLoading(isLoading) {
      this.isLoadingWorkflow = isLoading;
    },
    setWorkflowStatus(status) {
      if (!status) return;
      this.activeWorkflow.status = status;
    },
    async startWorkflow() {
      await this.runWorkflow();
    },
    stopWorkflow(workflowId) {
      this.sendNotification('stopWorkflow', { workflowId });
    },
    interruptRunningCommand(workflowId) {
      this.sendNotification('interruptRunningCommand', { workflowId });
    },
    preCreateWorkflow(draftGoal) {
      // If there is an ID, we're resuming an existing workflow, no need to pre-created
      if (this.preCreateWorkflowPromise || this.workflowId) {
        return;
      }

      const repositoriesStore = useRepositoriesStore();

      const { agentVersionId } = useAgentStore();

      const { selectedModelRef } = useChatAvailableModelsStore();

      // Store the project path for which we're pre-creating the workflow
      this.preCreateWorkflowProjectPath = repositoriesStore.selectedProjectPath;

      // We use a promise to track that "pre creation" of the workflow has started. This allows us to handle the edge-case
      // where we start pre-creating and the user submits the prompt before the workflow has been created. This way we can
      // await the pre-creation promise and continue once we have a workflowId
      this.preCreateWorkflowPromise = new Promise((resolve, reject) => {
        this.preCreateWorkflowResolve = resolve;
        this.preCreateWorkflowReject = reject;
      });

      this.sendNotification('preCreateWorkflow', {
        draftGoal,
        type: this.workflowType,
        metadata: {
          projectId: getProjectId(),
          projectPath: repositoriesStore.selectedProjectPath,
          namespaceId: getNamespaceId(),
          rootNamespaceId: getRootNamespaceId(),
          selectedModelIdentifier: selectedModelRef,
          rootFsPath: repositoriesStore.currentRepository?.rootFsPath,
        },
        workflowDefinition: this.flowDefinition,
        aiCatalogItemVersionId: agentVersionId,
      });
    },
    setPreCreatedWorkflowId(workflowId) {
      if (this.preCreateWorkflowResolve) {
        this.preCreateWorkflowResolve(workflowId);
      }
      // Don't lock project on pre-creation - allow user to switch projects before submitting
    },
    setPreCreationWorkflowError() {
      // Do not reset preCreate state on error as this will cause
      // a new preCreateWorkflow to be opened with subsequent
      // key presses, potentially triggering the same error. Prefer
      // fall-through to regular workflow instead.
      if (this.preCreateWorkflowReject) {
        this.preCreateWorkflowReject(new Error('Workflow pre-creation failed'));
      }
    },
    resetPreCreateState() {
      this.preCreateWorkflowPromise = null;
      this.preCreateWorkflowResolve = null;
      this.preCreateWorkflowReject = null;
      this.preCreateWorkflowProjectPath = null;
    },
    removePendingMessages(uiChatLog) {
      if (!this.pendingMessages.length) return;

      // Find the last user message in pendingMessages
      const lastUserMessage = [...this.pendingMessages]
        .reverse()
        .find((msg) => msg.message_type === 'user');

      this.pendingMessages = [
        ...this.pendingMessages.filter((message) => {
          if (message === lastUserMessage) {
            const foundInLog = uiChatLog.find((loggedMessage) => {
              return (
                loggedMessage.message_type === 'user' && loggedMessage.content === message.content
              );
            });
            return !foundInLog;
          }

          return true;
        }),
      ];
    },
    clearPendingMessages() {
      this.pendingMessages = [];
    },
    setSystemContextItems(items) {
      this.systemContextItems = items || [];
    },
    clearSystemContextItems() {
      this.systemContextItems = [];
    },
    onConnectionLost() {
      this.setWorkflowLoading(false);
      this.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
      useRequestErrorStore().setRequestError({
        message: 'Connection lost. The workflow was interrupted.',
      });
    },
  },
  events: {
    initialState: 'onInitialState',
    workflowCheckpoint: 'setWorkflowCheckpoint',
    workflowGoal: 'setWorkflowGoal',
    workflowStatus: 'setWorkflowStatus',
    workflowStarted: 'setWorkflowStarted',
    workflowPreCreated: 'setPreCreatedWorkflowId',
    workflowPreCreationError: 'setPreCreationWorkflowError',
    setSystemContextItems: 'setSystemContextItems',
    connectionLost: 'onConnectionLost',
  },
});
