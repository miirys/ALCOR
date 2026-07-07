import { Connection } from 'vscode-languageserver';
import { MessageBus } from '@gitlab-org/message-bus';
import {
  WebviewId,
  WebviewPlugin,
  WebviewPluginSetupParams,
  CreatePluginMessageMap,
} from '@gitlab-org/webview-plugin';
import {
  LsConnection,
  UserService,
  GitLabApiService,
  FeatureFlagService,
  InstanceFeatureFlags,
} from '@gitlab-org/core';
import { AgentPlatformProjectService } from '@gitlab-lsp/workflow-api/node';
import {
  WorkflowRunner,
  DuoWorkflowEvent,
  DuoWorkflowStatus,
  ParsedDuoWorkflowEvent,
  parseLangGraphCheckpoint,
  WorkflowType,
  UsageQuotaService,
} from '@gitlab-lsp/workflow-api';
import { Logger } from '@gitlab-org/logging';
import {
  AgenticChatContextManager,
  ChatContextManager,
  SystemContextManager,
} from '@gitlab-org/ai-context';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { DuoAgentPlatformTracker, DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { supportsToolCallApprovals, supportsPatternApprovals } from '@gitlab-org/tool-approval';
import { DuoWorkflowMessages, WEBVIEW_ID, WEBVIEW_TITLE } from '../contract';
import {
  initWorkflowController,
  initWorkflowConnectionController,
  initWorkflowCommonController,
  initAIContextController,
  initTelemetryController,
  initUserController,
  registerControllerNotifications,
  registerControllerRequests,
  initRepositoriesController,
  initModelSelectionController,
} from './controllers';

@Implements(WebviewPlugin)
@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    WorkflowRunner,
    AgenticChatContextManager,
    SystemContextManager,
    DuoChatSnowplowTracker,
    UserService,
    LsConnection,
    Logger,
    SecretRedactor,
    GitLabApiService,
    DuoAgentPlatformTracker,
    AgentPlatformProjectService,
    UsageQuotaService,
    UserPersistentStorage,
    AgentSkillsResolver,
    McpManagerWorkflowExecutorAdaptor,
    FeatureFlagService,
  ],
})
export class DefaultAgenticChatWebviewPlugin implements WebviewPlugin<DuoWorkflowMessages> {
  id = WEBVIEW_ID;

  title = WEBVIEW_TITLE;

  #workflowApi: WorkflowRunner;

  #chatContextManager: ChatContextManager;

  #systemContextManager: SystemContextManager;

  #duoChatTracker: DuoChatSnowplowTracker;

  #userService: UserService;

  #connection: Connection;

  #logger: Logger;

  #secretRedactor: SecretRedactor;

  #gitlabApiService: GitLabApiService;

  #duoAgentPlatformTracker: DuoAgentPlatformTracker;

  #agentPlatformProjectService: AgentPlatformProjectService;

  #usageQuotaService: UsageQuotaService;

  #userPersistentStorage: UserPersistentStorage;

  #agentSkillsResolver: AgentSkillsResolver;

  #mcpManager: McpManagerWorkflowExecutorAdaptor;

  #featureFlagService: FeatureFlagService;

  constructor(
    workflowApi: WorkflowRunner,
    chatContextManager: ChatContextManager,
    systemContextManager: SystemContextManager,
    duoChatTracker: DuoChatSnowplowTracker,
    userService: UserService,
    connection: Connection,
    logger: Logger,
    secretRedactor: SecretRedactor,
    gitlabApiService: GitLabApiService,
    duoAgentPlatformTracker: DuoAgentPlatformTracker,
    agentPlatformProjectService: AgentPlatformProjectService,
    usageQuotaService: UsageQuotaService,
    userPersistentStorage: UserPersistentStorage,
    agentSkillsResolver: AgentSkillsResolver,
    mcpManager: McpManagerWorkflowExecutorAdaptor,
    featureFlagService: FeatureFlagService,
  ) {
    this.#workflowApi = workflowApi;
    this.#chatContextManager = chatContextManager;
    this.#systemContextManager = systemContextManager;
    this.#duoChatTracker = duoChatTracker;
    this.#userService = userService;
    this.#connection = connection;
    this.#logger = logger;
    this.#secretRedactor = secretRedactor;
    this.#gitlabApiService = gitlabApiService;
    this.#duoAgentPlatformTracker = duoAgentPlatformTracker;
    this.#agentPlatformProjectService = agentPlatformProjectService;
    this.#usageQuotaService = usageQuotaService;
    this.#userPersistentStorage = userPersistentStorage;
    this.#agentSkillsResolver = agentSkillsResolver;
    this.#mcpManager = mcpManager;
    this.#featureFlagService = featureFlagService;
  }

  init(id: WebviewId, title: string) {
    this.id = id;
    this.title = title;
  }

  setup(params: WebviewPluginSetupParams<CreatePluginMessageMap<DuoWorkflowMessages>>) {
    const { webview, extension } = params;

    webview.onInstanceConnected((_webviewInstanceId, messageBus: MessageBus) => {
      // Listen to API reconfiguration events and update authentication status
      this.#gitlabApiService.onApiReconfigured((data) => {
        messageBus.sendNotification('setAuthenticationStatus', data.isInValidState);
      });

      const workflowSubscriptionCallback = async (
        message: DuoWorkflowEvent,
        workflowId: string,
      ) => {
        this.#logger.info(`[GitLab Duo Agentic Chat Plugin][${workflowId}] Received new event`);
        const checkpoint = parseLangGraphCheckpoint(message.checkpoint);

        // Check if tool call approvals (session-scoped) are supported
        // This checks if the Gateway advertises the 'tool_call_approval' capability
        const capabilities = this.#workflowApi.getServerCapabilities(workflowId, WorkflowType.CHAT);

        const supportsSessionApprovals = supportsToolCallApprovals({
          logger: this.#logger,
          capabilities,
        });

        const supportsPatterns = supportsPatternApprovals({
          logger: this.#logger,
          capabilities,
        });

        const parsedCheckpoint: ParsedDuoWorkflowEvent = {
          ...message,
          checkpoint,
          supportsSessionApprovals,
          supportsPatternApprovals: supportsPatterns,
        };

        if (message.workflowStatus !== DuoWorkflowStatus.STOPPED) {
          messageBus.sendNotification('workflowCheckpoint', parsedCheckpoint);
        }

        messageBus.sendNotification('workflowStatus', message.workflowStatus);
      };

      const workflowCommon = initWorkflowCommonController(
        this.#workflowApi,
        this.#logger,
        this.#usageQuotaService,
      );
      const workflowConnection = initWorkflowConnectionController(this.#connection, extension);
      const workflow = initWorkflowController(
        this.#workflowApi,
        workflowSubscriptionCallback,
        messageBus,
        this.#logger,
        this.#chatContextManager,
        this.#systemContextManager,
        this.#secretRedactor,
        this.#gitlabApiService,
        this.#duoAgentPlatformTracker,
        this.#mcpManager,
      );

      const aiContext = initAIContextController(this.#chatContextManager);

      messageBus.onNotification('webviewReady', async () => {
        extension.onNotification('switchView', (payload) => {
          messageBus.sendNotification('switchView', payload);
        });

        // Send the current FF value immediately, then keep it updated on changes.
        // onChanged fires once synchronously on subscription but the flags map may
        // still be empty if updateInstanceFeatureFlags hasn't completed yet, so we
        // also read the current value directly as the initial notification.
        const sendFeatureFlags = (enabled: boolean) => {
          this.#logger.info(
            `[AgenticChat] FF software_development_flow_registry changed: ${enabled}`,
          );
          messageBus.sendNotification('setFeatureFlags', {
            softwareDevelopmentFlowRegistry: enabled,
          });
        };

        sendFeatureFlags(
          this.#featureFlagService.isInstanceFlagEnabled(
            InstanceFeatureFlags.SoftwareDevelopmentFlowRegistry,
          ),
        );

        this.#featureFlagService.onChanged?.((flags) => {
          sendFeatureFlags(
            flags.get(InstanceFeatureFlags.SoftwareDevelopmentFlowRegistry) ?? false,
          );
        });

        try {
          const { commands: skillSlashCommands } =
            await this.#agentSkillsResolver.getSkillSlashCommands();
          if (skillSlashCommands.length > 0) {
            messageBus.sendNotification('setSkillSlashCommands', skillSlashCommands);
          }
        } catch (e) {
          this.#logger.warn(
            '[GitLab Duo Agentic Chat Plugin] Failed to resolve skill slash commands',
            e,
          );
        }
      });
      const telemetry = initTelemetryController(this.#duoChatTracker);

      const user = initUserController(this.#userService, this.#logger);
      const repositories = initRepositoriesController(
        this.#agentPlatformProjectService,
        this.#logger,
        messageBus,
      );
      const modelSelection = initModelSelectionController(
        this.#userPersistentStorage,
        this.#userService,
        this.#logger,
      );

      registerControllerRequests(messageBus, [workflow.redactUserMessage]);

      registerControllerNotifications(messageBus, [
        workflow.startWorkflow,
        workflow.stopWorkflow,
        workflow.interruptRunningCommand,
        workflow.getWorkflowById,
        workflow.startSubscriptions,
        workflow.preCreateWorkflow,
        workflow.trackEvent,
        workflow.sendWorkflowEvent,
        workflowCommon.checkUsageQuota,
        workflowCommon.logToOutputChannel,
        workflowCommon.getGraphqlData,
        workflowCommon.getProjectPath,
        workflowCommon.getNamespacePath,
        workflowCommon.pullDockerImage,
        workflowCommon.verifyDockerImage,
        workflowConnection.appReady,
        workflowConnection.openUrl,
        workflowConnection.openFile,
        workflowConnection.copyCodeSnippet,
        workflowConnection.insertCodeSnippet,
        workflowConnection.copyMessage,
        workflowConnection.copyText,
        aiContext.addContextItem,
        aiContext.removeContextItem,
        aiContext.clearSelectedContextItems,
        aiContext.searchContextItems,
        aiContext.getContextCategories,
        aiContext.getSelectedContextItemContent,
        telemetry.trackFeedback,
        user.getUserInfo,
        repositories.getRepositories,
        repositories.selectProjectForWorkflow,
        modelSelection.persistSelectedModel,
        modelSelection.getPersistedSelectedModel,
      ]);
    });
  }
}
