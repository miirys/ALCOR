import { gte } from 'semver';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { Logger } from '@gitlab-org/logging';
import { GitLabApiService, UserService } from '@gitlab-org/core';
import {
  AIContextCategory,
  type AIContextItem,
  AIContextItemMetadata,
  ChatContextManager,
} from '@gitlab-org/ai-context';
import { DUO_CHAT_EVENT, DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { AiActionError, AIActionResult, GitLabChatApi } from './chat/gitlab_chat_api';
import { GitLabChatRecord } from './chat/gitlab_chat_record';
import { DuoChatExtensionMessageBus, DuoChatWebviewMessageBus } from './types';
import { AiCompletionResponseMessageType } from './api/graphql/ai_completion_response_channel';
import { SPECIAL_MESSAGES } from './constants';
import { ActiveFileContext } from './chat/gitlab_chat_record_context';
import { defaultSlashCommands } from './chat/gitlab_chat_slash_commands';
import { commandToContentMap, PromptType, validPromptTypes } from './chat/client_prompt';

// FIXME: register class in DI
// https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/653
export class GitLabChatController implements Disposable {
  readonly chatHistory: GitLabChatRecord[];

  readonly #canceledPromptRequestIds: string[];

  readonly #api: GitLabChatApi;

  readonly #extensionMessageBus: DuoChatExtensionMessageBus;

  readonly #webviewMessageBus: DuoChatWebviewMessageBus;

  readonly #subscriptions = new CompositeDisposable();

  readonly #logger: Logger;

  readonly #apiClient: GitLabApiService;

  readonly #chatContextManager: ChatContextManager;

  readonly #telemetryTracker: DuoChatSnowplowTracker;

  #activeSubscription: Disposable | null = null;

  constructor(
    apiClient: GitLabApiService,
    webviewMessageBus: DuoChatWebviewMessageBus,
    extensionMessageBus: DuoChatExtensionMessageBus,
    logger: Logger,
    userService: UserService,
    chatContextManager: ChatContextManager,
    telemetryTracker: DuoChatSnowplowTracker,
  ) {
    this.chatHistory = [];
    this.#canceledPromptRequestIds = [];

    this.#chatContextManager = chatContextManager;
    this.#apiClient = apiClient;
    this.#logger = logger;
    this.#api = new GitLabChatApi(apiClient, this.#chatContextManager, this.#logger, userService);
    this.#telemetryTracker = telemetryTracker;

    this.#webviewMessageBus = webviewMessageBus;
    this.#extensionMessageBus = extensionMessageBus;

    this.#setupMessageHandlers.bind(this)();
  }

  dispose(): void {
    // Clean up active subscription first to prevent connection leaks
    this.#activeSubscription?.dispose();
    this.#activeSubscription = null;

    this.#subscriptions.dispose();
  }

  async handleExtensionPrompt(promptType: PromptType, fileContext?: ActiveFileContext) {
    if (!validPromptTypes.includes(promptType)) {
      return;
    }

    if (promptType === 'focusChat') {
      this.#webviewMessageBus.sendNotification('focusChat');
      return;
    }

    const fileContextOptional = ['newConversation', 'explainTerminalOutput'] as PromptType[];
    if (!fileContextOptional.includes(promptType) && !fileContext) {
      return;
    }

    if (promptType === 'explainTerminalOutput') {
      this.#telemetryTracker.trackEvent(DUO_CHAT_EVENT.TERMINAL_ACTION_CLICKED, {});
    }

    const record = await GitLabChatRecord.buildWithContext(
      {
        role: 'user',
        type: promptType,
        content: commandToContentMap[promptType],
        activeFileContext: fileContext,
      },
      this.#chatContextManager,
    );

    await Promise.all([this.processNewUserRecord(record), this.#clearSelectedContextItems()]);
  }

  #setupMessageHandlers() {
    this.#subscriptions.add(
      this.#webviewMessageBus.onNotification('appReady', async () => {
        this.#logger.debug('Duo Chat: received "appReady" notification');
        await this.#restoreHistory();
        this.#webviewMessageBus.sendNotification('setInitialState', {
          slashCommands: defaultSlashCommands,
        });
        this.#extensionMessageBus.sendNotification('appReady', undefined);
      }),

      this.#webviewMessageBus.onNotification('newPrompt', async (message) => {
        const activeFileContext = await this.#getCurrentFileContext();
        const record = await GitLabChatRecord.buildWithContext(
          {
            role: 'user',
            content: message.record.content,
            activeFileContext,
          },
          this.#chatContextManager,
        );

        await Promise.all([this.processNewUserRecord(record), this.#clearSelectedContextItems()]);
      }),

      this.#webviewMessageBus.onNotification('cancelPrompt', (message) => {
        this.#canceledPromptRequestIds.push(message.canceledPromptRequestId);
        this.#webviewMessageBus.sendNotification('cancelPrompt', {
          canceledPromptRequestIds: this.#canceledPromptRequestIds,
        });
      }),

      this.#webviewMessageBus.onNotification('trackFeedback', async (message) => {
        if (message.data) {
          await this.#telemetryTracker.trackEvent(DUO_CHAT_EVENT.BTN_CLICK, {
            didWhat: message.data.didWhat,
            improveWhat: message.data.improveWhat,
            feedbackChoices: message.data.feedbackChoices,
          });
        }
      }),

      this.#webviewMessageBus.onNotification('insertCodeSnippet', async (message) => {
        if (message.data && message.data.snippet) {
          this.#extensionMessageBus.sendNotification('insertCodeSnippet', {
            snippet: message.data.snippet,
          });
        }
      }),

      this.#webviewMessageBus.onNotification('copyCodeSnippet', async (message) => {
        if (message.data && message.data.snippet) {
          this.#extensionMessageBus.sendNotification('copyCodeSnippet', {
            snippet: message.data.snippet,
          });
        }
      }),

      this.#webviewMessageBus.onNotification('copyMessage', async (message) => {
        if (message.data && message.data.message) {
          this.#extensionMessageBus.sendNotification('copyMessage', {
            message: message.data.message,
          });
        }
      }),

      this.#webviewMessageBus.onNotification('clearChat', async (message) => {
        // We receive /clean commands as 'clearChat' because of how event types are handled at the Vue layer.
        // Because of this, we must check the message content here and send a new prompt depending on GitLab version.
        // TODO: Refactor handling 'clearChat' at vue layer to remove duplicate code.
        // https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1630
        if (
          message.record.content === SPECIAL_MESSAGES.CLEAN &&
          gte(this.#gitLabVersion, '17.5.0')
        ) {
          const record = await GitLabChatRecord.buildWithContext(
            {
              role: 'user',
              content: message.record.content,
              type: 'general',
            },
            this.#chatContextManager,
          );

          await Promise.all([this.processNewUserRecord(record), this.#clearSelectedContextItems()]);
        } else {
          try {
            const [res] = await Promise.all([
              this.#api.clearChat(),
              this.#clearSelectedContextItems(),
            ]);
            if (res.aiAction.errors.length > 0) {
              this.#extensionMessageBus.sendNotification('showMessage', {
                message: res.aiAction.errors.join(', '),
                type: 'error',
              });
            } else {
              // we have to clean the view and reset the user input.
              // Ideally, this should be done by re-fetching messages from API
              // which should return empty array. However, we don't have a way to fetch
              // messages yet. Will be handled aas part of https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1065
              // Hence for now we handle it on the client
              this.#webviewMessageBus.sendNotification('clearChat');
              this.chatHistory.length = 0;
            }
          } catch (err) {
            this.#logger.error((err as Error).toString());
            this.#extensionMessageBus.sendNotification('showMessage', {
              message: (err as Error).toString(),
              type: 'error',
            });
          }
        }
      }),

      this.#webviewMessageBus.onNotification('searchContextItems', async (message) => {
        const { category, query } = message.query;
        await this.#searchContextItems(category, query);
      }),

      this.#webviewMessageBus.onNotification('addContextItem', async (message) => {
        await this.#addContextItem(message.item);
      }),

      this.#webviewMessageBus.onNotification('removeContextItem', async (message) => {
        await this.#removeContextItem(message.item);
      }),

      this.#webviewMessageBus.onNotification('getSelectedContextItemContent', async (message) => {
        await this.#getSelectedContextItemContent(message.item, message.messageId);
      }),

      this.#webviewMessageBus.onNotification('focusChange', async (message) => {
        this.#extensionMessageBus.sendNotification('focusChange', message);
      }),

      this.#webviewMessageBus.onNotification('openLink', async (message) => {
        this.#extensionMessageBus.sendNotification('openLink', message);
      }),
    );
  }

  async #getCurrentFileContext(): Promise<ActiveFileContext | undefined> {
    try {
      this.#logger.debug('REQUESTING current context');
      return await this.#extensionMessageBus.sendRequest('getCurrentFileContext', undefined);
    } catch (error) {
      this.#logger.warn('Failed to get current file context', error as Error);
      return undefined;
    }
  }

  async processNewUserRecord(record: GitLabChatRecord) {
    if (!record.content) {
      this.#logger.warn('Duo Chat: no content to send to API');
      return;
    }

    this.#webviewMessageBus.sendNotification('focusChat');

    let useFallback: boolean = false;

    // establish a websocket connection before sending the message to the API
    // this ensures that we avoid race conditions
    const subscribeToUpdatesResult = await this.#subscribeToUpdates(record);
    const aiActionResult = await this.#aiAction(record);

    const { error: subscriptionError } = subscribeToUpdatesResult;
    const { actionResponse, error: actionError } = aiActionResult;

    if (!actionResponse) {
      // Cleanup subscription on action failure
      this.#activeSubscription?.dispose();
      this.#activeSubscription = null;

      const apiResponseMessage = actionError
        ? ((actionError as AiActionError).response?.errors?.[0]?.message ??
          (actionError as Error).message)
        : 'No action response';
      const userMessage = `Failed to send the chat message to the API: ${apiResponseMessage}`;
      record.update({ errors: [userMessage] });
      this.#logger.error(actionError);
      this.#extensionMessageBus.sendNotification('showMessage', {
        message: userMessage,
        type: 'error',
      });
      return;
    }

    if (subscriptionError) {
      this.#logger.error(
        'Duo Chat: error subscribing to updates, using fallback',
        subscriptionError,
      );
      useFallback = true;
    }

    record.update(actionResponse.aiAction);

    await this.#addToChat(record);

    if (record.type === 'newConversation') return;

    const responseRecord = new GitLabChatRecord({
      role: 'assistant',
      state: 'pending',
      requestId: record.requestId,
    });
    await this.#addToChat(responseRecord);

    // Fallback if websocket fails or disabled.
    // Used in the Web IDE.
    if (useFallback) {
      this.#logger.error('Duo Chat: error connecting to cable socket, refreshing feed via https.');
      await Promise.all([this.#refreshRecord(record), this.#refreshRecord(responseRecord)]);
    }
  }

  async #subscriptionUpdateHandler(data: AiCompletionResponseMessageType) {
    const record = this.#findRecord(data);

    if (!record) return;

    record.update({
      chunkId: data.chunkId,
      content: data.content,
      extras: {
        sources: data.extras?.sources ?? [],
        contextItems: data.extras?.additionalContext?.map((context) => ({
          // graphql returns 'FILE' and 'SNIPPET'
          // but the type expects 'file' and 'snippet'
          // FIXME: make all internal types uppercase to match GraphQL
          // https://gitlab.com/gitlab-org/gitlab/-/issues/490824
          category: context.category.toLowerCase() as AIContextCategory,
          content: context.content,
          id: context.id,
          metadata: context.metadata as AIContextItemMetadata,
        })),
      },
      timestamp: data.timestamp,
      errors: data.errors,
    });

    record.state = 'ready';
    this.#webviewMessageBus.sendNotification('updateRecord', { record });
  }

  async #restoreHistory() {
    if (this.#canceledPromptRequestIds.length) {
      this.#webviewMessageBus.sendNotification('cancelPrompt', {
        canceledPromptRequestIds: this.#canceledPromptRequestIds,
      });
    }

    await this.#refreshContextCategories();
    await this.#refreshCurrentContextItems();

    this.chatHistory.forEach((record) =>
      this.#webviewMessageBus.sendNotification('newRecord', { record }),
    );
  }

  #addToChat(record: GitLabChatRecord) {
    this.chatHistory.push(record);
    this.#webviewMessageBus.sendNotification('newRecord', { record });
  }

  async #refreshRecord(record: GitLabChatRecord) {
    if (!record.requestId) {
      throw Error('requestId must be present!');
    }

    const apiResponse = await this.#api.pullAiMessage(record.requestId, record.role);

    if (apiResponse.type !== 'error') {
      record.update({
        content: apiResponse.content,
        extras: {
          sources: apiResponse.extras?.sources ?? [],
          contextItems: apiResponse.extras?.additionalContext?.map((context) => ({
            category: context.category as AIContextCategory,
            content: context.content,
            id: context.id,
            metadata: context.metadata as AIContextItemMetadata,
          })),
        },
        timestamp: apiResponse.timestamp,
      });
    }

    record.update({ errors: apiResponse.errors, state: 'ready' });
    this.#webviewMessageBus.sendNotification('updateRecord', { record });
  }

  #findRecord(data: { requestId: string; role: string }) {
    return this.chatHistory.find(
      (r) => r.requestId === data.requestId && r.role.toLowerCase() === data.role.toLowerCase(),
    );
  }

  async #aiAction(record: GitLabChatRecord): Promise<AIActionResult> {
    try {
      const actionResponse = await this.#api.processNewUserPrompt(
        record.content as string,
        record.id,
        record.context?.currentFile,
        record.extras?.contextItems,
      );

      return { actionResponse, error: null };
    } catch (err) {
      return { actionResponse: null, error: err };
    }
  }

  async #subscribeToUpdates(record: GitLabChatRecord) {
    // Cancel any existing subscription to prevent connection leaks
    this.#activeSubscription?.dispose();
    this.#activeSubscription = null;

    try {
      const subscription = await this.#api.createSubscription(record.id, {
        onMessage: this.#subscriptionUpdateHandler.bind(this),
        onComplete: () => {
          // Clear reference when subscription completes normally
          if (this.#activeSubscription === subscription) {
            this.#activeSubscription = null;
          }
        },
        isCanceled: (requestId: string) => this.#canceledPromptRequestIds.includes(requestId),
      });

      this.#activeSubscription = subscription;
      this.#logger.info('Duo Chat: successfully subscribed to updates');
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }

  async #clearSelectedContextItems() {
    try {
      await this.#chatContextManager.clearSelectedContextItems();
      await this.#refreshCurrentContextItems();
    } catch (error) {
      this.#logger.debug(`ContextItems: error clearing selected context items`, error);
    }
  }

  async #searchContextItems(category: AIContextCategory, query: string) {
    this.#logger.info(`ContextItems: searching ${JSON.stringify({ category, query })}`);
    try {
      const results = await this.#chatContextManager.searchContextItems({
        query,
        category,
      });
      this.#logger.info(`ContextItems: found ${results.length} results`);
      this.#webviewMessageBus.sendNotification('contextItemSearchResult', { results });
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.error(`ContextItems: error searching for context items`, error);
      this.#extensionMessageBus.sendNotification('showMessage', {
        message: 'Error searching for context items.',
        type: 'error',
      });
    }
  }

  /**
   * note: we don't show an error message here because this feature is opt-in
   * and this call is made when the user opens the panel
   */
  async #refreshContextCategories() {
    this.#logger.info(`ContextItems: refreshing categories`);
    try {
      const availableCategories = await this.#chatContextManager.getAvailableCategories();
      this.#webviewMessageBus.sendNotification('contextCategoriesResult', {
        categories: availableCategories,
      });
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.debug(`ContextItems: error refreshing categories`, error);
    }
  }

  /**
   * note: we don't show an error message here because this feature is opt-in
   * and this call is made when the user opens the panel
   */
  async #refreshCurrentContextItems() {
    this.#logger.info(`ContextItems: refreshing current context item selections`);
    try {
      const currentItems = await this.#chatContextManager.getSelectedContextItems();
      this.#webviewMessageBus.sendNotification('contextCurrentItemsResult', {
        items: currentItems,
      });
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.debug(`ContextItems: error refreshing current items`, error);
    }
  }

  async #addContextItem(contextItem: AIContextItem) {
    try {
      await this.#chatContextManager.addSelectedContextItem(contextItem);
      await this.#refreshCurrentContextItems();
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.error(`ContextItems: error adding context item`, error);
      this.#extensionMessageBus.sendNotification('showMessage', {
        message: 'Error adding context item.',
        type: 'error',
      });
    }
  }

  async #removeContextItem(contextItem: AIContextItem) {
    this.#logger.info(`ContextItems: removing context item: ${JSON.stringify({ contextItem })}`);
    try {
      await this.#chatContextManager.removeSelectedContextItem(contextItem);
      await this.#refreshCurrentContextItems();
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.error(`ContextItems: error removing context item`, error);
      this.#extensionMessageBus.sendNotification('showMessage', {
        message: 'Error removing context item',
        type: 'error',
      });
    }
  }

  async #getSelectedContextItemContent(contextItem: AIContextItem, messageId: string | undefined) {
    this.#logger.debug(
      `ContextItems: getting context item content. Context Item: ${JSON.stringify({ contextItem })}, messageId: ${messageId}`,
    );

    try {
      // If there is no messageId, we are loading the content for a contextItem which is yet to be sent in a message
      if (messageId === undefined) {
        const hydratedContextItem = await this.#chatContextManager.getItemWithContent(contextItem);

        const currentItems = await this.#chatContextManager.getSelectedContextItems();
        const currentItemsResult = currentItems.map((item) =>
          item.id === contextItem.id ? hydratedContextItem : item,
        );
        this.#webviewMessageBus.sendNotification('contextCurrentItemsResult', {
          items: currentItemsResult,
        });
      }
    } catch (error) {
      // FIXME: Show a UI warning if there's an error
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489300
      this.#logger.error(`ContextItems: error getting context item content.`, error);
      this.#extensionMessageBus.sendNotification('showMessage', {
        message: 'Error getting context item content',
        type: 'error',
      });
    }
  }

  get #gitLabVersion(): string {
    return this.#apiClient.instanceInfo?.instanceVersion ?? `17.4.0`;
  }
}
