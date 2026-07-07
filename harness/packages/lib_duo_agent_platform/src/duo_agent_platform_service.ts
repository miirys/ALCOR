import { Logger } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { ExtensionMessageBusProvider, WebviewConnectionProvider } from '@gitlab-org/webview';
import {
  RunWorkflowPayload,
  DuoWorkflowStatus,
  isWorkflowExecutorErrorEvent,
  isDuoWorkflowEvent,
  isTerminated,
  extractUiChatLog,
  UsageQuotaService,
  WorkflowStatusCode,
  type AgentPlatformRepository,
} from '@gitlab-lsp/workflow-api';
import { AgentPlatformProjectService } from '@gitlab-lsp/workflow-api/node';
import { MessageBus } from '@gitlab-org/message-bus';
import {
  DeleteDuoWorkflowsWorkflowVariables,
  getWorkflowsVariables,
  DuoMessage,
} from '@gitlab-org/graphql';
import { DuoAgentPlatformEvent, DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { Disposable } from '@gitlab-org/disposable';
import {
  GID_NAMESPACE_GROUP,
  GID_NAMESPACE_PROJECT,
  GitLabApiService,
  ifVersionGte,
  InstanceFeatureFlags,
  toGitLabGid,
  tryParseGitLabGidToString,
  UserService,
} from '@gitlab-org/core';
import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import {
  AgenticChatContextManager,
  type ChatContextManager,
  type AIContextCategory,
  type AIContextItem,
  SystemContextManager,
} from '@gitlab-org/ai-context';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import {
  CreditLedgerService,
  CreditLedgerFactory,
  guardWorkflowCall,
} from '@gitlab-org/credit-ledger';
import { coerce, gte } from 'semver';
import { WorkflowManager } from './workflow_manager';
import { CreditAttributionAdapter } from './credit_attribution_adapter';
import { CheckpointAttributionTracker } from './checkpoint_attribution';
import {
  DUO_AGENT_PLATFORM_WEBVIEW_ID,
  Agent,
  CheckUsageQuotaPayload,
  DuoAgentPlatformMessages,
  FetchAgentsResult,
  SelectProjectForWorkflow,
  StopWorkflowPayload,
  SendWorkflowEventPayload,
} from './webview/contract';
import { UserFeedbackContext } from './webview/feedback_types';

// How long to wait for repository discovery to produce projects before treating the
// workspace as genuinely empty. The host's repository provider populates asynchronously,
// so the snapshot taken at `appReady` can be transiently empty; sending `initialState`
// from it would end the webview's loading state and flash a "no project" screen.
const REPOSITORIES_READY_TIMEOUT_MS = 3000;

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    Logger,
    WorkflowManager,
    WebviewConnectionProvider,
    ExtensionMessageBusProvider,
    DuoAgentPlatformTracker,
    AgentPlatformProjectService,
    UserPersistentStorage,
    UserService,
    AgenticChatContextManager,
    SystemContextManager,
    UsageQuotaService,
    AgentSkillsResolver,
    WorkflowUrlOpenerService,
    GitLabApiService,
    CreditLedgerService,
  ],
  autoActivate: true,
})
export class DuoAgentPlatformService {
  readonly #logger: Logger;

  readonly #workflowManager: WorkflowManager;

  readonly #connectionProvider: WebviewConnectionProvider;

  readonly #extensionMessageBusProvider: ExtensionMessageBusProvider;

  readonly #duoAgentPlatformTracker: DuoAgentPlatformTracker;

  readonly #agentPlatformProjectService: AgentPlatformProjectService;

  readonly #storage: UserPersistentStorage;

  readonly #userService: UserService;

  readonly #chatContextManager: ChatContextManager;

  readonly #systemContextManager: SystemContextManager;

  readonly #usageQuotaService: UsageQuotaService;

  readonly #agentSkillsResolver: AgentSkillsResolver;

  readonly #urlOpenerService: WorkflowUrlOpenerService;

  readonly #gitlabApiService: GitLabApiService;

  readonly #creditAttribution: CreditAttributionAdapter;

  readonly #attributionTracker = new CheckpointAttributionTracker();

  // Serializes the read-then-clear of selected context items across concurrent startWorkflow calls
  // so two parallel sends can't read the same selections, send to two workflows, then double-clear.
  // Only the prep phase is serialized; workflow event streaming is not.
  #contextPrepLock: Promise<unknown> = Promise.resolve();

  constructor(
    logger: Logger,
    workflowManager: WorkflowManager,
    connectionProvider: WebviewConnectionProvider,
    extensionMessageBusProvider: ExtensionMessageBusProvider,
    duoAgentPlatformTracker: DuoAgentPlatformTracker,
    agentPlatformProjectService: AgentPlatformProjectService,
    storage: UserPersistentStorage,
    userService: UserService,
    chatContextManager: ChatContextManager,
    systemContextManager: SystemContextManager,
    usageQuotaService: UsageQuotaService,
    agentSkillsResolver: AgentSkillsResolver,
    urlOpenerService: WorkflowUrlOpenerService,
    gitlabApiService: GitLabApiService,
    creditLedgerFactory: CreditLedgerFactory,
  ) {
    this.#logger = logger;
    this.#workflowManager = workflowManager;
    this.#connectionProvider = connectionProvider;
    this.#extensionMessageBusProvider = extensionMessageBusProvider;
    this.#duoAgentPlatformTracker = duoAgentPlatformTracker;
    this.#agentPlatformProjectService = agentPlatformProjectService;
    this.#storage = storage;
    this.#userService = userService;
    this.#chatContextManager = chatContextManager;
    this.#systemContextManager = systemContextManager;
    this.#usageQuotaService = usageQuotaService;
    this.#agentSkillsResolver = agentSkillsResolver;
    this.#urlOpenerService = urlOpenerService;
    this.#gitlabApiService = gitlabApiService;
    this.#creditAttribution = new CreditAttributionAdapter(creditLedgerFactory, storage, logger);

    this.#initialize().catch((error) => {
      this.#logger.error('Failed to initialize Duo Agent Platform service', error);
    });
  }

  async #initialize(): Promise<void> {
    // Setup webview connection
    this.#setupConnection();
  }

  #setupConnection(): void {
    const connection = this.#connectionProvider.getConnection<DuoAgentPlatformMessages>(
      DUO_AGENT_PLATFORM_WEBVIEW_ID,
    );

    const extensionMessageBus = this.#extensionMessageBusProvider.getMessageBus(
      DUO_AGENT_PLATFORM_WEBVIEW_ID,
    );

    connection.onInstanceConnected((instanceId, messageBus) => {
      this.#logger.debug(`Duo Agent Platform instance connected: ${instanceId}`);

      let repositoriesChangeDisposable: Disposable | null = null;
      let repositoriesReadyTimeout: ReturnType<typeof setTimeout> | null = null;
      let checkQuotaAbortController: AbortController | null = null;

      // Reactively forward authentication state so the webview can gate on a valid token.
      const authStatusDisposable = this.#gitlabApiService.onApiReconfigured((data) => {
        messageBus.sendNotification('setAuthenticationStatus', data.isInValidState);
      });

      // ===== Handle Notifications =====

      messageBus.onNotification('appReady', async () => {
        this.#logger.debug('Duo Agent Platform app ready');

        // Seed the webview with the current auth state. `onApiReconfigured` only fires on
        // change, so a webview connecting after the last reconfigure would otherwise never
        // learn it.
        messageBus.sendNotification(
          'setAuthenticationStatus',
          Boolean(this.#gitlabApiService.instanceInfo),
        );

        repositoriesChangeDisposable?.dispose();
        if (repositoriesReadyTimeout) clearTimeout(repositoriesReadyTimeout);
        repositoriesReadyTimeout = null;

        try {
          let initialStateSent = false;

          const hasProjects = (repos: AgentPlatformRepository[]) =>
            repos.some((repo) => repo.projects.length > 0);

          // The first snapshot that actually contains projects becomes `initialState`;
          // later changes are `setRepositories`. Holding `initialState` until projects
          // resolve keeps the webview's loading state up instead of flashing a "no
          // project" screen while the host is still discovering repositories.
          const publishRepositories = (repos: AgentPlatformRepository[]) => {
            const parsedRepos = this.#convertProjectGidsToIds(repos);
            if (initialStateSent) {
              messageBus.sendNotification('setRepositories', { repositories: parsedRepos });
              return;
            }
            initialStateSent = true;
            if (repositoriesReadyTimeout) {
              clearTimeout(repositoriesReadyTimeout);
              repositoriesReadyTimeout = null;
            }
            messageBus.sendNotification('initialState', { repositories: parsedRepos });
          };

          repositoriesChangeDisposable = this.#agentPlatformProjectService.onRepositoriesChange(
            ({ repositories }) => {
              // Ignore project-less snapshots until the initial state is out, so discovery
              // settling in stages doesn't prematurely end loading.
              if (!initialStateSent && !hasProjects(repositories)) return;
              publishRepositories(repositories);
            },
          );

          const { repositories } = await this.#agentPlatformProjectService.getRepositories();
          if (!initialStateSent) {
            if (hasProjects(repositories)) {
              publishRepositories(repositories);
            } else {
              repositoriesReadyTimeout = setTimeout(() => {
                repositoriesReadyTimeout = null;
                if (!initialStateSent) publishRepositories(repositories);
              }, REPOSITORIES_READY_TIMEOUT_MS);
            }
          }
        } catch {
          this.#logger.error('Failed to get initialState');
        }

        try {
          const { commands: skillSlashCommands } =
            await this.#agentSkillsResolver.getSkillSlashCommands();
          if (skillSlashCommands.length > 0) {
            messageBus.sendNotification('setSkillSlashCommands', skillSlashCommands);
          }
        } catch (e) {
          this.#logger.warn('Failed to resolve skill slash commands', e as Error);
        }
      });

      messageBus.onNotification('copyMessage', async (payload: { message: string }) => {
        extensionMessageBus.sendNotification('copyMessage', { message: payload.message });
      });

      messageBus.onNotification('copyCodeSnippet', async (payload: { snippet: string }) => {
        extensionMessageBus.sendNotification('copyCodeSnippet', payload);
      });

      messageBus.onNotification('insertCodeSnippet', async (payload: { snippet: string }) => {
        extensionMessageBus.sendNotification('insertCodeSnippet', payload);
      });

      messageBus.onNotification('openUrl', async (payload: { url: string }) => {
        try {
          await this.#urlOpenerService.openUrl(payload.url);
        } catch (e) {
          this.#logger.error('Failed to open URL', e as Error);
        }
      });

      messageBus.onNotification('submitFeedback', async (context: UserFeedbackContext) => {
        try {
          await this.#handleSubmitFeedback(context);
        } catch (error) {
          this.#logger.error('Failed to submit feedback', error);
        }
      });

      messageBus.onNotification('startWorkflow', async (payload: RunWorkflowPayload) => {
        this.#logger.debug(`Starting workflow. goal: ${payload.goal}`);
        try {
          await this.#handleStartWorkflow(payload, messageBus);
        } catch (error) {
          this.#logger.error('Failed to start workflow', error);
        }
      });

      messageBus.onNotification('stopWorkflow', ({ workflowId, source }: StopWorkflowPayload) => {
        this.#logger.debug(`Stopping workflow ${workflowId}`);
        this.#duoAgentPlatformTracker.trackEvent(DuoAgentPlatformEvent.WorkflowStopped, {
          source,
          workflowId,
          reason: 'stop_button_click',
        });

        try {
          this.#workflowManager.stopWorkflow(workflowId);
        } catch (e) {
          this.#logger.error(`Failed to stop workflow ${workflowId}`, e as Error);
        }
      });

      messageBus.onNotification(
        'sendWorkflowEvent',
        async ({ workflowId, eventType, message }: SendWorkflowEventPayload) => {
          this.#logger.debug(`Sending '${eventType}' event to workflow ${workflowId}`);
          try {
            await this.#workflowManager.sendEvent(workflowId, eventType, message);
          } catch (error) {
            this.#logger.error(`Failed to send '${eventType}' event to workflow`, error);
          }
        },
      );

      messageBus.onNotification(
        'selectProjectForWorkflow',
        async ({ repositoryPath, projectPath }: SelectProjectForWorkflow) => {
          try {
            this.#logger.debug(`Selecting project ${projectPath} for repository ${repositoryPath}`);
            await this.#agentPlatformProjectService.setSelectedProject(repositoryPath, projectPath);
          } catch (e) {
            const error = e as Error;
            this.#logger.error('Failed to select project', error);
          }
        },
      );

      messageBus.onNotification(
        'persistSelectedModel',
        async ({ modelRef }: { modelRef: string | null }) => {
          try {
            await this.#verifyUser();

            if (modelRef) {
              await this.#storage.set(SELECTED_CHAT_MODEL_STORAGE_KEY, modelRef);
              this.#logger.debug(`Persisted selected model: ${modelRef}`);
            } else {
              await this.#storage.delete(SELECTED_CHAT_MODEL_STORAGE_KEY);
              this.#logger.debug('Cleared persisted selected model');
            }
          } catch (e) {
            this.#logger.error('Failed to persist selected model', e as Error);
          }
        },
      );

      messageBus.onNotification(
        'checkUsageQuota',
        async ({ rootNamespaceId, workflowDefinition, projectId }: CheckUsageQuotaPayload) => {
          checkQuotaAbortController?.abort();
          checkQuotaAbortController = new AbortController();
          const { signal } = checkQuotaAbortController;
          try {
            const exceeded = await this.#usageQuotaService.checkUsageCreditsExceeded(
              signal,
              rootNamespaceId,
              workflowDefinition,
              projectId,
            );
            if (signal.aborted) return;
            messageBus.sendNotification('setUsageQuotaExceeded', { exceeded });
          } catch (e) {
            this.#logger.error('Failed to check usage quota', e as Error);
          }
        },
      );

      // ===== Handle Requests =====

      messageBus.onRequest('getContextCategories', async () => {
        try {
          return await this.#chatContextManager.getAvailableCategories();
        } catch (e) {
          this.#logger.error('Failed to fetch context categories', e as Error);
          return [];
        }
      });

      messageBus.onRequest(
        'searchContextItems',
        async ({ query, category }: { query: string; category: AIContextCategory }) => {
          try {
            const results = await this.#chatContextManager.searchContextItems({
              query,
              category,
            });
            return { success: true, results };
          } catch (e) {
            return { success: false, error: (e as Error).message };
          }
        },
      );

      messageBus.onRequest('addContextItem', async (item) => {
        try {
          await this.#chatContextManager.addSelectedContextItem(item);
          const items = await this.#chatContextManager.getSelectedContextItems();
          return { success: true, items };
        } catch (e) {
          this.#logger.error('Failed to add context item', e as Error);
          return { success: false, error: (e as Error).message };
        }
      });

      messageBus.onRequest('removeContextItem', async (item) => {
        try {
          await this.#chatContextManager.removeSelectedContextItem(item);
          const items = await this.#chatContextManager.getSelectedContextItems();
          return { success: true, items };
        } catch (e) {
          this.#logger.error('Failed to remove context item', e as Error);
          return { success: false, error: (e as Error).message };
        }
      });

      messageBus.onRequest('clearSelectedContextItems', async () => {
        try {
          await this.#chatContextManager.clearSelectedContextItems();
          return { success: true, items: [] };
        } catch (e) {
          this.#logger.error('Failed to clear context items', e as Error);
          return { success: false, error: (e as Error).message };
        }
      });

      messageBus.onRequest('getUserWorkflows', async (params: getWorkflowsVariables) => {
        const result = await this.#workflowManager.getUserWorkflows(params);
        return result;
      });

      messageBus.onRequest(
        'deleteWorkflow',
        async (params: DeleteDuoWorkflowsWorkflowVariables) => {
          const result = await this.#workflowManager.deleteDuoWorkflow(params);
          return result;
        },
      );

      messageBus.onRequest(
        'fetchAvailableModels',
        async ({ rootNamespaceId }: { rootNamespaceId: string }) => {
          const data = await this.#workflowManager.fetchAvailableModels(rootNamespaceId);

          const instanceVersion = data.metadata?.version;

          const userModelSwitchingEnabled = instanceVersion
            ? ifVersionGte(
                instanceVersion,
                '18.5.0',
                () => true,
                () =>
                  data.metadata?.featureFlags?.find(
                    (flag) => flag.name === InstanceFeatureFlags.UserModelSwitching,
                  )?.enabled ?? false,
              )
            : false;

          return { ...data, userModelSwitchingEnabled };
        },
      );

      messageBus.onRequest('getPersistedSelectedModel', async () => {
        try {
          await this.#verifyUser();
          const modelRef = await this.#storage.get(SELECTED_CHAT_MODEL_STORAGE_KEY);
          this.#logger.debug(`Retrieved persisted selected chat model: ${modelRef ?? 'none'}`);
          return modelRef ?? null;
        } catch (e) {
          this.#logger.error('Failed to retrieve persisted selected model', e as Error);
          return null;
        }
      });

      messageBus.onRequest(
        'fetchAgents',
        async ({
          projectId,
          namespaceId,
        }: {
          projectId: string;
          namespaceId: string;
        }): Promise<FetchAgentsResult> => {
          const agents: Agent[] = [];
          const projectGid = toGitLabGid(GID_NAMESPACE_PROJECT, projectId);
          const namespaceGid = toGitLabGid(GID_NAMESPACE_GROUP, namespaceId);

          // add foundational agents
          try {
            const foundationalData = await this.#workflowManager.fetchFoundationalAgents(
              projectGid,
              namespaceGid,
            );
            for (const agent of foundationalData.aiFoundationalChatAgents?.nodes ?? []) {
              agents.push({
                id: agent.id,
                name: agent.name,
                description: agent.description,
                foundational: true,
                referenceWithVersion: agent.referenceWithVersion,
              });
            }
          } catch (e) {
            this.#logger.error('Failed to fetch foundational agents', e as Error);
          }

          // add catalog agents
          try {
            const catalogData = await this.#workflowManager.fetchCatalogAgents(projectGid);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const instanceVersion = coerce(catalogData.metadata.version || '0.0.0')!;

            catalogData.aiCatalogConfiguredItems.nodes.forEach((node) => {
              // GitLab instances 18.7+ have the `pinnedItemVersion` field, which returns
              // the version of the item at the version it was pinned. Earlier instances
              // did not have this field, and the feature was experimental and not released,
              // and so we allow a fallback to `latestVersion`. This fallback is not safe
              // for 18.7+
              if (gte(instanceVersion, '18.7.0')) {
                if (!node.pinnedItemVersion) {
                  // Do not add this agent
                  return;
                }
                // Add the agent using the pinned version
                agents.push({
                  ...node.item,
                  foundational: false,
                  pinnedItemVersionId: node.pinnedItemVersion?.id,
                });
              } else {
                // Add the agent using the latest version
                agents.push({
                  ...node.item,
                  foundational: false,
                  pinnedItemVersionId: node.item.latestVersion?.id,
                });
              }
            });
          } catch (e) {
            this.#logger.error('Failed to fetch catalog agents', e as Error);
          }

          return { agents };
        },
      );

      messageBus.onRequest(
        'getAgentFlowConfig',
        async ({ agentVersionId }: { agentVersionId: string }): Promise<string> => {
          try {
            return await this.#workflowManager.fetchAgentFlowConfig(agentVersionId);
          } catch (e) {
            this.#logger.error('Failed to fetch agent flow config', e as Error);
            return '';
          }
        },
      );

      messageBus.onRequest('checkHealth', ({ projectPath }: { projectPath: string }) =>
        this.#workflowManager.getHealthCheck(projectPath),
      );

      return {
        dispose() {
          repositoriesChangeDisposable?.dispose();
          repositoriesChangeDisposable = null;
          if (repositoriesReadyTimeout) clearTimeout(repositoriesReadyTimeout);
          repositoriesReadyTimeout = null;
          checkQuotaAbortController?.abort();
          checkQuotaAbortController = null;
          authStatusDisposable.dispose();
        },
      };
    });
  }

  async #handleSubmitFeedback(context: UserFeedbackContext): Promise<void> {
    this.#duoAgentPlatformTracker.trackEvent(DuoAgentPlatformEvent.UserFeedback, {
      source: context.workflowType,
      feedbackType: context.feedback.feedbackType,
      reason: context.feedback.reason,
      workflowId: tryParseGitLabGidToString(context.workflowId),
    });
  }

  async #handleStartWorkflow(
    payload: RunWorkflowPayload,
    messageBus: MessageBus<{
      inbound: DuoAgentPlatformMessages['fromWebview'];
      outbound: DuoAgentPlatformMessages['toWebview'];
    }>,
  ): Promise<void> {
    const allContext = await this.#prepareAdditionalContext(payload);

    const workflowPayload: RunWorkflowPayload = {
      goal: payload.goal,
      type: payload.type as RunWorkflowPayload['type'],
      metadata: {
        projectId: payload.metadata.projectId || undefined,
        projectPath: payload.metadata.projectPath,
        namespaceId: payload.metadata.namespaceId || undefined,
        rootNamespaceId: payload.metadata.rootNamespaceId || undefined,
        selectedModelIdentifier: payload.metadata.selectedModelIdentifier,
        rootFsPath: payload.metadata.rootFsPath,
      },
      existingWorkflowId: payload.existingWorkflowId || undefined,
      preCreatedWorkflowId: payload.preCreatedWorkflowId || undefined,
      workflowDefinition: payload.workflowDefinition,
      aiCatalogItemVersionId: payload.aiCatalogItemVersionId,
      flowConfig: payload.flowConfig,
      additionalContext: allContext,
      toolApproval: payload.toolApproval,
    };

    let workflowId: string | undefined;

    // NOTE(patch-B.3 / idle ws): the workflow socket's idle-drop prevention
    // already lives first-party in @gitlab-org/workflow-executor —
    // WebSocketWorkflowClient.#startHeartbeat (packages/lib_workflow_executor/
    // src/executors/node/clients/websocket_client.ts:185, 60s interval). The
    // remaining reconnect-with-resume enhancement is TODO'd at that same site.
    // (The proactive TOKEN refresh half of the idle bug is handled by
    // TokenRefresher in the CLI.)
    try {
      // Wrap the outbound workflow start in the credit-ledger circuit breaker
      // (silent retarget + retry once on quota exhaustion). Pass-through when
      // the pool bridge is not enabled.
      const result = await guardWorkflowCall(() =>
        this.#workflowManager.startWorkflow(workflowPayload),
      );
      workflowId = result.workflowId;

      messageBus.sendNotification('workflowStarted', { workflowId });

      await this.#serializeContextOp(() => this.#chatContextManager.clearSelectedContextItems());
      messageBus.sendNotification('setContextCurrentItemsResult', []);

      for await (const event of result.events) {
        if (isWorkflowExecutorErrorEvent(event)) {
          this.#logger.error(`Workflow error: ${event.message}`);
          if (event.statusCode === WorkflowStatusCode.USAGE_QUOTA_EXCEEDED) {
            messageBus.sendNotification('setUsageQuotaExceeded', {
              exceeded: true,
              isMidStream: true,
            });
          } else {
            messageBus.sendNotification('workflowError', {
              message: event.message,
              workflowId,
            });
          }
          messageBus.sendNotification('workflowCompleted', {
            workflowId,
            status: DuoWorkflowStatus.FAILED,
            error: event.message,
          });
          return;
        }

        // Skip any non-checkpoint event (e.g. retry/progress signalling). This
        // consumer only handles errors (above) and checkpoints (below); new
        // out-of-band event types are ignored by default.
        // eslint-disable-next-line no-continue
        if (!isDuoWorkflowEvent(event)) continue;

        this.#logger.debug(`Workflow event for ${workflowId}: status=${event.workflowStatus}`);

        const messages = this.#extractMessages(event);

        // Credit-ledger attribution: one billable llm call per new agent
        // message OR model-driven tool call in this checkpoint (the delta
        // since the last one). Fire-and-forget; the ledger also dedupes by
        // eventId as a backstop.
        if (workflowId) {
          this.#attributeBillableCalls(event, workflowId, Boolean(payload.existingWorkflowId));
        }

        messageBus.sendNotification('workflowEvent', {
          workflowId,
          checkpoint: event.checkpoint,
          errors: event.errors,
          workflowGoal: event.workflowGoal,
          workflowStatus: event.workflowStatus,
          messages,
        });

        if (isTerminated(event.workflowStatus)) {
          messageBus.sendNotification('workflowCompleted', {
            workflowId,
            status: event.workflowStatus,
          });
          return;
        }
      }

      // The stream ended without a terminal checkpoint (e.g. the turn paused for
      // input); treat the run as finished so the webview clears its loading state.
      messageBus.sendNotification('workflowCompleted', {
        workflowId,
        status: DuoWorkflowStatus.FINISHED,
      });
    } catch (error) {
      this.#logger.error('Workflow execution failed', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
      if (errorMessage.includes('insufficient GitLab credits')) {
        messageBus.sendNotification('setUsageQuotaExceeded', {
          exceeded: true,
          isMidStream: true,
        });
      } else {
        messageBus.sendNotification('workflowError', {
          message: errorMessage,
          workflowId,
        });
      }
      if (workflowId) {
        messageBus.sendNotification('workflowCompleted', {
          workflowId,
          status: DuoWorkflowStatus.FAILED,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * Attribute one billable llm call per NEW agent message or model-driven tool
   * call introduced by this checkpoint. Delegates the frame classification and
   * cumulative-delta bookkeeping to CheckpointAttributionTracker; eventId is
   * `${workflowId}:${checkpointId}:${index}` so a resume/replay of the same
   * checkpoint dedupes in the ledger.
   */
  #attributeBillableCalls(
    event: {
      checkpoint: string;
      errors: string[];
      workflowGoal: string;
      workflowStatus: DuoWorkflowStatus;
    },
    workflowId: string,
    isResume: boolean,
  ): void {
    // On a resumed workflow, the first checkpoint replays the whole prior
    // conversation; seed the cursor so that history isn't re-attributed.
    if (isResume) this.#attributionTracker.seedResume(event, workflowId);
    for (const call of this.#attributionTracker.framesToAttribute(event, workflowId)) {
      this.#creditAttribution
        .onLlmCall({ workflowId, sessionId: workflowId, callId: call.callId })
        .catch(() => undefined);
    }
  }

  #extractMessages(event: {
    checkpoint: string;
    errors: string[];
    workflowGoal: string;
    workflowStatus: DuoWorkflowStatus;
  }): DuoMessage[] {
    const result = extractUiChatLog(event);
    if (result.isErr()) {
      this.#logger.warn(`Failed to extract chat messages: ${result.error.message}`);
      return [];
    }
    return result.value.map(
      (log): DuoMessage => ({
        content: log.content,
        messageType: log.message_type,
        toolInfo: log.tool_info ? JSON.stringify(log.tool_info) : null,
      }),
    );
  }

  #convertProjectGidsToIds(repositories: AgentPlatformRepository[]): AgentPlatformRepository[] {
    return repositories.map((r) => ({
      ...r,
      projects: r.projects.map((project) => ({
        ...project,
        id: project.id ? tryParseGitLabGidToString(project.id) : null,
        namespaceId: project.namespaceId ? tryParseGitLabGidToString(project.namespaceId) : null,
        rootNamespaceId: project.rootNamespaceId
          ? tryParseGitLabGidToString(project.rootNamespaceId)
          : null,
      })),
    }));
  }

  /**
   * Helper to verify user if they can execute storage operations
   */
  async #verifyUser(): Promise<void> {
    // getUser() throws when the user is not authenticated;
    await this.#userService.getUser();
  }

  async #serializeContextOp<T>(op: () => Promise<T>): Promise<T> {
    const next = this.#contextPrepLock.then(op, op);
    // Stored chain swallows rejections so one failure can't poison future ops.
    // `next` is returned with the rejection intact for the caller.
    this.#contextPrepLock = next.catch(() => undefined);
    return next;
  }

  async #prepareAdditionalContext(payload: RunWorkflowPayload): Promise<AIContextItem[]> {
    return this.#serializeContextOp(async () => {
      let userContext: AIContextItem[] = [];
      try {
        userContext = await this.#chatContextManager.retrieveContextItemsWithContent({
          newConversation: !payload.existingWorkflowId,
          mode: 'agentic',
        });
      } catch (e) {
        this.#logger.error('Failed to retrieve context items, proceeding without them', e as Error);
      }

      let systemContext: AIContextItem[] = [];
      if (!payload.existingWorkflowId) {
        try {
          systemContext = await this.#systemContextManager.getSystemContextItems();
        } catch (error) {
          this.#logger.error('Error getting system context', error);
        }
      }

      return [...systemContext, ...userContext];
    });
  }
}
