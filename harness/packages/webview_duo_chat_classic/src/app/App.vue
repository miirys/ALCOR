<script>
import { DuoChat, DuoChatContextItemMenu } from '@gitlab/duo-ui';
import { MESSAGES_WITHOUT_RESPONSES } from './constants';
import { messageBus } from './message_bus';
import { CompositeDisposable } from '@gitlab-org/disposable';
import renderGFM from './render_gfm';
import './render_markdown';

// Eclipse on Windows injects a global constant called gc, creating a conflict with the minified code.
// This usage of the global gc variable prevents esbuild from using gc as a minifed variable name.
if (typeof gc !== 'undefined') {
  setTimeout(() => undefined, 0);
}

export const eventTypes = [
  'clearChat',
  'newRecord',
  'updateRecord',
  'cancelPrompt',
  'focusChat',
  'contextCategoriesResult',
  'contextCurrentItemsResult',
  'contextItemSearchResult',
  'setInitialState',
];

const i18n = {
  predefinedPrompts: [
    'How do I change my password in GitLab?',
    'How do I fork a project?',
    'How do I clone a repository?',
    'How do I create a template?',
  ],
  chatPromptPlaceholder: 'Type "/" for slash commands',
};

export default {
  name: 'GitLabDuoChat',
  i18n,
  components: {
    DuoChat,
    DuoChatContextItemMenu,
  },
  data() {
    return {
      chatMessages: [],
      promptDraft: null,
      canceledPromptRequestIds: [],
      isLoading: false,
      contextMenuCategories: null,
      contextMenuIsLoading: false,
      contextMenuError: null,
      contextSelections: [],
      contextSearchResults: [],
      subscriptions: new CompositeDisposable(),
      slashCommands: [],
    };
  },
  created() {
    eventTypes.forEach((eventType) => {
      this.subscriptions.add(
        messageBus.onNotification(eventType, (data) => {
          this.handlePluginEvent({ data: { eventType, ...data } });
        }),
      );
    });

    messageBus.sendNotification('appReady');
  },
  onBeforeDestroy() {
    this.subscriptions.dispose();
  },
  computed: {
    messages() {
      return this.chatMessages.filter((message) => message.state !== 'pending');
    },
    pinnedContextEnabled() {
      return Boolean(this.contextMenuCategories?.length);
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
    }
  },
  beforeDestroy() {
    window.removeEventListener('focus', this.focusChat);
    document.removeEventListener('click', this.handleLinkClick);

    const promptEl = this.$refs.duoChat?.$refs?.prompt?.$el;
    if (promptEl) {
      promptEl.removeEventListener('focus', this.checkPromptFocus);
      promptEl.removeEventListener('blur', this.checkPromptFocus);
      promptEl.removeEventListener('keydown', this.handleKeyDown);
    }
  },
  watch: {
    promptDraft(newVal) {
      // window.vsCodeApi.setState({
      //   promptDraft: newVal,
      // });
    },
    chatMessages() {
      this.updateIsLoading();
    },
  },
  provide: {
    renderGFM, // Provide the renderGFM function to the DuoChat component
  },
  methods: {
    handlePluginEvent(event) {
      const message = event.data;
      switch (message.eventType) {
        case 'setInitialState': {
          this.slashCommands = message.slashCommands;
          break;
        }
        case 'clearChat': {
          this.isLoading = false;
          this.chatMessages = [];
          break;
        }
        case 'newRecord': {
          this.newRecord(message.record);
          break;
        }
        case 'updateRecord': {
          this.updateRecord(message.record);
          break;
        }
        case 'cancelPrompt': {
          this.canceledPromptRequestIds = message.canceledPromptRequestIds;
          break;
        }
        case 'focusChat': {
          this.focusChat();
          break;
        }
        case 'contextCategoriesResult': {
          const categoryDisplayData = [
            { label: 'Files', value: 'file', icon: 'document' },
            { label: 'Directories', value: 'directory', icon: 'folder' },
            { label: 'Local Git', value: 'local_git', icon: 'git' },
            { label: 'Issues', value: 'issue', icon: 'issues' },
            { label: 'Merge Requests', value: 'merge_request', icon: 'merge-request' },
            { label: 'Dependencies', value: 'dependency', icon: 'package' },
            {
              label: 'Repositories',
              value: 'repository',
              icon: 'project',
              tooltip: 'Best for broad relational questions. Fills context quickly.',
            },
          ];
          this.contextMenuCategories = categoryDisplayData.filter((category) =>
            message.categories.includes(category.value),
          );
          break;
        }
        case 'contextCurrentItemsResult': {
          this.contextSelections = message.items;
          break;
        }
        case 'contextItemSearchResult': {
          this.contextSearchResults = message.results;
          this.contextMenuError = message.errorMessage || null;
          this.contextMenuIsLoading = false;
          break;
        }
        default:
          console.warn('Chat view received unexpected message type.');
          break;
      }
    },
    newRecord(record) {
      this.chatMessages.push(record);
    },
    updateRecord(record) {
      const index = this.chatMessages.findIndex((r) => r.id === record.id);
      this.chatMessages.splice(index, 1, record);
    },
    focusChat() {
      this.$refs.duoChat?.$refs?.prompt?.$el?.focus();
    },
    attachToVsCodeState() {
      // TODO: figure out what this code does
      /* const currentState = window.vsCodeApi.getState();
      if (currentState && currentState.promptDraft) {
        this.promptDraft = currentState.promptDraft;
      }*/
    },
    onSendChatPrompt(question) {
      const eventType =
        question === MESSAGES_WITHOUT_RESPONSES.CLEAR ||
        question === MESSAGES_WITHOUT_RESPONSES.CLEAN
          ? 'clearChat'
          : 'newPrompt';

      this.isLoading = !this.isResetMessage(question);

      messageBus.sendNotification(eventType, {
        record: {
          content: question,
        },
      });
    },
    handleKeyPress(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.onSendChatPrompt();
      }
    },
    handleKeyDown(event) {
      // in VSCode Option (Alt) + D should toggle the chat
      // whereas Options (Alt) + N should start a new conversation.
      // when the key combination is pressed in the input, it will type the `∂` or `ń` char
      // and then run the command
      // We'd like to prevent that.
      const keys = ['KeyN', 'KeyD'];

      if (event.altKey && keys.includes(event.code)) {
        event.preventDefault();
      }
    },
    handleLinkClick(event) {
      if (event.target.tagName?.toLowerCase() !== 'a') return;
      event.preventDefault();
      messageBus.sendNotification('openLink', {
        href: event.target.href,
      });
    },
    onChatCancel() {
      const assistantMessage = this.chatMessages[this.chatMessages.length - 1];

      messageBus.sendNotification('cancelPrompt', {
        record: {
          canceledPromptRequestId: assistantMessage.requestId,
        },
      });

      this.isLoading = false;
    },
    updateIsLoading() {
      const lastMessage = this.chatMessages[this.chatMessages.length - 1];
      const isNotCanceled = !this.canceledPromptRequestIds.includes(lastMessage?.requestId);
      this.isLoading =
        lastMessage &&
        (lastMessage.role === 'user' || (lastMessage.state === 'pending' && isNotCanceled)) &&
        !this.isResetMessage(lastMessage.content);
    },
    onTrackFeedback({ feedbackChoices, didWhat, improveWhat } = {}) {
      messageBus.sendNotification('trackFeedback', {
        data: {
          feedbackChoices,
          improveWhat,
          didWhat,
        },
      });
    },
    isResetMessage(prompt) {
      return prompt === MESSAGES_WITHOUT_RESPONSES.RESET;
    },
    handleCodeSnippet(event, action) {
      const snippet = event.detail.code;

      messageBus.sendNotification(action, {
        data: { snippet },
      });
    },
    handleCopyMessage(event) {
      const message = event.detail.message;

      messageBus.sendNotification('copyMessage', {
        data: { message },
      });
    },
    onContextMenuSearch({ category, query }) {
      this.contextMenuIsLoading = true;
      this.contextMenuError = null;

      messageBus.sendNotification('searchContextItems', {
        query: {
          query,
          category,
        },
      });
    },
    onSelectContextItem(item) {
      this.contextSearchResults = this.contextSearchResults.filter(
        (result) => result.id !== item.id,
      );
      messageBus.sendNotification('addContextItem', {
        item,
      });
    },
    onRemoveContextItem(item) {
      messageBus.sendNotification('removeContextItem', {
        item,
      });
    },
    onGetContextItemContent({ contextItem, messageId }) {
      messageBus.sendNotification('getSelectedContextItemContent', {
        item: contextItem,
        messageId,
      });
    },
    checkPromptFocus() {
      const isFocused = this.$refs.duoChat?.$refs?.prompt?.$el === document.activeElement;
      messageBus.sendNotification('focusChange', { isFocused });
    },
  },
};
</script>
<template>
  <duo-chat
    ref="duoChat"
    :messages="messages"
    error=""
    :is-loading="isLoading"
    :predefined-prompts="$options.i18n.predefinedPrompts"
    :slash-commands="slashCommands"
    :badge-title="null"
    :enable-code-insertion="true"
    :canceled-request-ids="canceledPromptRequestIds"
    :chat-prompt-placeholder="$options.i18n.chatPromptPlaceholder"
    :should-render-resizable="false"
    @chat-cancel="onChatCancel"
    @send-chat-prompt="onSendChatPrompt"
    @track-feedback="onTrackFeedback"
    @insert-code-snippet="handleCodeSnippet($event, 'insertCodeSnippet')"
    @copy-code-snippet="handleCodeSnippet($event, 'copyCodeSnippet')"
    @copy-message="handleCopyMessage"
    @get-context-item-content="onGetContextItemContent"
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
  </duo-chat>
</template>
<style lang="scss">
@import 'styles.scss';
</style>
