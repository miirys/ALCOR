import {
  WebviewPlugin,
  WebviewPluginSetupParams,
  CreatePluginMessageMap,
} from '@gitlab-org/webview-plugin';
import { Logger } from '@gitlab-org/logging';
import { GitLabApiService, UserService } from '@gitlab-org/core';
import { CompositeDisposable } from '@gitlab-org/disposable';
import { DuoChatContextManager, ChatContextManager } from '@gitlab-org/ai-context';
import { DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { Injectable } from '@gitlab/needle';
import { Messages, WEBVIEW_ID, WEBVIEW_TITLE } from '../contract';
import { GitLabChatController } from './chat_controller';

export { DUO_CHAT_V2_WEBVIEW_ID } from '../metadata';

@Injectable(WebviewPlugin, [
  GitLabApiService,
  UserService,
  Logger,
  DuoChatContextManager,
  DuoChatSnowplowTracker,
])
export class DuoChatWebviewPlugin implements WebviewPlugin<Messages> {
  readonly id = WEBVIEW_ID;

  readonly title = WEBVIEW_TITLE;

  #gitlabApiClient: GitLabApiService;

  #userService: UserService;

  #logger: Logger;

  #chatContextManager: ChatContextManager;

  #telemetryTracker: DuoChatSnowplowTracker;

  constructor(
    gitlabApiClient: GitLabApiService,
    userService: UserService,
    logger: Logger,
    chatContextManager: ChatContextManager,
    telemetryTracker: DuoChatSnowplowTracker,
  ) {
    this.#gitlabApiClient = gitlabApiClient;
    this.#userService = userService;
    this.#logger = logger;
    this.#chatContextManager = chatContextManager;
    this.#telemetryTracker = telemetryTracker;
  }

  setup(params: WebviewPluginSetupParams<CreatePluginMessageMap<Messages>>) {
    const { webview, extension } = params;

    webview.onInstanceConnected((_, webviewMessageBus) => {
      const disposable = new CompositeDisposable();

      const controller = new GitLabChatController(
        this.#gitlabApiClient,
        webviewMessageBus,
        extension,
        this.#logger,
        this.#userService,
        this.#chatContextManager,
        this.#telemetryTracker,
      );
      disposable.add(
        controller,
        extension.onNotification('newPrompt', async ({ prompt, fileContext }) => {
          await controller.handleExtensionPrompt(prompt, fileContext);
        }),
      );

      return {
        dispose: () => {
          disposable.dispose();
        },
      };
    });
  }
}
