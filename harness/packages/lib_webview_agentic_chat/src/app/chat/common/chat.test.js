import { nextTick } from 'vue';
import { shallowMount, mount } from '@vue/test-utils';
import { AgenticDuoChat, DuoChatContextItemMenu } from '@gitlab/duo-ui';
import { createTestingPinia } from '@pinia/testing';
import { WorkflowEvent, DuoWorkflowStatus, WorkflowStatusCode } from '@gitlab-lsp/workflow-api';
import { useWorkflowStore } from '../stores/workflow';
import { useMainStore } from '../stores/main';
import { useUserStore } from '../stores/user';
import { useRequestErrorStore } from '../stores/request_error';
import { useAIContextStore } from '../stores/ai_context';
import { useChatAvailableModelsStore } from '../stores/chat_available_models';
import { useAgentStore } from '../stores/agents';
import { useUsageQuotaStore } from '../stores/usage_quota';
import { isExternalURL } from '../utils/url_utils';
import { mockWorkflowStoreEvents } from '../../test_utils/mock_workflow_store_plugin';
import { CHATS_NEW, CHATS_SHOW } from '../routes/constants.ts';
import { INTERACTION_TYPE, DuoChatPerformanceMetrics } from '../utils/duo_chat_performance_metrics';
import { CHAT_MODE, FLOW_MODE } from '../constants.ts';
import AgenticChat, {
  RESET_MESSAGE,
  NEW_CHAT_MESSAGE,
  SKILLS_MESSAGE,
  SKILLS_PROMPT,
  rewriteSkillSlashCommand,
} from './chat.vue';
import ChatRecentChats from './chat_recent_chats.vue';
import WorkflowActions from './components/workflow_actions.vue';
import PlanPanel from './components/plan_panel.vue';
import UsageQuotaAlert from './components/usage_quota_alert.vue';

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

let wrapper;
let workflowStore;
let mainStore;
let userStore;
let requestErrorStore;
let aiContextStore;
let chatAvailableModelsStore;
let agentStore;
let routerPush;

jest.mock('../utils/render_gfm', () => ({
  __esModule: true,
  default: jest.fn(() => ''),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid'),
}));

jest.mock('../utils/url_utils.js');

jest.mock('../utils/duo_chat_performance_metrics', () => {
  class DuoChatPerformanceMetricsMock {
    static instance;

    constructor() {
      this.constructor.instance = this;
    }

    notifyInteraction = jest.fn();

    notifyFirstVisibleProgress = jest.fn();

    notifyCompleted = jest.fn();

    notifyError = jest.fn();

    onMarkReported = jest.fn();

    onMetricReported = jest.fn();

    dispose = jest.fn();

    reset = jest.fn();

    getCurrentState = jest.fn();
  }

  return {
    DuoChatPerformanceMetrics: DuoChatPerformanceMetricsMock,
    INTERACTION_TYPE: {
      InitialRequest: 'initial_request',
      Continuation: 'continuation',
      ToolApproval: 'tool_approval',
      ToolRejection: 'tool_rejection',
      PlanApproval: 'plan_approval',
    },
    displayPerformanceMark: jest.fn((mark) => `[mark] ${mark.name}`),
    displayPerformanceMetric: jest.fn((metric) => `[metric] ${metric.name}`),
  };
});

const createComponent = ({ workflowState = {}, mountFn = shallowMount } = {}) => {
  routerPush = jest.fn();
  const pinia = createTestingPinia({
    stubActions: false,
    initialState: {
      workflow: workflowState,
    },
  });

  pinia.use(mockWorkflowStoreEvents);

  workflowStore = useWorkflowStore();
  mainStore = useMainStore();
  userStore = useUserStore();
  requestErrorStore = useRequestErrorStore();
  aiContextStore = useAIContextStore();
  chatAvailableModelsStore = useChatAvailableModelsStore();
  agentStore = useAgentStore();

  jest.spyOn(workflowStore, 'redactMessage').mockImplementation(async (message) => {
    return { value: message };
  });

  wrapper = mountFn(AgenticChat, {
    pinia,
    stubs: {
      AgenticDuoChat,
      DuoChatContextItemMenu,
      ChatRecentChats,
      WorkflowActions,
      PlanPanel,
      UsageQuotaAlert,
    },
    mocks: {
      $router: {
        push: routerPush,
      },
    },
  });
};

const findDuoChat = () => wrapper.findComponent(AgenticDuoChat);
const findContextMenu = () => wrapper.findComponent(DuoChatContextItemMenu);
const getChatPlaceholder = () => findDuoChat().props('chatPromptPlaceholder');
const triggerPromptInput = (value) => wrapper.vm.handlePromptInput({ target: { value } });
const sendMessage = async (message) => {
  findDuoChat().vm.$emit('send-chat-prompt', message);
  await nextTick();
};
const findActions = () => wrapper.findComponent(WorkflowActions);

describe('Agentic Chat component', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    createComponent();
  });

  it('renders AgenticDuoChat', () => {
    expect(wrapper.findComponent(AgenticDuoChat).exists()).toBe(true);
  });

  it('calls getContextCategories on mount', () => {
    expect(aiContextStore.getContextCategories).toHaveBeenCalled();
  });

  it('provides avatarUrl to the underlying components', async () => {
    userStore.setUserInfo({
      avatarUrl: 'foo.bar.com/avatar.jpg',
    });
    await nextTick();

    const providedData = wrapper.vm.$options.provide.call(wrapper.vm);
    expect(providedData.avatarUrl).toBe('foo.bar.com/avatar.jpg');
  });

  describe('Submitting prompt', () => {
    const message = 'Hello!';

    it('uses createUserMessage from helpers to create user messages', async () => {
      await sendMessage(message);

      expect(findDuoChat().props('messages')).toEqual([
        expect.objectContaining({
          content: message,
        }),
      ]);
    });

    it('adds user message to pending list when sending a message', async () => {
      await sendMessage(message);

      // Check that a message with this content was added to pending messages
      expect(wrapper.vm.pendingMessages.some((msg) => msg.content === message)).toBe(true);
    });

    it('handles RESET_MESSAGE by navigating to /chats/new', async () => {
      await sendMessage(RESET_MESSAGE);

      expect(routerPush).toHaveBeenCalledWith({ name: CHATS_NEW });
    });

    it('handles NEW_CHAT_MESSAGE by navigating to /chats/new', async () => {
      // Spy on the setView action that should be called
      await sendMessage(NEW_CHAT_MESSAGE);

      expect(routerPush).toHaveBeenCalledWith({ name: CHATS_NEW });
    });

    it('replaces /skills with a natural language prompt', async () => {
      await sendMessage(SKILLS_MESSAGE);

      expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith(SKILLS_PROMPT);
    });

    it('calls startWorkflow if no workflowId and not creating one', async () => {
      await sendMessage(message);

      expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith(message);
      expect(workflowStore.startWorkflow).toHaveBeenCalled();
    });

    it('calls sendMessage if workflow exists', async () => {
      workflowStore.setWorkflowId('workflow-123');
      await sendMessage(message);

      expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith(message);
    });

    describe('when flow is terminated', () => {
      const workflowId = 'workflow-456';

      beforeEach(() => {
        workflowStore.setWorkflowId(workflowId);
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.FINISHED);
      });

      describe('and in the flow mode', () => {
        beforeEach(() => {
          mainStore.mode = FLOW_MODE;
        });

        it('passes additional session context to workflow goal', async () => {
          await sendMessage(message);

          expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith(
            `Based on agent session ${workflowId}, do the following changes:${message}`,
          );
          expect(workflowStore.startWorkflow).toHaveBeenCalled();
        });
      });

      describe('and in the chat mode', () => {
        beforeEach(() => {
          mainStore.mode = CHAT_MODE;
        });

        it('does not pass additional context', async () => {
          await sendMessage(message);

          expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith(message);
          expect(workflowStore.startWorkflow).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Secret redaction during prompt submission', () => {
    describe('when redaction succeeds', () => {
      beforeEach(() => {
        createComponent();
        jest.spyOn(workflowStore, 'redactMessage').mockResolvedValue({ value: 'redacted content' });
      });

      it('proceeds with workflow', async () => {
        const originalMessage = 'Message with secrets';

        await sendMessage(originalMessage);

        expect(workflowStore.redactMessage).toHaveBeenCalledWith(originalMessage);
        expect(workflowStore.setWorkflowGoal).toHaveBeenCalledWith('redacted content');
        expect(workflowStore.startWorkflow).toHaveBeenCalled();
      });
    });

    describe('when redaction fails', () => {
      beforeEach(() => {
        createComponent();
        jest.spyOn(workflowStore, 'redactMessage').mockResolvedValue({
          error: 'Redaction service unavailable',
        });
      });

      it('blocks message sending and does not start workflow', async () => {
        const originalMessage = 'Message with secrets';

        await sendMessage(originalMessage);

        expect(workflowStore.redactMessage).toHaveBeenCalledWith(originalMessage);
        expect(workflowStore.setWorkflowGoal).not.toHaveBeenCalled();
        expect(workflowStore.startWorkflow).not.toHaveBeenCalled();
      });
    });
  });

  describe('Prompt placeholder', () => {
    it('returns one of the initial placeholders for default state', async () => {
      const placeholder = getChatPlaceholder();
      expect(['Have a question?', 'Need help with a task?']).toContain(placeholder);
    });

    it('returns thinking state placeholder when Duo is working', async () => {
      await sendMessage('hello');

      expect(getChatPlaceholder()).toBe('GitLab Duo is working on your request. Please wait.');
    });

    it('returns next task placeholder when workflow exists and Duo is not working', async () => {
      createComponent();
      workflowStore.setWorkflowId('wf-123');
      workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
      await nextTick();
      expect(getChatPlaceholder()).toBe('What should we work on next?');
    });
  });

  describe('On chat stop', () => {
    const workflowId = '123';

    it.each`
      mode           | expectedSource
      ${'chat-mode'} | ${'chat'}
      ${'flow-mode'} | ${'flows'}
    `(
      'tracks stop button click with source=$expectedSource when mode=$mode',
      async ({ mode, expectedSource }) => {
        createComponent();
        mainStore.setMode(mode);
        workflowStore.setWorkflowId(workflowId);
        await nextTick();

        findDuoChat().vm.$emit('chat-cancel');

        expect(mainStore.trackEvent).toHaveBeenCalledWith({
          event: 'workflow_stopped',
          context: {
            source: expectedSource,
            workflowId,
            reason: 'stop_button_click',
          },
        });
      },
    );

    it('stops workflow with workflowId and does not reset current active workflow', async () => {
      workflowStore.setWorkflowId(workflowId);
      findDuoChat().vm.$emit('chat-cancel');

      expect(workflowStore.stopWorkflow).toHaveBeenCalledWith(workflowId);
      expect(workflowStore.resetActiveWorkflow).not.toHaveBeenCalled();
    });

    it('moves current chat to history and resets outgoing messages', async () => {
      expect(wrapper.vm.pendingMessages).toEqual([]);
    });

    describe('when a tool is being processed', () => {
      beforeEach(async () => {
        workflowStore.setWorkflowId(workflowId);
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
        wrapper.setData({ isProcessingToolApproval: true });
        await nextTick();
      });

      it('interrupts the running command instead of stopping the workflow', () => {
        findDuoChat().vm.$emit('chat-cancel');

        expect(workflowStore.interruptRunningCommand).toHaveBeenCalledWith(workflowId);
        expect(workflowStore.stopWorkflow).not.toHaveBeenCalled();
      });

      it('resets isProcessingToolApproval', () => {
        findDuoChat().vm.$emit('chat-cancel');

        expect(wrapper.vm.isProcessingToolApproval).toBe(false);
      });

      it('does not call cancelActiveWorkflow', () => {
        findDuoChat().vm.$emit('chat-cancel');

        expect(workflowStore.cancelActiveWorkflow).not.toHaveBeenCalled();
      });
    });
  });

  describe('On copy snippet event', () => {
    const codeSnippet = 'hi!';
    let copyCodeSnippetSpy;

    beforeEach(() => {
      copyCodeSnippetSpy = jest.spyOn(mainStore, 'copyCodeSnippet');
      findDuoChat().vm.$emit('copy-code-snippet', { detail: { code: codeSnippet } });
    });

    it('uses store to notify the plugin', async () => {
      expect(copyCodeSnippetSpy).toHaveBeenCalledWith(codeSnippet);
    });
  });

  describe('On insert code snippet event', () => {
    const codeSnippet = 'hi there!';
    let insertCodeSnippetSpy;

    beforeEach(() => {
      insertCodeSnippetSpy = jest.spyOn(mainStore, 'insertCodeSnippet');
      findDuoChat().vm.$emit('insert-code-snippet', { detail: { code: codeSnippet } });
    });

    it('uses store to notify the plugin', async () => {
      expect(insertCodeSnippetSpy).toHaveBeenCalledWith(codeSnippet);
    });
  });

  describe('On copy message event', () => {
    const message = 'One morning, when Gregor Samsa woke from troubled dreams';
    let copyMessageSpy;

    beforeEach(() => {
      copyMessageSpy = jest.spyOn(mainStore, 'copyMessage');
      findDuoChat().vm.$emit('copy-message', { detail: { message } });
    });

    it('uses store to notify the plugin', async () => {
      expect(copyMessageSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('On link click', () => {
    let openUrlSpy;

    beforeEach(() => {
      openUrlSpy = jest.spyOn(mainStore, 'openUrl');
    });

    it('opens URLs when external link is clicked', () => {
      jest.mocked(isExternalURL).mockReturnValue(true);

      const url = 'https://gitlab.com/example';
      const mockEvent = {
        target: {
          tagName: 'a',
          href: url,
        },
        preventDefault: jest.fn(),
      };

      wrapper.vm.handleLinkClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(openUrlSpy).toHaveBeenCalledWith(url);
    });

    it('does not open URLs when internal link is clicked', () => {
      jest.mocked(isExternalURL).mockReturnValue(false);

      const url = '/internal/path';
      const mockEvent = {
        target: {
          tagName: 'a',
          href: url,
        },
        preventDefault: jest.fn(),
      };

      wrapper.vm.handleLinkClick(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(openUrlSpy).not.toHaveBeenCalled();
    });

    it('does not handle clicks on non-link elements', () => {
      const mockEvent = {
        target: {
          tagName: 'DIV',
        },
        preventDefault: jest.fn(),
      };

      wrapper.vm.handleLinkClick(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(openUrlSpy).not.toHaveBeenCalled();
    });
  });

  describe('When Duo is working', () => {
    beforeEach(() => {
      createComponent();
    });

    it.each`
      workflowId      | needsInput                          | transitionEvent          | expected
      ${'workflow-1'} | ${DuoWorkflowStatus.RUNNING}        | ${null}                  | ${true}
      ${'workflow-1'} | ${DuoWorkflowStatus.INPUT_REQUIRED} | ${null}                  | ${false}
      ${null}         | ${DuoWorkflowStatus.RUNNING}        | ${WorkflowEvent.MESSAGE} | ${true}
      ${null}         | ${DuoWorkflowStatus.RUNNING}        | ${null}                  | ${false}
      ${null}         | ${DuoWorkflowStatus.FAILED}         | ${null}                  | ${false}
      ${null}         | ${DuoWorkflowStatus.FINISHED}       | ${null}                  | ${false}
      ${null}         | ${DuoWorkflowStatus.STOPPED}        | ${null}                  | ${false}
    `(
      'returns $expected when workflowId=$workflowId, needsInput=$needsInput, transitionEvent=$transitionEvent',
      async ({ workflowId, needsInput, transitionEvent, expected }) => {
        workflowStore.setWorkflowId(workflowId);
        workflowStore.setWorkflowStatus(needsInput);
        await nextTick();
        wrapper.setData({
          transitionEvent,
        });
        await nextTick();
        expect(findDuoChat().props('isLoading')).toBe(expected);
      },
    );
  });

  describe('Can cancel chat', () => {
    beforeEach(() => {
      createComponent();
    });

    it.each`
      workflowStatus                      | expected
      ${undefined}                        | ${false}
      ${DuoWorkflowStatus.CREATED}        | ${true}
      ${DuoWorkflowStatus.RUNNING}        | ${true}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${true}
      ${DuoWorkflowStatus.TOOL_APPROVAL}  | ${false}
      ${DuoWorkflowStatus.RUNNING}        | ${true}
      ${DuoWorkflowStatus.FAILED}         | ${true}
      ${DuoWorkflowStatus.FINISHED}       | ${true}
      ${DuoWorkflowStatus.STOPPED}        | ${true}
    `('when workflowStatus=$expected canCancel=$expects', async ({ workflowStatus, expected }) => {
      workflowStore.setWorkflowStatus(workflowStatus);
      await nextTick();
      expect(findDuoChat().props('canCancel')).toBe(expected);
    });
  });

  describe('Message sending flow', () => {
    beforeEach(() => {
      createComponent();
      workflowStore.setWorkflowId('workflow-123');
      jest.clearAllMocks();
    });

    it('sets sending state during message send process', async () => {
      const message = 'some message';

      // Start send process
      await sendMessage(message);

      // Should have proper sequence of sending states
      expect(findDuoChat().props('messages')).toEqual([
        expect.objectContaining({
          content: message,
        }),
      ]);
      expect(workflowStore.resumeWorkflow).toHaveBeenCalled();
      expect(findDuoChat().props('isLoading')).toBe(true);
    });
  });

  describe('Error handling', () => {
    describe('when requestError is set', () => {
      const error = { message: 'API error', code: 500 };

      beforeEach(async () => {
        requestErrorStore.setRequestError(error);
        await nextTick();
      });

      it('adds error message to chat', () => {
        expect(findDuoChat().props('messages')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              errors: [error.message],
            }),
          ]),
        );
      });

      it('does not pass the error to chatState reason', () => {
        expect(findDuoChat().props('chatState').reason).toBeNull();
      });
    });

    describe('when socket is locked', () => {
      const error = { message: 'Socket locked', statusCode: WorkflowStatusCode.LOCKED_SOCKET };

      beforeEach(async () => {
        requestErrorStore.setRequestError(error);
        await nextTick();
      });

      it('passes the error to chatState reason', () => {
        expect(findDuoChat().props('chatState').reason).toBe(error.message);
      });

      it('disables chat input', () => {
        expect(findDuoChat().props('chatState').isEnabled).toBe(false);
      });

      it('sets canDismiss to false', () => {
        expect(findDuoChat().props('chatState').canDismiss).toBe(false);
      });

      it('does not add error message to chat', () => {
        expect(findDuoChat().props('messages')).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              errors: [error.message],
            }),
          ]),
        );
      });
    });
  });

  describe('when rendering the slash command menu', () => {
    describe('and categories are NOT available', () => {
      it('does not render context menu', async () => {
        aiContextStore.setContextCategoriesResult([]);
        await nextTick();
        expect(findContextMenu().exists()).toBe(false);
      });
    });

    describe('and categories are available', () => {
      beforeEach(() => {
        aiContextStore.setContextCategoriesResult(['file', 'issue', 'merge_request']);
      });

      it('renders context menu', async () => {
        expect(findContextMenu().exists()).toBe(true);
      });

      it('passes correct props to context menu', () => {
        const contextMenu = findContextMenu();
        expect(contextMenu.props('selections')).toEqual(aiContextStore.contextSelections);
        expect(contextMenu.props('categories')).toEqual(aiContextStore.contextMenuCategories);
        expect(contextMenu.props('loading')).toBe(aiContextStore.contextMenuIsLoading);
        expect(contextMenu.props('error')).toBe(aiContextStore.contextMenuError);
        expect(contextMenu.props('results')).toEqual(aiContextStore.contextSearchResults);
      });

      it('maps context categories with display properties', () => {
        const contextMenu = findContextMenu();
        const categories = contextMenu.props('categories');

        expect(categories).toEqual([
          { label: 'Files', value: 'file', icon: 'document' },
          { label: 'Issues', value: 'issue', icon: 'issues' },
          { label: 'Merge Requests', value: 'merge_request', icon: 'merge-request' },
        ]);
      });

      describe('when there are context item selections', () => {
        const contextItems = [{ id: '1' }, { id: '2' }, { id: '3' }];
        beforeEach(async () => {
          aiContextStore.setContextCurrentItemsResult(contextItems);
          await nextTick();
        });

        it('shows selections in context menu', () => {
          expect(findContextMenu().props('selections')).toBe(contextItems);
        });

        it('passes context selections with user message', async () => {
          const message = 'Hello with context!';
          await sendMessage(message);

          const messages = findDuoChat().props('messages');
          expect(messages[0]).toEqual(
            expect.objectContaining({
              content: message,
              extras: {
                contextItems,
              },
            }),
          );
        });
      });

      describe('when searching', () => {
        const query = { category: 'file', query: 'test search' };
        let onContextMenuSearchSpy;

        beforeEach(() => {
          onContextMenuSearchSpy = jest.spyOn(aiContextStore, 'onContextMenuSearch');
          findContextMenu().vm.$emit('search', query);
        });

        it('calls onContextMenuSearch action', () => {
          expect(onContextMenuSearchSpy).toHaveBeenCalledWith(query);
        });

        it('sets loading state when searching', async () => {
          expect(findContextMenu().props('loading')).toBe(true);
        });

        describe('when search results are returned', () => {
          const searchResults = [
            { id: '1', title: 'File 1' },
            { id: '2', title: 'File 2' },
          ];

          beforeEach(async () => {
            aiContextStore.setContextItemSearchResult({ results: searchResults });
            await nextTick();
          });

          it('displays search results in context menu', () => {
            expect(findContextMenu().props('results')).toEqual(searchResults);
            expect(findContextMenu().props('loading')).toBe(false);
          });
        });

        describe('when search returns an error', () => {
          const errorMessage = 'Search failed';

          beforeEach(async () => {
            aiContextStore.setContextItemSearchResult({ results: [], errorMessage });
            await nextTick();
          });

          it('displays error in context menu', () => {
            expect(findContextMenu().props('error')).toBe(errorMessage);
            expect(findContextMenu().props('loading')).toBe(false);
          });
        });
      });

      describe('when selecting a context item', () => {
        const item = { id: '1' };
        let onSelectContextItemSpy;

        beforeEach(() => {
          onSelectContextItemSpy = jest.spyOn(aiContextStore, 'onSelectContextItem');
          findContextMenu().vm.$emit('select', item);
        });

        it('calls onSelectContextItem action', () => {
          expect(onSelectContextItemSpy).toHaveBeenCalledWith(item);
        });
      });

      describe('when removing a context item', () => {
        const item = { id: '1' };
        let onRemoveContextItemSpy;

        beforeEach(() => {
          onRemoveContextItemSpy = jest.spyOn(aiContextStore, 'onRemoveContextItem');
          findContextMenu().vm.$emit('remove', item);
        });

        it('calls onRemoveContextItem action', () => {
          expect(onRemoveContextItemSpy).toHaveBeenCalledWith(item);
        });
      });

      describe('when getting context item content', () => {
        const contextItem = { id: '1' };
        const messageId = 'msg-123';
        let onGetContextItemContentSpy;

        beforeEach(() => {
          onGetContextItemContentSpy = jest.spyOn(aiContextStore, 'onGetContextItemContent');
          findContextMenu().vm.$emit('get-context-item-content', { contextItem, messageId });
        });

        it('calls onGetContextItemContent action', () => {
          expect(onGetContextItemContentSpy).toHaveBeenCalledWith({ contextItem, messageId });
        });
      });
    });
  });

  describe('Inline tool approval', () => {
    beforeEach(() => {
      workflowStore.setWorkflowId('workflow-123');
      workflowStore.setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);
    });

    describe('when workflow status is awaiting tool approval', () => {
      it('passes isToolApprovalProcessing prop to AgenticDuoChat', () => {
        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(false);
      });

      it('sets isProcessingToolApproval to true when processing approval', async () => {
        wrapper.setData({ isProcessingToolApproval: true });
        await nextTick();
        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(true);
      });
    });

    describe('when user approves tool call', () => {
      let approveToolCallSpy;

      beforeEach(() => {
        approveToolCallSpy = jest.spyOn(workflowStore, 'approveToolCall');
        findDuoChat().vm.$emit('approve-tool', { type: 'approve-for-session' });
      });

      it('calls approveToolCall action', () => {
        expect(approveToolCallSpy).toHaveBeenCalled();
      });

      it('sets isProcessingToolApproval to true during approval', () => {
        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
      });
    });

    describe('when user denies tool call', () => {
      let rejectToolCallSpy;
      const denyMessage = 'I do not approve this tool call';

      beforeEach(() => {
        rejectToolCallSpy = jest.spyOn(workflowStore, 'rejectToolCall');
        findDuoChat().vm.$emit('deny-tool', denyMessage);
      });

      it('calls rejectToolCall action with message', () => {
        expect(rejectToolCallSpy).toHaveBeenCalledWith(denyMessage);
      });

      it('sets isProcessingToolApproval to true during rejection', () => {
        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
      });
    });

    describe('when workflow status changes from tool approval to another state', () => {
      beforeEach(async () => {
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.TOOL_APPROVAL);
        wrapper.setData({ isProcessingToolApproval: true });
        await nextTick();
      });

      it('keeps isProcessingToolApproval true when status changes to RUNNING', async () => {
        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(true);

        workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
        await nextTick();

        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(true);
      });

      it('resets isProcessingToolApproval to false when status changes to non-RUNNING state', async () => {
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
        await nextTick();

        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(true);

        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
        await nextTick();

        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(false);
      });
    });

    describe('when navigating to workflow with RUNNING status and pending tool request', () => {
      it('initializes isProcessingToolApproval to true', async () => {
        createComponent({
          workflowState: {
            activeWorkflow: {
              id: 'workflow-123',
              status: DuoWorkflowStatus.RUNNING,
              checkpoint: {
                channel_values: {
                  ui_chat_log: [
                    {
                      message_type: 'request',
                      tool_info: { name: 'run_command' },
                      content: 'Tool requires approval',
                      timestamp: new Date().toISOString(),
                    },
                  ],
                },
              },
            },
          },
        });

        await nextTick();

        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(true);
      });

      it('does not initialize isProcessingToolApproval if no pending tool request', async () => {
        createComponent({
          workflowState: {
            activeWorkflow: {
              id: 'workflow-123',
              status: DuoWorkflowStatus.RUNNING,
              checkpoint: {
                channel_values: {
                  ui_chat_log: [
                    {
                      message_type: 'agent',
                      content: 'Regular message',
                      timestamp: new Date().toISOString(),
                    },
                  ],
                },
              },
            },
          },
        });

        await nextTick();

        expect(findDuoChat().props('isToolApprovalProcessing')).toBe(false);
      });
    });

    describe('when workflow status changes between different tool approval states', () => {
      it('resets isProcessingToolApproval when status changes to non-RUNNING state', async () => {
        createComponent();
        wrapper.setData({ isProcessingToolApproval: true });
        await nextTick();

        // Change to a non-RUNNING status
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
        await nextTick();

        expect(wrapper.vm.isProcessingToolApproval).toBe(false);
      });
    });

    describe('handleApproveToolCall method', () => {
      it('exists and is callable', () => {
        expect(typeof wrapper.vm.handleApproveToolCall).toBe('function');
      });

      it('sets processing state and calls store action', () => {
        const approveToolCallSpy = jest.spyOn(workflowStore, 'approveToolCall');

        wrapper.vm.handleApproveToolCall({ type: 'approve-for-session' });

        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
        expect(approveToolCallSpy).toHaveBeenCalled();
      });
    });

    describe('handleDenyToolCall method', () => {
      it('exists and is callable', () => {
        expect(typeof wrapper.vm.handleDenyToolCall).toBe('function');
      });

      it('sets processing state and calls store action with message', () => {
        const rejectToolCallSpy = jest.spyOn(workflowStore, 'rejectToolCall');
        const message = 'Tool call denied';

        wrapper.vm.handleDenyToolCall(message);

        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
        expect(rejectToolCallSpy).toHaveBeenCalledWith(message);
      });
    });

    describe('integration with AgenticDuoChat component', () => {
      it('connects approve-tool event to handleApproveToolCall', () => {
        const approveToolCallSpy = jest.spyOn(workflowStore, 'approveToolCall');

        findDuoChat().vm.$emit('approve-tool', { type: 'approve-for-session' });

        expect(approveToolCallSpy).toHaveBeenCalled();
        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
      });

      it('connects deny-tool event to handleDenyToolCall', () => {
        const rejectToolCallSpy = jest.spyOn(workflowStore, 'rejectToolCall');
        const message = 'Denied';

        findDuoChat().vm.$emit('deny-tool', message);

        expect(rejectToolCallSpy).toHaveBeenCalledWith(message);
        expect(wrapper.vm.isProcessingToolApproval).toBe(true);
      });
    });
  });

  describe('workflow pre-creation', () => {
    describe('when the user enters a prompt', () => {
      describe('and the prompt is less than 3 characters', () => {
        it('does not pre-create workflow', () => {
          triggerPromptInput('Hi');

          expect(workflowStore.preCreateWorkflow).not.toHaveBeenCalled();
        });
      });

      describe('and the prompt is 3+ characters', () => {
        it('pre-creates workflow', () => {
          triggerPromptInput('Fix this bug');

          expect(workflowStore.preCreateWorkflow).toHaveBeenCalledWith('Fix this bug');
        });

        describe('and the there is already an existign workflow', () => {
          beforeEach(() => {
            workflowStore.activeWorkflow.id = 'existing-workflow-id';
          });

          it('does not pre-create workflow', () => {
            triggerPromptInput('Fix this bug');

            expect(workflowStore.preCreateWorkflow).not.toHaveBeenCalled();
          });
        });

        describe('and the workflow has already been pre-created', () => {
          beforeEach(() => {
            workflowStore.preCreateWorkflowPromise = Promise.resolve(
              'existing-pre-create-workflow-promise',
            );
          });

          it('does not pre-create workflow', () => {
            triggerPromptInput('Fix this bug');

            expect(workflowStore.preCreateWorkflow).not.toHaveBeenCalled();
          });
        });
      });
    });

    describe('when starting a workflow', () => {
      describe('and a pre-created workflow is available', () => {
        beforeEach(() => {
          workflowStore.preCreateWorkflowPromise = Promise.resolve('pre-created-123');
        });

        it('uses the pre-created workflow', async () => {
          const message = 'Fix this bug';
          await sendMessage(message);

          expect(workflowStore.startWorkflow).toHaveBeenCalled();
        });
      });

      describe('when sending a message', () => {
        it('clears prompt after sending', async () => {
          const clearPromptSpy = jest.spyOn(wrapper.vm, 'clearPrompt');

          await sendMessage('Test message');

          expect(clearPromptSpy).toHaveBeenCalled();
        });
      });
    });
  });

  describe('Duo is working text', () => {
    beforeEach(() => {
      workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
    });

    describe('when in the flow tab', () => {
      beforeEach(() => {
        mainStore.mode = FLOW_MODE;
      });

      it('passes the Duo Software Developer toolName to Duo Chat', () => {
        expect(findDuoChat().props().toolName).toBe('Duo Software Developer');
      });
    });

    describe('when in the chat tab', () => {
      beforeEach(() => {
        mainStore.mode = CHAT_MODE;
      });

      it('passes GitLab Duo Agentic Chat toolName to Duo Chat', () => {
        expect(findDuoChat().props().toolName).toBe('GitLab Duo Agentic Chat');
      });
    });
  });

  describe('predefined prompts', () => {
    it('renders predefined prompts', () => {
      expect(findDuoChat().props('predefinedPrompts')).toHaveLength(4);
    });
  });

  describe('navigation guards', () => {
    describe('beforeRouteEnter', () => {
      let mockNext;
      let mockVm;

      beforeEach(() => {
        mockNext = jest.fn();
        mockVm = {
          startSubscriptions: jest.fn(),
          getWorkflowById: jest.fn(),
          stopWorkflow: jest.fn(),
          clearSystemContextItems: jest.fn(),
          workflowId: 'existing-workflow-id',
          transitionEvent: null,
          clearPendingMessages: jest.fn(),
        };
      });

      describe('when navigating to CHATS_NEW', () => {
        const toRoute = { name: CHATS_NEW };
        const fromRoute = { name: 'some-other-route' };

        it('stops workflow and resets workflow store', () => {
          const component = AgenticChat;
          component.beforeRouteEnter(toRoute, fromRoute, mockNext);

          expect(mockNext).toHaveBeenCalledWith(expect.any(Function));

          // Execute the callback passed to next()
          const callback = mockNext.mock.calls[0][0];
          callback(mockVm);

          expect(mockVm.stopWorkflow).toHaveBeenCalledWith('existing-workflow-id');
          expect(mockVm.transitionEvent).toBe(WorkflowEvent.STOP);
          expect(mockVm.clearSystemContextItems).toHaveBeenCalled();
        });
      });

      describe('when navigating to CHATS_SHOW', () => {
        const toRoute = { name: CHATS_SHOW, params: { workflowId: 'test-workflow-id' } };

        describe('when coming from CHATS_NEW', () => {
          const fromRoute = { name: CHATS_NEW };

          it('calls startSubscriptions with workflowId', () => {
            const component = AgenticChat;
            component.beforeRouteEnter(toRoute, fromRoute, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Function));

            // Execute the callback passed to next()
            const callback = mockNext.mock.calls[0][0];
            callback(mockVm);

            expect(mockVm.startSubscriptions).toHaveBeenCalledWith('test-workflow-id');
            expect(mockVm.getWorkflowById).not.toHaveBeenCalled();
          });
        });

        describe('when coming from a different route', () => {
          const fromRoute = { name: 'some-other-route' };

          it('calls getWorkflowById with workflowId and clears pending messages', () => {
            const component = AgenticChat;
            component.beforeRouteEnter(toRoute, fromRoute, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Function));

            // Execute the callback passed to next()
            const callback = mockNext.mock.calls[0][0];
            callback(mockVm);

            expect(mockVm.clearPendingMessages).toHaveBeenCalled();
            expect(mockVm.getWorkflowById).toHaveBeenCalledWith('test-workflow-id');
            expect(mockVm.startSubscriptions).not.toHaveBeenCalled();
          });
        });

        describe('when switching between different workflows', () => {
          const fromRoute = { name: 'some-other-route' };

          it('stops current workflow when switching to different workflow', () => {
            const component = AgenticChat;
            component.beforeRouteEnter(toRoute, fromRoute, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Function));

            // Execute the callback passed to next()
            const callback = mockNext.mock.calls[0][0];
            callback(mockVm);

            expect(mockVm.stopWorkflow).toHaveBeenCalledWith('existing-workflow-id');
            expect(mockVm.clearPendingMessages).toHaveBeenCalled();
            expect(mockVm.getWorkflowById).toHaveBeenCalledWith('test-workflow-id');
          });
        });
      });
    });

    describe('beforeRouteUpdate', () => {
      let mockNext;

      beforeEach(() => {
        mockNext = jest.fn();
        createComponent();
        workflowStore.setWorkflowId('current-workflow-id');
      });

      describe('when navigating to CHATS_SHOW with different workflowId', () => {
        const toRoute = { name: CHATS_SHOW, params: { workflowId: 'new-workflow-id' } };
        const fromRoute = { name: 'some-other-route' };

        it('stops current workflow and gets new workflow', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteUpdate.call(component, toRoute, fromRoute, mockNext);

          expect(workflowStore.stopWorkflow).toHaveBeenCalledWith('current-workflow-id');
          expect(workflowStore.clearPendingMessages).toHaveBeenCalled();
          expect(workflowStore.getWorkflowById).toHaveBeenCalledWith('new-workflow-id');
          expect(mockNext).toHaveBeenCalled();
        });

        it('resets request error', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteUpdate.call(component, toRoute, fromRoute, mockNext);

          expect(requestErrorStore.resetRequestError).toHaveBeenCalled();
        });
      });

      describe('when navigating to same workflowId', () => {
        const toRoute = { name: CHATS_SHOW, params: { workflowId: 'current-workflow-id' } };
        const fromRoute = { name: 'some-other-route' };

        it('does not stop current workflow', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteUpdate.call(component, toRoute, fromRoute, mockNext);

          expect(workflowStore.stopWorkflow).not.toHaveBeenCalled();
          expect(workflowStore.getWorkflowById).toHaveBeenCalledWith('current-workflow-id');
          expect(mockNext).toHaveBeenCalled();
        });

        it('resets request error', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteUpdate.call(component, toRoute, fromRoute, mockNext);

          expect(requestErrorStore.resetRequestError).toHaveBeenCalled();
        });
      });
    });

    describe('beforeRouteLeave', () => {
      let mockNext;

      beforeEach(() => {
        mockNext = jest.fn();
        createComponent();
      });

      describe('when leaving the route', () => {
        const toRoute = { name: 'some-other-route' };
        const fromRoute = { name: CHATS_SHOW };

        it('resets usage quota exceeded mid stream', () => {
          const usageQuotaStore = useUsageQuotaStore();
          const resetSpy = jest.spyOn(usageQuotaStore, 'resetUsageQuotaExceededMidStream');

          const component = wrapper.vm;
          component.$options.beforeRouteLeave.call(component, toRoute, fromRoute, mockNext);

          expect(resetSpy).toHaveBeenCalled();
        });

        it('resets request error', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteLeave.call(component, toRoute, fromRoute, mockNext);

          expect(requestErrorStore.resetRequestError).toHaveBeenCalled();
        });

        it('calls next to proceed with navigation', () => {
          const component = wrapper.vm;
          component.$options.beforeRouteLeave.call(component, toRoute, fromRoute, mockNext);

          expect(mockNext).toHaveBeenCalled();
        });
      });
    });
  });

  describe('workflowId watcher', () => {
    beforeEach(() => {
      createComponent();
    });

    describe('when workflow is in stopped state and new workflowId is set', () => {
      it('stops the new workflow', async () => {
        // Set component to stopped state
        wrapper.setData({ transitionEvent: WorkflowEvent.STOP });
        await nextTick();

        // Simulate new workflowId being set
        workflowStore.setWorkflowId('new-workflow-id');
        await nextTick();

        expect(workflowStore.stopWorkflow).toHaveBeenCalledWith('new-workflow-id');
      });
    });

    describe('when workflow is not in stopped state and new workflowId is set', () => {
      it('does not stop the workflow', async () => {
        // Ensure component is not in stopped state
        wrapper.setData({ transitionEvent: null });
        await nextTick();

        // Simulate new workflowId being set
        workflowStore.setWorkflowId('new-workflow-id');
        await nextTick();

        expect(workflowStore.stopWorkflow).not.toHaveBeenCalled();
      });
    });
  });

  describe('duoChatPerformanceMetrics', () => {
    beforeEach(() => {
      createComponent();
    });

    describe('lifecycle hooks', () => {
      it('initializes duoChatPerformanceMetrics instance in created() hook', () => {
        expect(DuoChatPerformanceMetrics.instance).toBeDefined();
      });

      it('calls dispose() in beforeDestroy() hook', () => {
        wrapper.destroy();
        expect(DuoChatPerformanceMetrics.instance.dispose).toHaveBeenCalled();
      });
    });

    describe('onSendChatPrompt - notifyInteraction calls', () => {
      it('calls notifyInteraction with InitialRequest when needsInput is false', async () => {
        // Ensure needsInput is false (no workflow or not in INPUT_REQUIRED state)
        await sendMessage('Hello!');

        expect(DuoChatPerformanceMetrics.instance.notifyInteraction).toHaveBeenCalledWith(
          INTERACTION_TYPE.InitialRequest,
        );
      });

      it('calls notifyInteraction with Continuation when needsInput is true', async () => {
        // Set workflow to INPUT_REQUIRED state to make needsInput true
        workflowStore.setWorkflowId('workflow-123');
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
        await nextTick();

        await sendMessage('Continue this task');

        expect(DuoChatPerformanceMetrics.instance.notifyInteraction).toHaveBeenCalledWith(
          INTERACTION_TYPE.Continuation,
        );
      });
    });

    it('calls notifyInteraction with ToolApproval when tool is approved', () => {
      const approvalObject = { type: 'approve-for-session' };

      findDuoChat().vm.$emit('approve-tool', approvalObject);

      expect(DuoChatPerformanceMetrics.instance.notifyInteraction).toHaveBeenCalledWith(
        'tool_approval',
      );
    });

    it('calls notifyInteraction with ToolRejection when tool is rejected', () => {
      const message = 'I do not approve this tool call';

      findDuoChat().vm.$emit('deny-tool', message);

      expect(DuoChatPerformanceMetrics.instance.notifyInteraction).toHaveBeenCalledWith(
        'tool_rejection',
      );
    });

    describe('workflowStatus watcher - notifyCompleted', () => {
      it.each([
        DuoWorkflowStatus.TOOL_APPROVAL,
        DuoWorkflowStatus.PLAN_APPROVAL,
        DuoWorkflowStatus.INPUT_REQUIRED,
      ])(
        'calls notifyCompleted when workflow status changes to INPUT_REQUIRED',
        async (workflowStatus) => {
          workflowStore.setWorkflowStatus(DuoWorkflowStatus.RUNNING);
          await nextTick();

          DuoChatPerformanceMetrics.instance.notifyCompleted.mockClear();

          workflowStore.setWorkflowStatus(workflowStatus);
          await nextTick();

          expect(DuoChatPerformanceMetrics.instance.notifyCompleted).toHaveBeenCalled();
        },
      );

      it.each([DuoWorkflowStatus.FINISHED, DuoWorkflowStatus.RUNNING])(
        'does not call notifyCompleted when workflow status changes to RUNNING',
        async (workflowStatus) => {
          workflowStore.setWorkflowStatus(DuoWorkflowStatus.CREATED);
          await nextTick();

          DuoChatPerformanceMetrics.instance.notifyCompleted.mockClear();

          workflowStore.setWorkflowStatus(workflowStatus);
          await nextTick();

          expect(DuoChatPerformanceMetrics.instance.notifyCompleted).not.toHaveBeenCalled();
        },
      );
    });

    describe('requestError watcher - notifyError', () => {
      it('calls notifyError when requestError is set', async () => {
        const error = { message: 'API error', code: 500 };

        requestErrorStore.setRequestError(error);
        await nextTick();

        expect(DuoChatPerformanceMetrics.instance.notifyError).toHaveBeenCalled();
      });

      it('does not call notifyError when requestError is null', async () => {
        requestErrorStore.setRequestError(null);
        await nextTick();

        expect(DuoChatPerformanceMetrics.instance.notifyError).not.toHaveBeenCalled();
      });

      it('calls notifyError and adds error message to chat', async () => {
        const error = { message: 'Network error', code: 503 };

        requestErrorStore.setRequestError(error);
        await nextTick();

        expect(DuoChatPerformanceMetrics.instance.notifyError).toHaveBeenCalled();
        expect(findDuoChat().props('messages')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              errors: [error.message],
            }),
          ]),
        );
      });
    });

    describe('chatMessages watcher - notifyFirstVisibleProgress', () => {
      it('calls notifyFirstVisibleProgress when non-user message is received after user message', async () => {
        // Send a user message
        await sendMessage('Hello!');
        await nextTick();

        DuoChatPerformanceMetrics.instance.notifyFirstVisibleProgress.mockClear();

        // Simulate non-user message being added (incomingMessagesCount >= 2)
        workflowStore.addMessageToChat({
          id: 'msg-2',
          content: 'Assistant response',
          message_type: 'agent',
        });
        await nextTick();

        expect(DuoChatPerformanceMetrics.instance.notifyFirstVisibleProgress).toHaveBeenCalled();
      });

      it('does not call notifyFirstVisibleProgress when only user message exists', async () => {
        await sendMessage('Hello!');

        // Clear any previous calls
        DuoChatPerformanceMetrics.instance.notifyFirstVisibleProgress.mockClear();

        // No additional messages added, so watcher shouldn't trigger notifyFirstVisibleProgress
        await nextTick();

        expect(
          DuoChatPerformanceMetrics.instance.notifyFirstVisibleProgress,
        ).not.toHaveBeenCalled();
      });
    });

    describe('performance metrics callbacks', () => {
      let logSpy;
      let trackEventSpy;

      beforeEach(() => {
        logSpy = jest.spyOn(mainStore, 'log');
        trackEventSpy = jest.spyOn(mainStore, 'trackEvent');
      });

      describe('onMarkReported callback', () => {
        it('calls this.log when onMarkReported is invoked', () => {
          const mockMark = {
            name: 'test_mark',
            startTime: 100,
          };

          // Get the callback that was registered with onMarkReported
          const onMarkReportedCallback =
            DuoChatPerformanceMetrics.instance.onMarkReported.mock.calls[0][0];

          // Invoke the callback
          onMarkReportedCallback(mockMark);

          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: '[mark] test_mark',
          });
        });
      });

      describe('onMetricReported callback', () => {
        it('calls this.log with workflowId, eventSource, selectedModel, and flowConfig when onMetricReported is invoked', () => {
          const mockMetric = {
            name: 'test_metric',
            duration: 500,
            detail: {
              interactionType: 'initial_request',
            },
          };

          // Get the first callback that was registered with onMetricReported (the log callback)
          const onMetricReportedCallback =
            DuoChatPerformanceMetrics.instance.onMetricReported.mock.calls[0][0];

          // Invoke the callback
          onMetricReportedCallback(mockMetric);

          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: expect.stringContaining('[metric] test_metric'),
          });
          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: expect.stringContaining('workflowId:'),
          });
          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: expect.stringContaining('event source:'),
          });
          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: expect.stringContaining('selected model:'),
          });
          expect(logSpy).toHaveBeenCalledWith({
            level: 'info',
            message: expect.stringContaining('agent or workflow definition:'),
          });
        });

        it.each`
          mode           | expectedSource
          ${'chat-mode'} | ${'chat'}
          ${'flow-mode'} | ${'flows'}
        `(
          'calls trackEvent with source=$expectedSource, selectedModel, flowConfig, and workflowId when mode=$mode',
          async ({ mode, expectedSource }) => {
            createComponent();
            mainStore.setMode(mode);
            workflowStore.setWorkflowId('test-workflow-id');
            chatAvailableModelsStore.selectedModelRef = 'claude-3-5-sonnet';
            agentStore.workflowDefinition = 'test-flow-config';
            await nextTick();

            logSpy = jest.spyOn(mainStore, 'log');
            trackEventSpy = jest.spyOn(mainStore, 'trackEvent');

            const mockMetric = {
              name: 'duo_chat_time_to_first_token',
              duration: 1234,
              detail: {
                interactionType: 'initial_request',
              },
            };

            // Get the callback that was registered with onMetricReported
            const onMetricReportedCallback =
              DuoChatPerformanceMetrics.instance.onMetricReported.mock.calls[0][0];

            // Invoke the callback
            onMetricReportedCallback(mockMetric);

            expect(trackEventSpy).toHaveBeenCalledWith({
              event: 'duo_chat_time_to_first_token',
              context: {
                source: expectedSource,
                selectedModel: 'claude-3-5-sonnet',
                agentVersionOrWorkflowDefinition: 'test-flow-config',
                workflowId: 'test-workflow-id',
                duration: 1234,
                interactionType: 'initial_request',
              },
            });
          },
        );
      });
    });
  });

  describe('Plan refinement', () => {
    describe('when workflow status is PLAN_APPROVAL', () => {
      beforeEach(() => {
        createComponent({ mountFn: mount });
        workflowStore.setWorkflowId('workflow-123');
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.PLAN_APPROVAL);
      });

      describe('and plan is not yet approved', () => {
        it('shows refinement placeholder text', () => {
          expect(getChatPlaceholder()).toBe(
            'Ask me to refine the plan as needed before approving.',
          );
        });

        it('sets isDuoWorking to false', async () => {
          expect(findDuoChat().props('isLoading')).toBe(false);
        });
      });

      describe('and plan is approved', () => {
        beforeEach(async () => {
          await findActions().vm.$emit('accept-action');
        });

        it('does not show refinement placeholder', () => {
          expect(getChatPlaceholder()).not.toBe(
            'Ask me to refine the plan as needed before approving.',
          );
        });

        it('sets isDuoWorking to true', async () => {
          expect(findDuoChat().props('isLoading')).toBe(true);
        });
      });
    });

    describe('when sending refinement feedback', () => {
      const feedbackMessage = 'Please add error handling to step 2';

      beforeEach(() => {
        createComponent();
        workflowStore.setWorkflowId('workflow-123');
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.PLAN_APPROVAL);
      });

      describe('and workflow is in PLAN_APPROVAL status', () => {
        it('does not add user message to chat', async () => {
          const initialMessageCount = findDuoChat().props('messages').length;

          await sendMessage(feedbackMessage);

          expect(findDuoChat().props('messages').length).toBe(initialMessageCount);
        });

        it('calls rejectPlan with feedback message', async () => {
          await sendMessage(feedbackMessage);

          expect(workflowStore.rejectPlan).toHaveBeenCalledWith(feedbackMessage);
        });

        it('does not call resumeWorkflow', async () => {
          await sendMessage(feedbackMessage);

          expect(workflowStore.resumeWorkflow).not.toHaveBeenCalled();
        });

        it('starts subscriptions', async () => {
          await sendMessage(feedbackMessage);

          expect(mainStore.startSubscriptions).toHaveBeenCalledWith('workflow-123');
        });
      });
    });

    describe('when sending message in non-plan-approval state', () => {
      const message = 'Regular message';

      beforeEach(() => {
        createComponent();
        workflowStore.setWorkflowId('workflow-123');
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
      });

      it('adds user message to chat', async () => {
        await sendMessage(message);

        expect(findDuoChat().props('messages')).toEqual([
          expect.objectContaining({
            content: message,
          }),
        ]);
      });

      it('calls resumeWorkflow', async () => {
        await sendMessage(message);

        expect(workflowStore.resumeWorkflow).toHaveBeenCalled();
      });

      it('does not call rejectPlan', async () => {
        await sendMessage(message);

        expect(workflowStore.rejectPlan).not.toHaveBeenCalled();
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
    ];

    const mockUserContextItems = [
      {
        id: 'user-file-1',
        category: 'file',
        content: 'File content',
      },
    ];

    describe('when starting a new conversation', () => {
      beforeEach(() => {
        createComponent();
        workflowStore.setSystemContextItems(mockSystemContextItems);
        aiContextStore.setContextCurrentItemsResult(mockUserContextItems);
      });

      it('includes both system context and user context in initial message', async () => {
        const message = 'Hello!';
        await sendMessage(message);

        const messages = findDuoChat().props('messages');
        expect(messages[0]).toEqual(
          expect.objectContaining({
            content: message,
            extras: {
              contextItems: [...mockUserContextItems, ...mockSystemContextItems],
            },
          }),
        );
      });

      it('clears system context after sending initial message', async () => {
        const message = 'Hello!';
        await sendMessage(message);

        expect(workflowStore.clearSystemContextItems).toHaveBeenCalled();
      });
    });

    describe('when sending continuation messages', () => {
      beforeEach(() => {
        createComponent();
        workflowStore.setWorkflowId('workflow-123');
        workflowStore.setWorkflowStatus(DuoWorkflowStatus.INPUT_REQUIRED);
        workflowStore.setSystemContextItems(mockSystemContextItems);
        aiContextStore.setContextCurrentItemsResult(mockUserContextItems);
      });

      it('includes only user context, not system context', async () => {
        const message = 'Follow-up message';
        await sendMessage(message);

        const messages = findDuoChat().props('messages');
        expect(messages[0]).toEqual(
          expect.objectContaining({
            content: message,
            extras: {
              contextItems: mockUserContextItems,
            },
          }),
        );
      });

      it('does not clear system context during continuation', async () => {
        const message = 'Follow-up message';
        await sendMessage(message);

        expect(workflowStore.clearSystemContextItems).not.toHaveBeenCalled();
      });
    });

    describe('when navigating to new chat', () => {
      beforeEach(() => {
        createComponent();
        workflowStore.setSystemContextItems(mockSystemContextItems);
      });

      it('clears system context items', () => {
        const component = AgenticChat;
        const mockNext = jest.fn();
        const mockVm = {
          stopWorkflow: jest.fn(),
          clearSystemContextItems: jest.fn(),
          workflowId: 'workflow-123',
          transitionEvent: null,
        };

        component.beforeRouteEnter({ name: CHATS_NEW }, {}, mockNext);

        const callback = mockNext.mock.calls[0][0];
        callback(mockVm);

        expect(mockVm.clearSystemContextItems).toHaveBeenCalled();
      });
    });

    describe('when switching to different workflow', () => {
      beforeEach(() => {
        createComponent();
        workflowStore.setWorkflowId('current-workflow-id');
        workflowStore.setSystemContextItems(mockSystemContextItems);
      });

      it('clears system context items', async () => {
        const toRoute = { name: CHATS_SHOW, params: { workflowId: 'new-workflow-id' } };
        const fromRoute = { name: 'some-other-route' };
        const mockNext = jest.fn();

        const component = wrapper.vm;
        component.$options.beforeRouteUpdate.call(component, toRoute, fromRoute, mockNext);

        expect(workflowStore.clearSystemContextItems).toHaveBeenCalled();
      });
    });
  });

  describe('Usage quota exceeded', () => {
    let usageQuotaStore;

    beforeEach(() => {
      createComponent();
      usageQuotaStore = useUsageQuotaStore();
    });

    describe('when usage quota is exceeded', () => {
      beforeEach(async () => {
        usageQuotaStore.setUsageQuotaExceeded({ exceeded: true });
        await nextTick();
      });

      it('disables chat input', () => {
        expect(findDuoChat().props('isChatAvailable')).toBe(false);
      });

      it('renders UsageQuotaAlert component', () => {
        const alert = wrapper.findComponent(UsageQuotaAlert);
        expect(alert.exists()).toBe(true);
      });

      it('passes usageQuotaExceeded prop to UsageQuotaAlert', () => {
        const alert = wrapper.findComponent(UsageQuotaAlert);
        expect(alert.props('usageQuotaExceeded')).toBe(true);
      });

      it('does not provide predefined prompts', () => {
        expect(findDuoChat().props('predefinedPrompts')).toHaveLength(0);
      });
    });

    describe('when usage quota is not exceeded', () => {
      beforeEach(async () => {
        usageQuotaStore.setUsageQuotaExceeded({ exceeded: false });
        await nextTick();
      });

      it('enables chat input', () => {
        expect(findDuoChat().props('isChatAvailable')).toBe(true);
      });

      it('passes usageQuotaExceeded prop as false to UsageQuotaAlert', () => {
        const alert = wrapper.findComponent(UsageQuotaAlert);
        expect(alert.props('usageQuotaExceeded')).toBe(false);
      });

      it('provided predefined prompts', () => {
        expect(findDuoChat().props('predefinedPrompts')).toHaveLength(4);
      });
    });

    describe('when usage quota error occurs mid-stream', () => {
      beforeEach(async () => {
        usageQuotaStore.setUsageQuotaExceeded({ exceeded: true, isMidStream: true });
        await nextTick();
      });

      it('renders UsageQuotaAlert in the footer panel', () => {
        const alerts = wrapper.findAllComponents(UsageQuotaAlert);
        expect(alerts).toHaveLength(2);

        expect(alerts.at(0).props('usageQuotaExceeded')).toBe(false);
        expect(alerts.at(1).props('usageQuotaExceeded')).toBe(true);
      });
    });
  });

  describe('$route watcher', () => {
    let usageQuotaStore;

    beforeEach(() => {
      createComponent();
      usageQuotaStore = useUsageQuotaStore();
    });

    it('resets usageQuotaExceededMidStream on route change', async () => {
      const resetSpy = jest.spyOn(usageQuotaStore, 'resetUsageQuotaExceededMidStream');

      wrapper.vm.$options.watch.$route.handler.call(wrapper.vm);

      expect(resetSpy).toHaveBeenCalled();
    });
  });
});

describe('rewriteSkillSlashCommand', () => {
  const slashCommands = [
    { name: '/deploy', description: 'Deploy skill', isSkill: true, skillName: 'deploy' },
    { name: '/test-runner', description: 'Test runner', isSkill: true, skillName: 'test-runner' },
    { name: '/help', description: 'Help command' },
  ];

  describe('when message matches a skill slash command', () => {
    it('should rewrite to "Use the {skill_name} skill"', () => {
      expect(rewriteSkillSlashCommand('/deploy', slashCommands)).toBe('Use the deploy skill');
    });
  });

  describe('when message includes a goal after the command', () => {
    it('should append the goal', () => {
      expect(rewriteSkillSlashCommand('/deploy to staging', slashCommands)).toBe(
        "Use the deploy skill to 'to staging'",
      );
    });
  });

  describe('when message includes a multi-word goal', () => {
    it('should include the full goal text', () => {
      expect(rewriteSkillSlashCommand('/test-runner run all unit tests', slashCommands)).toBe(
        "Use the test-runner skill to 'run all unit tests'",
      );
    });
  });

  describe('when message does not match a skill command', () => {
    it('should return null for non-skill commands', () => {
      expect(rewriteSkillSlashCommand('/help', slashCommands)).toBeNull();
    });

    it('should return null for plain messages', () => {
      expect(rewriteSkillSlashCommand('hello world', slashCommands)).toBeNull();
    });
  });
});
