import { Disposable } from '@gitlab-org/disposable';
import { TestLogger, Logger } from '@gitlab-org/logging';
import { UserService, GitLabApiService, InstanceInfo } from '@gitlab-org/core';
import { AIContextCategory, AIContextItem, ChatContextManager } from '@gitlab-org/ai-context';
import {
  DuoChatSnowplowTracker,
  TrackFeedbackContext,
  DUO_CHAT_EVENT,
} from '@gitlab-org/telemetry';
import { createFakePartial } from '@gitlab-org/test-utils';
import { Messages } from '../contract';
import { AiCompletionResponseMessageType } from './api/graphql/ai_completion_response_channel';
import { GitLabChatController } from './chat_controller';
import { GitLabChatRecord } from './chat/gitlab_chat_record';
import { SPECIAL_MESSAGES } from './constants';
import { DuoChatExtensionMessageBus, DuoChatWebviewMessageBus } from './types';
import { GitLabChatApi } from './chat/gitlab_chat_api';
import { ChatSubscriptionCallbacks } from './chat/chat_subscription';
import { ActiveFileContext } from './chat/gitlab_chat_record_context';
import { defaultSlashCommands } from './chat/gitlab_chat_slash_commands';
import { PromptType } from './chat/client_prompt';

jest.useFakeTimers();

jest.mock('./chat/gitlab_chat_api');

describe('GitLabChatController', () => {
  let controller: GitLabChatController;
  let webviewMessageBus: DuoChatWebviewMessageBus;
  let extensionMessageBus: DuoChatExtensionMessageBus;
  let logger: Logger;
  let apiMock: GitLabChatApi;
  let chatContextManager: ChatContextManager;
  let apiClient: GitLabApiService;
  type WebviewNotificationHandlers = Record<
    keyof Messages['webviewToPlugin']['notifications'],
    (...args: unknown[]) => void
  >;

  type ExtensionNotificationHandlers = Record<
    keyof Messages['extensionToPlugin']['notifications'],
    (...args: unknown[]) => void
  >;
  const webviewNotificationHandlers = createFakePartial<WebviewNotificationHandlers>({});
  const extensionNotificationHandlers = createFakePartial<ExtensionNotificationHandlers>({});
  const telemetryTracker = createFakePartial<DuoChatSnowplowTracker>({
    trackEvent: jest.fn(),
  });

  beforeEach(() => {
    apiClient = createFakePartial<GitLabApiService>({
      instanceInfo: createFakePartial<InstanceInfo>({}),
    });
    const userService = createFakePartial<UserService>({
      user: {
        id: 'gid://gitlab/User/12345',
      },
    });

    chatContextManager = createFakePartial<ChatContextManager>({
      addSelectedContextItem: jest.fn(),
      removeSelectedContextItem: jest.fn(),
      getAvailableCategories: jest.fn(),
      getSelectedContextItems: jest.fn(),
      searchContextItems: jest.fn(),
      clearSelectedContextItems: jest.fn(),
    });

    apiMock = createFakePartial<GitLabChatApi>({
      processNewUserPrompt: jest.fn(),
      pullAiMessage: jest.fn(),
      clearChat: jest.fn(),
      createSubscription: jest.fn().mockResolvedValue(
        createFakePartial<Disposable>({
          dispose: jest.fn(),
        }),
      ),
    });

    jest.mocked(GitLabChatApi).mockReturnValue(apiMock);

    webviewMessageBus = createFakePartial<DuoChatWebviewMessageBus>({
      sendNotification: jest.fn(),
      onNotification: jest
        .fn()
        .mockImplementation(
          (type: keyof Messages['webviewToPlugin']['notifications'], callback) => {
            webviewNotificationHandlers[type] = callback;
          },
        ),
    });

    extensionMessageBus = createFakePartial<DuoChatExtensionMessageBus>({
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
      onNotification: jest
        .fn()
        .mockImplementation(
          (type: keyof Messages['extensionToPlugin']['notifications'], callback) => {
            extensionNotificationHandlers[type] = callback;
          },
        ),
    });
    logger = new TestLogger();

    controller = new GitLabChatController(
      apiClient,
      webviewMessageBus,
      extensionMessageBus,
      logger,
      userService,
      chatContextManager,
      telemetryTracker,
    );

    apiMock.processNewUserPrompt = jest.fn().mockResolvedValue({
      aiAction: {
        errors: [],
        requestId: 'uniqueId',
      },
    });

    apiMock.pullAiMessage = jest.fn().mockImplementation((requestId: string, role: string) => ({
      content: `api response ${role}`,
      role,
      requestId,
      timestamp: '2023-01-01 01:01:01',
      extras: { sources: ['foo'] },
    }));
  });

  describe('restores chat history when webview app is ready', () => {
    it('sends canceled prompts ids to the webview', async () => {
      const canceledPromptRequestIds = ['test-request-id-1', 'test-request-id-2'];
      await webviewNotificationHandlers.cancelPrompt({
        canceledPromptRequestId: canceledPromptRequestIds[0],
      });
      webviewNotificationHandlers.appReady();

      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('cancelPrompt', {
        canceledPromptRequestIds: [canceledPromptRequestIds[0]],
      });
    });

    it('calls chatContextManager methods to refresh context categories and current items', async () => {
      jest.mocked(chatContextManager.getAvailableCategories).mockResolvedValue(['file', 'snippet']);
      jest.mocked(chatContextManager.getSelectedContextItems).mockResolvedValue([]);
      await webviewNotificationHandlers.appReady();

      expect(chatContextManager.getAvailableCategories).toHaveBeenCalled();
      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('contextCategoriesResult', {
        categories: ['file', 'snippet'],
      });
      expect(chatContextManager.getSelectedContextItems).toHaveBeenCalled();
      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('contextCurrentItemsResult', {
        items: [],
      });
    });

    it('restores chat history', async () => {
      jest.mocked(chatContextManager.getSelectedContextItems);
      controller.chatHistory.push(
        new GitLabChatRecord({ role: 'user', content: 'ping' }),
        new GitLabChatRecord({ role: 'assistant', content: 'pong' }),
      );

      await webviewNotificationHandlers.appReady();

      expect(webviewMessageBus.sendNotification).toHaveBeenNthCalledWith(3, 'newRecord', {
        record: expect.objectContaining(controller.chatHistory[0]),
      });
      expect(webviewMessageBus.sendNotification).toHaveBeenNthCalledWith(4, 'newRecord', {
        record: expect.objectContaining(controller.chatHistory[1]),
      });
    });

    it('sets initial state of the webview', async () => {
      await webviewNotificationHandlers.appReady();
      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('setInitialState', {
        slashCommands: defaultSlashCommands,
      });
    });

    it('notifies the extension that the app is ready', async () => {
      await webviewNotificationHandlers.appReady();
      expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('appReady', undefined);
    });
  });

  describe('processNewUserRecord', () => {
    let userRecord: GitLabChatRecord;
    let temporaryAssistantRecord: GitLabChatRecord;

    beforeEach(() => {
      userRecord = new GitLabChatRecord({ role: 'user', content: 'hello' });
      temporaryAssistantRecord = new GitLabChatRecord({
        role: 'assistant',
        state: 'pending',
        requestId: 'uniqueId',
      });
    });

    describe('before the api call', () => {
      beforeEach(() => {
        apiMock.processNewUserPrompt = jest.fn(() => {
          throw new Error('asd');
        });
      });

      it('notifies the chat to set the focus', async () => {
        try {
          await controller.processNewUserRecord(userRecord);
        } catch {
          /* empty */
        }

        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('focusChat');
      });
    });

    it('adds both the user prompt and the temporary assistant record', async () => {
      await controller.processNewUserRecord(userRecord);

      expect(webviewMessageBus.sendNotification).toHaveBeenCalledTimes(3);
      expect(webviewMessageBus.sendNotification).toHaveBeenNthCalledWith(
        2, // 2nd call, because `focusChat` is the 1st one
        'newRecord',
        expect.objectContaining({ record: userRecord }), // Second argument
      );
      // check temporary assistant message
      expect(webviewMessageBus.sendNotification).toHaveBeenNthCalledWith(
        3,
        'newRecord',
        expect.objectContaining({
          record: expect.objectContaining({
            requestId: temporaryAssistantRecord.requestId,
            role: temporaryAssistantRecord.role,
            state: temporaryAssistantRecord.state,
          }),
        }),
      );
    });

    describe('with API error on sending the message', () => {
      it('updates message with API error and sends VSCode error notification', async () => {
        apiMock.processNewUserPrompt = jest
          .fn()
          .mockRejectedValue({ response: { errors: [{ message: 'testError' }] } });

        await controller.processNewUserRecord(userRecord);

        expect(userRecord.errors).toStrictEqual([
          'Failed to send the chat message to the API: testError',
        ]);
        expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('showMessage', {
          type: 'error',
          message: 'Failed to send the chat message to the API: testError',
        });
      });
    });

    it('fills updated history', async () => {
      expect(controller.chatHistory).toEqual([]);

      await controller.processNewUserRecord(userRecord);

      expect(controller.chatHistory[0]).toEqual(userRecord);

      expect(controller.chatHistory[1].role).toEqual(temporaryAssistantRecord.role);
      expect(controller.chatHistory[1].content).toEqual(temporaryAssistantRecord.content);
    });

    it('does not change userRecord timestamp when api returns an error', async () => {
      const timestampBefore = userRecord.timestamp;

      jest.mocked(apiMock.pullAiMessage).mockResolvedValueOnce({
        type: 'error',
        errors: ['timeout'],
        requestId: 'requestId',
        role: 'system',
      });

      await controller.processNewUserRecord(userRecord);

      expect(userRecord.timestamp).toStrictEqual(timestampBefore);
    });

    it('passes active file context to the API', async () => {
      const currentFileContext = {
        fileName: 'foo.rb',
        selectedText: 'selected_text',
        contentAboveCursor: 'before_text',
        contentBelowCursor: 'after_text',
      };

      userRecord.context = { currentFile: currentFileContext };

      await controller.processNewUserRecord(userRecord);

      expect(apiMock.processNewUserPrompt).toHaveBeenCalledWith(
        'hello',
        expect.any(String),
        currentFileContext,
        undefined,
      );
    });

    describe('with newChatConversation command', () => {
      beforeEach(() => {
        userRecord = new GitLabChatRecord({ role: 'user', content: SPECIAL_MESSAGES.RESET });
      });

      it('sends only new user userRecord and doesnt wait for response', async () => {
        await controller.processNewUserRecord(userRecord);

        expect(webviewMessageBus.sendNotification).toHaveBeenNthCalledWith(
          2,
          'newRecord',
          expect.objectContaining({
            record: expect.objectContaining({
              content: SPECIAL_MESSAGES.RESET,
              state: 'ready',
              role: 'user',
            }),
          }),
        );
        expect(controller.chatHistory[0]).toEqual(
          expect.objectContaining({
            content: SPECIAL_MESSAGES.RESET,
            state: 'ready',
            role: 'user',
            type: 'newConversation',
          }),
        );
        expect(controller.chatHistory.length).toEqual(1);
      });
    });

    it('handles API errors and disposes subscription when action fails', async () => {
      const newUserRecord = new GitLabChatRecord({ role: 'user', content: 'hello' });
      const mockSubscription = createFakePartial<Disposable>({
        dispose: jest.fn(),
      });
      apiMock.createSubscription = jest.fn().mockResolvedValue(mockSubscription);

      const mockError = new Error('API error');
      (mockError as unknown as { response: { errors: { message: string }[] } }).response = {
        errors: [{ message: 'Something went wrong' }],
      };

      apiMock.processNewUserPrompt = jest.fn().mockRejectedValue(mockError);

      await controller.processNewUserRecord(newUserRecord);

      expect(mockSubscription.dispose).toHaveBeenCalled();
      expect(newUserRecord.errors).toEqual([
        'Failed to send the chat message to the API: Something went wrong',
      ]);
      expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith(
        'showMessage',
        expect.objectContaining({
          type: 'error',
          message: 'Failed to send the chat message to the API: Something went wrong',
        }),
      );
    });

    it('uses fallback polling when subscription fails', async () => {
      const newUserRecord = new GitLabChatRecord({ role: 'user', content: 'hello' });
      const subscriptionError = new Error('Subscription failed');

      apiMock.createSubscription = jest.fn().mockRejectedValue(subscriptionError);

      apiMock.processNewUserPrompt = jest.fn().mockResolvedValue({
        aiAction: {
          errors: [],
          requestId: 'uniqueId',
        },
      });

      await controller.processNewUserRecord(newUserRecord);

      expect(apiMock.pullAiMessage).toHaveBeenCalledTimes(2);
      expect(apiMock.pullAiMessage).toHaveBeenCalledWith('uniqueId', 'user');
      expect(apiMock.pullAiMessage).toHaveBeenCalledWith('uniqueId', 'assistant');
    });
  });

  describe('message updates subscription', () => {
    let userRecord: GitLabChatRecord;
    let chunk: AiCompletionResponseMessageType;
    let capturedCallbacks: ChatSubscriptionCallbacks | null = null;

    beforeEach(async () => {
      userRecord = new GitLabChatRecord({ role: 'user', content: 'hello' });
      chunk = {
        chunkId: 1,
        content: 'chunk #1',
        role: 'assistant',
        timestamp: 'foo',
        requestId: 'uniqueId',
        errors: [],
      };

      // Mock createSubscription to capture the callbacks
      apiMock.createSubscription = jest.fn().mockImplementation(async (_id, callbacks) => {
        capturedCallbacks = callbacks;
        return createFakePartial<Disposable>({
          dispose: jest.fn(),
        });
      });

      await controller.processNewUserRecord(userRecord);
    });

    it('creates a subscription for message updates', () => {
      expect(apiMock.createSubscription).toHaveBeenCalled();
    });

    it('updates the existing record when onMessage is called', async () => {
      chunk = {
        ...chunk,
        requestId: 'uniqueId',
      };

      expect(webviewMessageBus.sendNotification).toHaveBeenCalledTimes(3);

      // Simulate receiving a message through the subscription
      await capturedCallbacks?.onMessage(chunk);

      expect(
        jest
          .mocked(webviewMessageBus.sendNotification)
          .mock.calls.filter((call) => call[0] === 'newRecord'),
      ).toHaveLength(2);

      expect(
        jest
          .mocked(webviewMessageBus.sendNotification)
          .mock.calls.filter((call) => call[0] === 'updateRecord'),
      ).toHaveLength(1);

      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
        'updateRecord',
        expect.objectContaining({
          record: expect.objectContaining({
            chunkId: 1,
            content: 'chunk #1',
            state: 'ready',
            requestId: 'uniqueId',
          }),
        }),
      );
    });

    it('does not update any record if the record does not exist yet', async () => {
      chunk = {
        ...chunk,
        requestId: 'non-existingId',
      };

      await capturedCallbacks?.onMessage(chunk);

      expect(webviewMessageBus.sendNotification).not.toHaveBeenCalledWith('updateRecord');
    });

    it('updates the record with additional context items from the response', async () => {
      const newUserRecord = new GitLabChatRecord({ role: 'user', content: 'hello' });
      apiMock.processNewUserPrompt = jest.fn().mockResolvedValue({
        aiAction: {
          errors: [],
          requestId: 'uniqueId',
        },
      });

      let testCallbacks: ChatSubscriptionCallbacks | null = null;
      apiMock.createSubscription = jest.fn().mockImplementation(async (_id, callbacks) => {
        testCallbacks = callbacks;
        return createFakePartial<Disposable>({
          dispose: jest.fn(),
        });
      });

      await controller.processNewUserRecord(newUserRecord);

      const data: AiCompletionResponseMessageType = {
        requestId: 'uniqueId',
        role: 'assistant',
        content: 'Response content',
        chunkId: 1,
        timestamp: 'foo',
        errors: [],
        extras: {
          sources: [],
          additionalContext: [
            createFakePartial<AIContextItem>({
              id: '1',
              category: 'file',
              content: 'file content',
              metadata: {},
            }),
          ],
        },
      };

      expect(testCallbacks).not.toBeNull();
      await testCallbacks!.onMessage(data);
      await jest.runAllTimersAsync();

      expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
        'updateRecord',
        expect.objectContaining({
          record: expect.objectContaining({
            extras: expect.objectContaining({
              contextItems: expect.arrayContaining([
                expect.objectContaining({
                  category: 'file',
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  describe('Webview message handlers', () => {
    describe('newPrompt', () => {
      it('processes new userRecord', async () => {
        controller.processNewUserRecord = jest.fn();

        await webviewNotificationHandlers.newPrompt({
          record: {
            content: 'hello',
          },
        });

        expect(controller.processNewUserRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            content: 'hello',
          }),
        );
      });

      it('processes new user record and clears selected context items', async () => {
        const recordContent = 'hello';
        controller.processNewUserRecord = jest.fn();
        chatContextManager.clearSelectedContextItems = jest.fn();

        await webviewNotificationHandlers.newPrompt({
          record: {
            content: recordContent,
          },
        });

        expect(controller.processNewUserRecord).toHaveBeenCalledWith(expect.any(GitLabChatRecord));
        expect(chatContextManager.clearSelectedContextItems).toHaveBeenCalled();
      });
    });

    describe('cancelPrompt', () => {
      const canceledPromptRequestIds = ['test-request-id-1', 'test-request-id-2'];
      beforeEach(() => {
        controller.processNewUserRecord = jest.fn();
      });

      it('should pass all cancelPrompt IDs to webview when cancelling', async () => {
        await webviewNotificationHandlers.cancelPrompt({
          canceledPromptRequestId: canceledPromptRequestIds[0],
        });

        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('cancelPrompt', {
          canceledPromptRequestIds: [canceledPromptRequestIds[0]],
        });

        // jest.mocked(webviewMessageBus.sendNotification).mockClear();
        await webviewNotificationHandlers.cancelPrompt({
          canceledPromptRequestId: canceledPromptRequestIds[1],
        });
        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('cancelPrompt', {
          canceledPromptRequestIds,
        });
      });
    });

    describe('clearChat', () => {
      beforeEach(() => {
        jest.mocked(apiMock.clearChat).mockResolvedValue({
          aiAction: {
            errors: [],
            requestId: 'uniqueId',
          },
        });
      });

      it('should process new user record for GitLab version >= 17.5.0', async () => {
        apiClient.instanceInfo!.instanceVersion = '17.5.0';
        controller.processNewUserRecord = jest.fn();
        chatContextManager.clearSelectedContextItems = jest.fn();

        await webviewNotificationHandlers.clearChat({
          record: {
            content: SPECIAL_MESSAGES.CLEAN,
          },
        });

        expect(controller.processNewUserRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            content: SPECIAL_MESSAGES.CLEAN,
          }),
        );
        expect(controller.processNewUserRecord).toHaveBeenCalledWith(expect.any(GitLabChatRecord));
        expect(chatContextManager.clearSelectedContextItems).toHaveBeenCalled();
      });

      describe('content is /clear or /clean and version < 17.5.0', () => {
        beforeEach(() => {
          controller.processNewUserRecord = jest.fn();
          apiClient.instanceInfo!.instanceVersion = '17.4.0';
        });

        it('triggers `clearChat` on the API', async () => {
          expect(apiMock.clearChat).not.toHaveBeenCalled();
          await webviewNotificationHandlers.clearChat({
            record: {
              content: SPECIAL_MESSAGES.CLEAR,
            },
          });

          expect(apiMock.clearChat).toHaveBeenCalled();
        });

        it('triggers `clearChat` on the view', async () => {
          await webviewNotificationHandlers.clearChat({
            record: {
              content: SPECIAL_MESSAGES.CLEAR,
            },
          });

          expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('clearChat');
        });

        it('handles errors in response by showing VSCode error message', async () => {
          expect(extensionMessageBus.sendNotification).not.toHaveBeenCalledWith('showMessage');

          jest.mocked(apiMock.clearChat).mockResolvedValue({
            aiAction: {
              errors: ['foo', 'bar'],
              requestId: 'uniqueId',
            },
          });

          await webviewNotificationHandlers.clearChat({
            record: {
              content: SPECIAL_MESSAGES.CLEAR,
            },
          });
          expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('showMessage', {
            type: 'error',
            message: 'foo, bar',
          });
        });

        it('handles non-recoverable errors failing the response', async () => {
          expect(extensionMessageBus.sendNotification).not.toHaveBeenCalledWith('showMessage');

          jest.mocked(apiMock.clearChat).mockRejectedValue(new Error('test problem'));

          await webviewNotificationHandlers.clearChat({
            record: {
              content: SPECIAL_MESSAGES.CLEAR,
            },
          });
          expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('showMessage', {
            type: 'error',
            message: 'Error: test problem',
          });
        });

        it('clears local chatHistory state', async () => {
          controller.chatHistory.push(
            new GitLabChatRecord({ role: 'user', content: 'ping' }),
            new GitLabChatRecord({ role: 'assistant', content: 'pong' }),
          );

          await webviewNotificationHandlers.clearChat({
            record: {
              content: SPECIAL_MESSAGES.CLEAR,
            },
          });
          expect(controller.chatHistory).toHaveLength(0);
        });
      });
    });

    describe('removeContextItem', () => {
      it('calls chatContextManager.remove and refreshes current context items', async () => {
        const contextItem = createFakePartial<AIContextItem>({
          id: '1',
          category: 'file',
          content: 'content',
          metadata: {
            title: 'title',
            enabled: true,
            subType: 'open_tab',
          },
        });
        chatContextManager.removeSelectedContextItem = jest.fn().mockResolvedValue(true);
        chatContextManager.getSelectedContextItems = jest.fn().mockResolvedValue([]);

        await webviewNotificationHandlers.removeContextItem({ item: contextItem });

        expect(chatContextManager.removeSelectedContextItem).toHaveBeenCalledWith(contextItem);
        expect(chatContextManager.getSelectedContextItems).toHaveBeenCalled();
        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
          `contextCurrentItemsResult`,
          expect.objectContaining({
            items: [],
          }),
        );
      });
    });

    describe('addContextItem', () => {
      it('calls chatContextManager.add and refreshes current context items', async () => {
        const contextItem = createFakePartial<AIContextItem>({
          id: '1',
          category: 'file',
          content: 'content',
          metadata: {
            title: 'title',
            enabled: true,
            subType: 'open_tab',
          },
        });
        jest.mocked(chatContextManager.addSelectedContextItem).mockResolvedValue(true);
        jest.mocked(chatContextManager.getSelectedContextItems).mockResolvedValue([contextItem]);

        await webviewNotificationHandlers.addContextItem({ item: contextItem });

        expect(chatContextManager.addSelectedContextItem).toHaveBeenCalledWith(contextItem);
        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
          `contextCurrentItemsResult`,
          expect.objectContaining({
            items: [contextItem],
          }),
        );
      });
    });

    describe('searchContextItems', () => {
      it('calls chatContextManager.query with correct parameters and updates view with results', async () => {
        const category = 'file' as AIContextCategory;
        const query = 'test query';
        const results: AIContextItem[] = [
          createFakePartial<AIContextItem>({
            id: '1',
            category,
            content: 'result',
            metadata: {
              title: 'title',
              enabled: true,
              subType: 'open_tab',
            },
          }),
        ];
        jest.mocked(chatContextManager.searchContextItems).mockResolvedValue(results);

        await webviewNotificationHandlers.searchContextItems({ query: { category, query } });

        expect(chatContextManager.searchContextItems).toHaveBeenCalledWith({
          query,
          category,
        });

        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
          `contextItemSearchResult`,
          expect.objectContaining({
            results,
          }),
        );
      });
    });

    describe('getSelectedContextItemContent', () => {
      const contextItem = createFakePartial<AIContextItem>({
        id: '1',
        category: 'file',
        content: undefined,
        metadata: {
          title: 'title',
          enabled: true,
          subType: 'open_tab',
        },
      });
      const hydratedContextItem = {
        ...contextItem,
        content: 'water',
      };

      beforeEach(() => {
        chatContextManager.getSelectedContextItems = jest.fn().mockResolvedValue([contextItem]);
        chatContextManager.getItemWithContent = jest.fn().mockResolvedValue(hydratedContextItem);
      });

      it('calls chatContextManager.getContent with correct parameters', async () => {
        await webviewNotificationHandlers.getSelectedContextItemContent({
          item: contextItem,
          messageId: undefined,
        });

        expect(chatContextManager.getItemWithContent).toHaveBeenCalledWith(contextItem);
      });

      describe('when there is no messageId', () => {
        it('updates selected context items in the view with the hydrated context item', async () => {
          await webviewNotificationHandlers.getSelectedContextItemContent({
            item: contextItem,
            messageId: undefined,
          });

          expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
            'contextCurrentItemsResult',
            expect.objectContaining({
              items: [hydratedContextItem],
            }),
          );
        });
      });
    });

    describe('newPrompt', () => {
      it('should request active file context from the client', async () => {
        const activeFileContext = createFakePartial<ActiveFileContext>({
          fileName: 'foo',
          selectedText: 'bar',
          contentAboveCursor: 'function a (arg1)',
          contentBelowCursor: '{}',
        });

        jest.mocked(extensionMessageBus.sendRequest).mockResolvedValue(activeFileContext);
        await webviewNotificationHandlers.newPrompt({
          record: {
            content: 'explain',
          },
        });
        expect(extensionMessageBus.sendRequest).toHaveBeenCalledWith(
          'getCurrentFileContext',
          undefined,
        );
        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith(
          'newRecord',
          expect.objectContaining({
            record: expect.objectContaining({
              context: {
                currentFile: activeFileContext,
              },
            }),
          }),
        );
      });
    });

    describe('insertCodeSnippet', () => {
      it('calls "insertCodeSnippet" when data is present', async () => {
        const snippet = 'const example = "test";';
        await webviewNotificationHandlers.insertCodeSnippet({
          data: {
            snippet,
          },
        });

        expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('insertCodeSnippet', {
          snippet,
        });
      });

      it('does not call "insertCodeSnippet" when no data is present', async () => {
        const snippet = '';
        await webviewNotificationHandlers.insertCodeSnippet({
          data: {
            snippet,
          },
        });

        expect(extensionMessageBus.sendNotification).not.toHaveBeenCalled();
      });
    });

    describe('copyCodeSnippet', () => {
      it('calls "copyCodeSnippet" when data is present', async () => {
        const snippet = 'const example = "test";';
        await webviewNotificationHandlers.copyCodeSnippet({
          data: {
            snippet,
          },
        });

        expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('copyCodeSnippet', {
          snippet,
        });
      });

      it('does not call "copyCodeSnippet" when no data is present', async () => {
        const snippet = '';
        await webviewNotificationHandlers.copyCodeSnippet({
          data: {
            snippet,
          },
        });

        expect(extensionMessageBus.sendNotification).not.toHaveBeenCalled();
      });
    });

    describe('trackFeedback', () => {
      beforeEach(() => {
        // eslint-disable-next-line no-restricted-syntax
        jest.mocked(telemetryTracker.trackEvent).mockClear();
      });

      it('track telemetry event when data is present', async () => {
        const context: TrackFeedbackContext = {
          didWhat: 'didWhat',
          improveWhat: 'improveWhat',
          feedbackChoices: ['choice1', 'choice2'],
        };

        await webviewNotificationHandlers.trackFeedback({
          data: {
            didWhat: context.didWhat,
            improveWhat: context.improveWhat,
            feedbackChoices: context.feedbackChoices,
          },
        });

        expect(telemetryTracker.trackEvent).toHaveBeenCalledWith(DUO_CHAT_EVENT.BTN_CLICK, context);
      });

      it('does not track telemetry event when no data is present', async () => {
        await webviewNotificationHandlers.trackFeedback({ data: null });

        expect(telemetryTracker.trackEvent).not.toHaveBeenCalled();
      });
    });

    describe('focusChange', () => {
      it('notifies the extension', async () => {
        const focusChangeState = {
          isFocused: true,
        };
        await webviewNotificationHandlers.focusChange(focusChangeState);

        expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith(
          'focusChange',
          focusChangeState,
        );
      });
    });

    describe('openLink', () => {
      it('notifies the extension', async () => {
        const linkClicked = {
          href: 'https://gitlab.com',
        };
        await webviewNotificationHandlers.openLink(linkClicked);

        expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('openLink', linkClicked);
      });
    });
  });

  describe('Extension message handlers', () => {
    describe('handleExtensionPrompt', () => {
      beforeEach(() => {
        controller.processNewUserRecord = jest.fn();
      });

      it.each([['explainCode'], ['fixCode'], ['generateTests'], ['refactorCode']])(
        'should not process new user record when promptType is %s and fileContext is undefined',
        async (promptType) => {
          await controller.handleExtensionPrompt(promptType as PromptType);
          expect(controller.processNewUserRecord).not.toHaveBeenCalled();
        },
      );

      it.each([
        ['newConversation', '/reset'],
        ['explainTerminalOutput', 'Explain this terminal output'],
      ])(
        'should process new user record for %s even without fileContext',
        async (promptType, expectedContent) => {
          await controller.handleExtensionPrompt(promptType as PromptType);
          expect(controller.processNewUserRecord).toHaveBeenCalledWith(
            expect.objectContaining({
              role: 'user',
              content: expectedContent,
              type: promptType,
            }),
          );
        },
      );

      it('should process new user record with fileContext for non-newConversation promptTypes', async () => {
        const fileContext = {
          fileName: 'test.ts',
          selectedText: 'const x = 5;',
          contentAboveCursor: 'function test() {',
          contentBelowCursor: '}',
        };
        await controller.handleExtensionPrompt('explainCode', fileContext);
        expect(controller.processNewUserRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'user',
            content: '/explain',
            type: 'explainCode',
            context: { currentFile: fileContext },
          }),
        );
      });

      it('should use the correct command content for each promptType', async () => {
        const fileContext = createFakePartial<ActiveFileContext>({ fileName: 'test.ts' });
        const promptTypes: PromptType[] = [
          'explainCode',
          'fixCode',
          'generateTests',
          'refactorCode',
          'explainTerminalOutput',
        ];
        const expectedContents = [
          '/explain',
          '/fix',
          '/tests',
          '/refactor',
          'Explain this terminal output',
        ];

        promptTypes.forEach(async (prompt, index) => {
          await controller.handleExtensionPrompt(prompt, fileContext);

          expect(controller.processNewUserRecord).toHaveBeenCalledWith(
            expect.objectContaining({
              content: expectedContents[index],
              type: prompt,
            }),
          );
        });
      });

      it('should clear selected context items when processing an extension prompt', async () => {
        const fileContext = createFakePartial<ActiveFileContext>({ fileName: 'test.ts' });
        await controller.handleExtensionPrompt('explainCode', fileContext);

        expect(chatContextManager.clearSelectedContextItems).toHaveBeenCalled();
        expect(controller.processNewUserRecord).toHaveBeenCalled();
      });

      it('should return early if prompt type is not valid', async () => {
        const fileContext = createFakePartial<ActiveFileContext>({ fileName: 'test.ts' });
        await controller.handleExtensionPrompt('unknownType' as PromptType, fileContext);
        expect(controller.processNewUserRecord).not.toHaveBeenCalled();
      });

      it('should notify webview on "focusChat" event', async () => {
        await controller.handleExtensionPrompt('focusChat');
        expect(webviewMessageBus.sendNotification).toHaveBeenCalledWith('focusChat');
      });

      it('sends telemetry event for terminal context action command', async () => {
        await controller.handleExtensionPrompt('explainTerminalOutput');
        expect(telemetryTracker.trackEvent).toHaveBeenCalledWith(
          DUO_CHAT_EVENT.TERMINAL_ACTION_CLICKED,
          {},
        );
      });
    });
  });

  describe('copyMessage', () => {
    it('forwards copy message notification to extension when message data is present', async () => {
      const message = 'Test message to copy';
      await webviewNotificationHandlers.copyMessage({
        data: {
          message,
        },
      });

      expect(extensionMessageBus.sendNotification).toHaveBeenCalledWith('copyMessage', {
        message,
      });
    });

    it('does not forward copy message notification when message data is missing', async () => {
      await webviewNotificationHandlers.copyMessage({
        data: {
          message: null,
        },
      });

      expect(extensionMessageBus.sendNotification).not.toHaveBeenCalled();
    });

    it('does not forward copy message notification when data is missing', async () => {
      await webviewNotificationHandlers.copyMessage({});

      expect(extensionMessageBus.sendNotification).not.toHaveBeenCalled();
    });
  });
});
