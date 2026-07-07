<script>
import { AgenticDuoChat, AgenticToolApprovalFlow, DuoChatContextItemMenu } from '@gitlab/duo-ui';
import { mapActions, mapState } from 'pinia';
import {
  DuoWorkflowStatus,
  isAwaitingToolApproval,
  isTerminated,
  isAwaitingUserInput,
  isUserMessage,
  WorkflowEvent,
} from '@gitlab-lsp/workflow-api';
import renderGFM from './../utils/render_gfm.ts';
import { useMainStore } from '../stores/main';
import { useWorkflowStore } from '../stores/workflow';
import { useUserStore } from '../stores/user';
import { useChatAvailableModelsStore } from '../stores/chat_available_models';
import { useAgentStore } from '../stores/agents';
import { useUsageQuotaStore } from '../stores/usage_quota';
import ChatRecentChats from './chat_recent_chats.vue';
import WorkflowActions from './components/workflow_actions.vue';
import PlanPanel from './components/plan_panel.vue';
import UsageQuotaAlert from './components/usage_quota_alert.vue';
import {
  createErrorMessage,
  createUserMessage,
  randomizeArrayToNItems,
} from '../utils/chat_message_helpers';
import { useRequestErrorStore } from '../stores/request_error';
import { useAIContextStore } from '../stores/ai_context';
import { NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW } from '../utils/pre_created_workflows';
import { isExternalURL } from '../utils/url_utils';
import { CHATS_NEW, CHATS_SHOW } from '../routes/constants';
import { predefinedChatPrompts, predefinedFlowPrompts, toolApprovalTypes } from '../constants';
import {
  DuoChatPerformanceMetrics,
  displayPerformanceMark,
  displayPerformanceMetric,
  INTERACTION_TYPE,
} from '../utils/duo_chat_performance_metrics';

export const RESET_MESSAGE = '/reset';
export const NEW_CHAT_MESSAGE = '/new';
export const SKILLS_MESSAGE = '/skills';
export const SKILLS_PROMPT = 'What agent skills are available in this project?';

export function rewriteSkillSlashCommand(message, slashCommands) {
  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);
  const commandName = parts[0];
  const goal = parts.slice(1).join(' ').trim();

  const matchedCommand = slashCommands.find((cmd) => cmd.isSkill && cmd.name === commandName);
  if (!matchedCommand) {
    return null;
  }

  const base = `Use the ${matchedCommand.skillName} skill`;
  return goal ? `${base} to '${goal}'` : base;
}

// Eclipse on Windows injects a global constant called gc, creating a conflict with the minified code.
// This usage of the global gc variable prevents esbuild from using gc as a minifed variable name.
if (typeof gc !== 'undefined') {
  setTimeout(() => undefined, 0);
}

const initialPlaceholders = ['Have a question?', 'Need help with a task?'];

export default {
  name: 'AgenticChat',
  components: {
    AgenticDuoChat,
    AgenticToolApprovalFlow,
    DuoChatContextItemMenu,
    ChatRecentChats,
    WorkflowActions,
    PlanPanel,
    UsageQuotaAlert,
  },
  data() {
    return {
      transitionEvent: null,
      isProcessingToolApproval: false,
      isPlanApproved: false,
      pollInterval: null,
    };
  },
  computed: {
    ...mapState(useMainStore, ['slashCommands', 'projectPath', 'isFlowTab']),
    ...mapState(useUsageQuotaStore, ['usageQuotaExceeded', 'usageQuotaExceededMidStream']),
    ...mapState(useRequestErrorStore, ['requestError', 'isSocketLocked', 'socketError']),
    ...mapState(useWorkflowStore, [
      'workflowId',
      'workflowGoal',
      'workflowStatus',
      'workflowCheckpoint',
      'uiChatLog',
      'preCreateWorkflowPromise',
      'pendingMessages',
      'chatMessages',
      'steps',
      'systemContextItems',
      'isApprovingPlan',
    ]),
    ...mapState(useAIContextStore, [
      'contextMenuCategories',
      'contextMenuIsLoading',
      'contextMenuError',
      'contextSelections',
      'contextSearchResults',
    ]),
    ...mapState(useUserStore, ['userAvatarUrl']),
    ...mapState(useChatAvailableModelsStore, ['selectedModelRef']),
    ...mapState(useAgentStore, ['agentVersionId', 'workflowDefinition']),
    eventSource() {
      return this.isFlowTab ? 'flows' : 'chat';
    },
    chatPromptPlaceholder() {
      if (this.isApprovingPlan && !this.isPlanApproved) {
        return 'Ask me to refine the plan as needed before approving.';
      }

      if (!this.workflowId && !this.isDuoWorking) {
        return randomizeArrayToNItems(initialPlaceholders, 1)[0];
      }

      return this.isDuoWorking
        ? 'GitLab Duo is working on your request. Please wait.'
        : 'What should we work on next?';
    },
    emptyStateTitle() {
      return this.isFlowTab
        ? '👋 Gather context, create a plan, and execute on it. The Software Development Flow has access to your project and any additional context you give. It can help start a project, improve code, or troubleshoot.'
        : '👋 Get help with code, planning, security, project management, and more. Agentic Chat can answer questions or perform tasks for you.';
    },
    chatState() {
      return {
        isEnabled: !this.isSocketLocked,
        reason: this.socketError,
        ...(this.isSocketLocked && { canDismiss: false }),
      };
    },
    messages() {
      return this.chatMessages;
    },
    prompts() {
      if (this.usageQuotaExceeded) {
        return [];
      }

      const prompts = this.isFlowTab ? predefinedFlowPrompts : predefinedChatPrompts;

      return randomizeArrayToNItems(prompts, 4);
    },
    toolName() {
      return this.isFlowTab ? 'Duo Software Developer' : undefined;
    },
    showChatActions() {
      return this.isApprovingPlan && !this.isSendingEvent;
    },
    isSendingEvent() {
      return Boolean(this.transitionEvent) && this.transitionEvent !== WorkflowEvent.STOP;
    },
    isTerminated() {
      return isTerminated(this.workflowStatus);
    },
    isDuoWorking() {
      if (this.isTerminated) {
        return false;
      }

      if (this.isApprovingPlan) {
        return this.isPlanApproved || this.isSendingEvent;
      }

      if (this.workflowId && !this.needsInput) {
        return true;
      }

      return this.isSendingEvent;
    },
    canCancel() {
      return Boolean(
        this.workflowStatus && this.workflowStatus !== DuoWorkflowStatus.TOOL_APPROVAL,
      );
    },
    needsInput() {
      return this.workflowStatus === DuoWorkflowStatus.INPUT_REQUIRED;
    },
    isStopped() {
      return this.transitionEvent === WorkflowEvent.STOP;
    },
    pinnedContextEnabled() {
      return Boolean(this.contextMenuCategories?.length);
    },
    mcpApprovalOptions() {
      return [
        {
          type: toolApprovalTypes.APPROVE_TOOL_ONCE,
          text: 'Approve',
          primary: true,
        },
        {
          type: toolApprovalTypes.APPROVE_FOR_SESSION,
          text: 'Approve for Session',
        },
      ];
    },
    defaultApprovalOptions() {
      return [
        {
          type: toolApprovalTypes.APPROVE_TOOL_ONCE,
          text: 'Approve',
          primary: true,
        },
      ];
    },
    currentApprovalOptions() {
      // Find the most recent message that requires tool approval and has approval options
      const toolApprovalMessage = this.messages
        .slice()
        .reverse()
        .find((message) => {
          const hasApprovalOptions = Boolean(message.approvalOptions);
          const isToolApprovalState = isAwaitingToolApproval(this.workflowStatus);
          // Also check if message is a tool approval request
          const isToolApprovalMessage =
            message.message_type === 'request' &&
            message.content &&
            message.content.includes('requires approval');

          // Show approval UI if: has custom options, workflow requires approval, OR message is approval request
          return hasApprovalOptions || isToolApprovalState || isToolApprovalMessage;
        });

      return toolApprovalMessage?.approvalOptions || this.defaultApprovalOptions;
    },
  },
  mounted() {
    // this.attachToVsCodeState();
    // When using the built in VSCode commands to interact with the Duo Chat panel, such as
    // "View: Toggle GitLab Duo Chat", and "View: Focus into Secondary Sidebar" (or whichever sidebar is configured to contain Duo chat)
    // our custom "focusChat" event is not fired. So we also need to manually listen to the panel window itself gaining focus.
    window.addEventListener('focus', this.focusChat);
    document.addEventListener('click', this.handleLinkClick);

    const promptEl = this.$refs.duoChat?.$refs?.prompt?.$el;
    if (promptEl) {
      promptEl.addEventListener('focus', this.checkPromptFocus);
      promptEl.addEventListener('blur', this.checkPromptFocus);
      promptEl.addEventListener('keydown', this.handleKeyDown);
      promptEl.addEventListener('input', this.handlePromptInput);
    }

    this.getContextCategories();
  },
  beforeDestroy() {
    this.duoChatPerformanceMetrics.dispose();

    window.removeEventListener('focus', this.focusChat);
    document.removeEventListener('click', this.handleLinkClick);

    const promptEl = this.$refs.duoChat?.$refs?.prompt?.$el;
    if (promptEl) {
      promptEl.removeEventListener('focus', this.checkPromptFocus);
      promptEl.removeEventListener('blur', this.checkPromptFocus);
      promptEl.removeEventListener('keydown', this.handleKeyDown);
      promptEl.removeEventListener('input', this.handlePromptInput);
    }
  },
  created() {
    this.duoChatPerformanceMetrics = new DuoChatPerformanceMetrics();

    this.duoChatPerformanceMetrics.onMarkReported((mark) => {
      this.log({ level: 'info', message: displayPerformanceMark(mark) });
    });

    this.duoChatPerformanceMetrics.onMetricReported((metric) => {
      const source = this.eventSource;
      const selectedModel = this.selectedModelRef;
      const agentVersionOrWorkflowDefinition = this.agentVersionId || this.workflowDefinition;
      const workflowId = this.workflowId;
      const logMessage = `${displayPerformanceMetric(
        metric,
      )}, workflowId: ${workflowId} event source: ${source}, selected model: ${selectedModel}, agent or workflow definition: ${agentVersionOrWorkflowDefinition}`;

      this.log({ level: 'info', message: logMessage });
      this.trackEvent({
        event: metric.name,
        context: {
          source,
          selectedModel,
          agentVersionOrWorkflowDefinition,
          workflowId,
          duration: metric.duration,
          interactionType: metric.detail.interactionType,
        },
      });
    });
  },
  beforeRouteEnter({ name, params }, from, next) {
    if (name === CHATS_NEW) {
      next((vm) => {
        vm.transitionEvent = WorkflowEvent.STOP;
        vm.stopWorkflow(vm.workflowId);
        const workflowStore = useWorkflowStore();
        workflowStore.$reset();
        // Clear system context items when starting a new chat
        vm.clearSystemContextItems();
      });
      return;
    } else if (name === CHATS_SHOW) {
      next((vm) => {
        const { workflowId } = params;
        if (vm.workflowId && workflowId !== vm.workflowId) {
          vm.stopWorkflow(vm.workflowId);
        }

        if (from.name === CHATS_NEW) {
          vm.startSubscriptions(workflowId);
        } else {
          vm.clearPendingMessages();
          vm.getWorkflowById(workflowId);
        }
      });
      return;
    }
    next();
  },
  beforeRouteUpdate({ name, params }, from, next) {
    if (name === CHATS_SHOW) {
      const { workflowId } = params;
      if (this.workflowId && workflowId !== this.workflowId) {
        this.stopWorkflow(this.workflowId);
        this.clearPendingMessages();
        // Clear system context when switching to a different workflow
        this.clearSystemContextItems();
      }

      this.resetRequestError();
      this.getWorkflowById(workflowId);
    }

    next();
  },
  beforeRouteLeave(to, form, next) {
    this.resetUsageQuotaExceededMidStream();
    this.resetRequestError();
    next();
  },
  watch: {
    workflowId: {
      immediate: true,
      handler(newId) {
        if (newId) {
          // If the user attempts to stop workflow that was not created (no workflowId), it won't be stopped
          // as the current component did not have the active workflow id to send along with the stop event.
          // The workflow will be created and this watch triggered with the newly created workflowId
          // If we're in an `stopped` state, we stop the workflow once we get this new Id.
          if (this.isStopped) {
            this.stopWorkflow(newId);
            return;
          }
        }
      },
    },
    workflowStatus: {
      immediate: true,
      handler(newStatus, oldStatus) {
        // Initialize isProcessingToolApproval if workflow is RUNNING and there's a pending tool request
        if (!oldStatus && newStatus === DuoWorkflowStatus.RUNNING) {
          const lastMessage = this.messages?.[this.messages.length - 1];
          const hasPendingToolRequest =
            lastMessage?.message_type === 'request' && lastMessage?.tool_info;

          if (hasPendingToolRequest) {
            this.isProcessingToolApproval = true;
          }
        }

        // Reset isProcessingToolApproval when workflow is no longer running a tool
        if (this.isProcessingToolApproval && newStatus !== DuoWorkflowStatus.RUNNING) {
          this.isProcessingToolApproval = false;
        }

        if (isAwaitingUserInput(newStatus) || isAwaitingToolApproval(newStatus)) {
          if (this.isSocketLocked) {
            this.stopPolling();
            this.resetRequestError();
          }

          this.duoChatPerformanceMetrics.notifyCompleted();
        }

        if (this.transitionEvent !== WorkflowEvent.STOP) {
          this.transitionEvent = null;
        }
      },
    },
    requestError(error) {
      // We ignore the socket locked error to handle it more gracefully
      if (this.isSocketLocked) {
        this.setPolling();
      } else if (error) {
        const errorMessage = createErrorMessage(error);
        this.addMessageToChat(errorMessage);

        this.duoChatPerformanceMetrics.notifyError();
      }
    },
    chatMessages(chatMessages) {
      const lastUserMessageIndex = chatMessages.findLastIndex(isUserMessage);
      const incomingMessagesCount = chatMessages.slice(lastUserMessageIndex).length;

      // Notify visible progress when the client receives a non-user message.
      if (incomingMessagesCount >= 2) {
        this.duoChatPerformanceMetrics.notifyFirstVisibleProgress();
      }
    },
    $route: {
      handler() {
        this.resetUsageQuotaExceededMidStream();
      },
    },
  },
  provide() {
    return {
      renderGFM, // Provide the renderGFM function to the DuoChat component
      avatarUrl: this.userAvatarUrl,
    };
  },
  methods: {
    ...mapActions(useMainStore, [
      'openUrl',
      'openFile',
      'log',
      'startSubscriptions',
      'insertCodeSnippet',
      'copyCodeSnippet',
      'copyMessage',
      'trackFeedback',
      'trackEvent',
    ]),
    ...mapActions(useUsageQuotaStore, [
      'setUsageQuotaExceeded',
      'resetUsageQuotaExceededMidStream',
    ]),
    ...mapActions(useWorkflowStore, [
      'startWorkflow',
      'stopWorkflow',
      'interruptRunningCommand',
      'setWorkflowGoal',
      'getWorkflowById',
      'resetActiveWorkflow',
      'cancelActiveWorkflow',
      'setWorkflowLoading',
      'resumeWorkflow',
      'approveToolCall',
      'rejectToolCall',
      'rejectPlan',
      'preCreateWorkflow',
      'resetPreCreateState',
      'refetchWorkflowData',
      'removePendingMessages',
      'clearPendingMessages',
      'addMessageToChat',
      'redactMessage',
      'clearSystemContextItems',
    ]),
    ...mapActions(useAIContextStore, [
      'onContextMenuSearch',
      'onSelectContextItem',
      'onRemoveContextItem',
      'onGetContextItemContent',
      'getContextCategories',
      'clearSelectedContextItems',
    ]),
    ...mapActions(useRequestErrorStore, ['resetRequestError']),
    clearPrompt() {
      const promptEl = this.$refs.duoChat?.$refs?.prompt?.$el;
      promptEl.value = '';
    },
    handlePromptInput(event) {
      const promptValue = event.target.value;
      if (
        this.preCreateWorkflowPromise ||
        this.workflowId ||
        promptValue?.length < NUM_PROMPT_CHARS_BEFORE_PRE_CREATING_WORKFLOW
      ) {
        return;
      }

      this.preCreateWorkflow(promptValue);
    },
    stopPolling() {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    },
    setPolling() {
      this.pollInterval = setInterval(() => {
        this.refetchWorkflowData();
      }, 3000);
    },
    async sendMessage(message) {
      this.transitionEvent = WorkflowEvent.MESSAGE;

      // Capture before addMessageToChat mutates pendingMessages, which would cause
      // the isApprovingPlan computed to flip (it checks whether the last message is
      // a plan approval request, and the pending user message would displace it).
      const approvingPlan = this.isApprovingPlan;

      // TODO: Stop making the DWS return a user message after it receives confirmation
      // otherwise it leads to duplicated user messages
      if (!approvingPlan) {
        const userMessage = createUserMessage(message, this.contextSelections);
        this.addMessageToChat(userMessage);
      }

      await this.$nextTick();
      this.startSubscriptions(this.workflowId);

      if (approvingPlan) {
        this.rejectPlan(message);
        // For the flow registry path, workflowStatus stays INPUT_REQUIRED after a
        // rejection (the planner loops back and requests approval again), so the
        // workflowStatus watcher never fires and transitionEvent is never cleared.
        // Clear it manually here so the input is re-enabled immediately.
        this.transitionEvent = null;
      } else {
        this.resumeWorkflow();
      }
    },
    async onSendChatPrompt(unredactedMessage) {
      this.clearPrompt();

      if (unredactedMessage === RESET_MESSAGE || unredactedMessage === NEW_CHAT_MESSAGE) {
        this.$router.push({ name: CHATS_NEW });
        return;
      }

      const skillRewrite = rewriteSkillSlashCommand(unredactedMessage, this.slashCommands);
      const messageToRedact =
        skillRewrite ?? (unredactedMessage === SKILLS_MESSAGE ? SKILLS_PROMPT : unredactedMessage);

      const redactionResult = await this.redactMessage(messageToRedact);
      if (redactionResult.error) {
        // Since redaction failed, we don't know if the users prompt contains secrets or not.
        // So we don't submit their message to be safe.
        return;
      }
      const message = redactionResult.value;

      const newGoalContext =
        isTerminated(this.workflowStatus) && this.isFlowTab
          ? `Based on agent session ${this.workflowId}, do the following changes:`
          : '';
      // last user message in chat is set as a goal for the new or existing workflow
      this.setWorkflowGoal(newGoalContext + message);

      // when no active workflow and workflow is not being created, start workflow
      // If the status is TERMINATED, then we want to create a new flow.

      if (!this.workflowId || newGoalContext) {
        this.duoChatPerformanceMetrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        this.transitionEvent = WorkflowEvent.MESSAGE;
        this.startWorkflow();

        // For new conversations, include both user-selected context and system context
        const allContextItems = [...this.contextSelections, ...this.systemContextItems];
        this.addMessageToChat(createUserMessage(message, allContextItems));

        // Clear system context after the initial message so it's not included in continuation messages
        this.clearSystemContextItems();

        await this.$nextTick();

        return;
      }

      this.duoChatPerformanceMetrics.notifyInteraction(INTERACTION_TYPE.Continuation);

      // send a message for the active workflow
      this.sendMessage(message);
    },
    cancelChat() {
      if (this.isProcessingToolApproval) {
        // Interrupt the running command without stopping the workflow
        this.interruptRunningCommand(this.workflowId);
        this.isProcessingToolApproval = false;
        return;
      }

      this.trackEvent({
        event: 'workflow_stopped',
        context: {
          source: this.eventSource,
          workflowId: this.workflowId,
          reason: 'stop_button_click',
        },
      });
      // Stop the workflow
      this.transitionEvent = WorkflowEvent.STOP;
      this.stopWorkflow(this.workflowId);
      // reset workflow but preserve workflow ID for continuous conversation
      this.cancelActiveWorkflow();
      // resetting transitionEvent
      this.transitionEvent = null;
    },
    handleCopyCodeSnippet(event) {
      const snippet = event.detail.code;
      this.copyCodeSnippet(snippet);
    },
    handleInsertCodeSnippet(event) {
      const snippet = event.detail.code;
      this.insertCodeSnippet(snippet);
    },
    handleCopyMessage(event) {
      const message = event.detail.message;
      this.copyMessage(message);
    },
    handleLinkClick(event) {
      const { href, tagName } = event.target;

      const isLink = tagName?.toLowerCase() === 'a';

      if (!isLink) return;

      const isInternalUrl = !isExternalURL(href);

      if (isInternalUrl) return;

      event.preventDefault();
      this.openUrl(href);
    },
    handleApproveToolCall(approvalObject) {
      this.isProcessingToolApproval = true;
      this.approveToolCall(approvalObject.type, approvalObject.pattern);
      this.duoChatPerformanceMetrics.notifyInteraction(INTERACTION_TYPE.ToolApproval);
    },
    handleDenyToolCall(message) {
      this.isProcessingToolApproval = true;
      this.rejectToolCall(message);
      this.duoChatPerformanceMetrics.notifyInteraction(INTERACTION_TYPE.ToolRejection);
    },
    handleOpenFilePath(filePath) {
      this.openFile(filePath);
    },
    handleAcceptAction() {
      if (this.isApprovingPlan) {
        this.isPlanApproved = true;
      }

      this.transitionEvent = WorkflowEvent.RESUME;
      this.resumeWorkflow();
    },
  },
};
</script>
<template>
  <div class="gl-flex flex-column justify-content-end gl-flex-grow gl-overflow-auto">
    <usage-quota-alert :usage-quota-exceeded="usageQuotaExceeded && !usageQuotaExceededMidStream" />
    <div class="chat-wrapper gl-flex gl-flex-column gl-overflow-auto gl-flex-grow">
      <agentic-duo-chat
        ref="duoChat"
        :chat-state="chatState"
        :messages="messages"
        :is-chat-available="!usageQuotaExceeded"
        :is-loading="isDuoWorking"
        :can-cancel="canCancel"
        :predefined-prompts="prompts"
        :chat-prompt-placeholder="chatPromptPlaceholder"
        :enable-code-insertion="true"
        :should-render-resizable="false"
        :with-feedback="false"
        :show-header="true"
        :slash-commands="slashCommands"
        error=""
        :tool-name="toolName"
        :is-tool-approval-processing="isProcessingToolApproval"
        :working-directory="projectPath"
        :empty-state-title="emptyStateTitle"
        class="gl-overflow-auto gl-w-full"
        @send-chat-prompt="onSendChatPrompt"
        @chat-cancel="cancelChat"
        @insert-code-snippet="handleInsertCodeSnippet"
        @copy-code-snippet="handleCopyCodeSnippet"
        @get-context-item-content="onGetContextItemContent"
        @track-feedback="trackFeedback"
        @open-file-path="handleOpenFilePath"
        @approve-tool="handleApproveToolCall"
        @deny-tool="handleDenyToolCall"
        @copy-message="handleCopyMessage"
      >
        <template
          v-if="pinnedContextEnabled"
          #context-items-menu="{ isOpen, onClose, setRef, focusPrompt }"
        >
          <duo-chat-context-item-menu
            :ref="setRef"
            :open="isOpen"
            :selections="contextSelections"
            :categories="contextMenuCategories"
            :loading="contextMenuIsLoading"
            :error="contextMenuError"
            :results="contextSearchResults"
            @search="onContextMenuSearch"
            @select="onSelectContextItem"
            @remove="onRemoveContextItem"
            @close="onClose"
            @focus-prompt="focusPrompt"
            @get-context-item-content="onGetContextItemContent"
          />
        </template>
        <template #footer-panel>
          <usage-quota-alert :usage-quota-exceeded="usageQuotaExceededMidStream" :inline="true" />

          <plan-panel
            :workflow-status="workflowStatus"
            :plan-steps="steps"
            :is-plan-approved="isPlanApproved"
            :is-approving-plan="isApprovingPlan"
          />
        </template>
        <template v-if="showChatActions" #footer-actions>
          <workflow-actions
            :is-approving-plan="isApprovingPlan"
            :is-sending-event="isSendingEvent"
            @accept-action="handleAcceptAction"
          />
        </template>
      </agentic-duo-chat>
    </div>
    <chat-recent-chats />
  </div>
</template>
