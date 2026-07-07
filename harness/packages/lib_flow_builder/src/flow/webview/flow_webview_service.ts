import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { WebviewConnectionProvider } from '@gitlab-org/webview';
import type { MessageBus } from '@gitlab-org/message-bus';
import {
  WorkflowRunner,
  DuoWorkflowStatus,
  isWorkflowExecutorErrorEvent,
  isDuoWorkflowEvent,
} from '@gitlab-lsp/workflow-api';
import { AgentPlatformProjectService } from '@gitlab-lsp/workflow-api/node';
import { tryParseGitLabGidToString, UserService } from '@gitlab-org/core';
import {
  GetUserProjectPermissionsQuery,
  GraphQLService,
  ProjectUserPermissions,
} from '@gitlab-org/graphql';
import type { AIContextItem } from '@gitlab-org/ai-context';
import * as yaml from 'js-yaml';
import {
  FLOW_BUILDER_WEBVIEW_ID,
  type FlowBuilderMessages,
  type ExecutionEvent,
  type SessionInfo,
  type SessionProjectRole,
} from '../../webview/flow';
import { CatalogFlowStore, FlowStore } from '../persistence';
import {
  NodeTypeDefinitionProvider,
  RuntimeProvidedVariableProvider,
  ToolProvider,
} from '../registry';
import { FLOW_V1_SCHEMA_VERSION } from '../persistence/resolver/v1';
import { flowStoreErrorToIssues } from '../validation';
import { wrapSaveExceptionIssues } from './wrap_save_exception_issues';

/**
 * Message bus type for Flow Builder communication
 */
type FlowMessageBus = MessageBus<{
  inbound: FlowBuilderMessages['fromWebview'];
  outbound: FlowBuilderMessages['toWebview'];
}>;

interface ActiveExecution {
  workflowId: string;
  context: Record<string, string>;
  aborted: boolean;
}

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    Logger,
    FlowStore,
    CatalogFlowStore,
    NodeTypeDefinitionProvider,
    ToolProvider,
    RuntimeProvidedVariableProvider,
    WebviewConnectionProvider,
    WorkflowRunner,
    AgentPlatformProjectService,
    UserService,
    GraphQLService,
  ],
  autoActivate: true,
})
export class FlowWebviewService {
  #logger: Logger;

  #flowStore: FlowStore;

  #catalogFlowStore: CatalogFlowStore;

  #nodeTypeDefinitionProvider: NodeTypeDefinitionProvider;

  #toolProvider: ToolProvider;

  #runtimeProvidedVariableProvider: RuntimeProvidedVariableProvider;

  #connectionProvider: WebviewConnectionProvider;

  #workflowRunner: WorkflowRunner;

  #agentPlatformProjectService: AgentPlatformProjectService;

  #userService: UserService;

  #graphql: GraphQLService;

  /** Track active executions by executionId */
  #activeExecutions: Map<string, ActiveExecution> = new Map();

  constructor(
    logger: Logger,
    flowStore: FlowStore,
    catalogFlowStore: CatalogFlowStore,
    nodeTypeDefinitionProvider: NodeTypeDefinitionProvider,
    toolProvider: ToolProvider,
    runtimeProvidedVariableProvider: RuntimeProvidedVariableProvider,
    connectionProvider: WebviewConnectionProvider,
    workflowRunner: WorkflowRunner,
    agentPlatformProjectService: AgentPlatformProjectService,
    userService: UserService,
    graphql: GraphQLService,
  ) {
    this.#logger = withPrefix(logger, '[FlowWebviewService]');
    this.#flowStore = flowStore;
    this.#catalogFlowStore = catalogFlowStore;
    this.#nodeTypeDefinitionProvider = nodeTypeDefinitionProvider;
    this.#toolProvider = toolProvider;
    this.#runtimeProvidedVariableProvider = runtimeProvidedVariableProvider;
    this.#connectionProvider = connectionProvider;
    this.#workflowRunner = workflowRunner;
    this.#agentPlatformProjectService = agentPlatformProjectService;
    this.#userService = userService;
    this.#graphql = graphql;

    this.#initialize().catch((error) => {
      this.#logger.error('Failed to initialize FlowWebviewService', error);
    });
  }

  async #initialize(): Promise<void> {
    // Initialize persistence layer
    const result = await this.#flowStore.initialize();

    if (result.isErr()) {
      this.#logger.error('Failed to initialize flow store', result.error);
      throw new Error(
        result.error.type === 'invalid_format'
          ? result.error.message
          : 'Failed to initialize flow store',
      );
    }

    // Setup webview connection
    this.#setupConnection();
  }

  #setupConnection(): void {
    const connection =
      this.#connectionProvider.getConnection<FlowBuilderMessages>(FLOW_BUILDER_WEBVIEW_ID);

    connection.onInstanceConnected((instanceId, messageBus) => {
      this.#logger.debug(`Flow Builder instance connected: ${instanceId}`);

      // ===== Handle Notifications =====

      messageBus.onNotification('appReady', async () => {
        this.#logger.debug('Flow Builder app ready');
        const nodeTypeDefinitions = this.#nodeTypeDefinitionProvider.getNodeTypeDefinitions();
        const toolDefinitions = this.#toolProvider.getAll();
        const runtimeProvidedVariableDefinitions = this.#runtimeProvidedVariableProvider.getAll();
        messageBus.sendNotification('initialState', {
          nodeTypeDefinitions,
          toolDefinitions,
          runtimeProvidedVariableDefinitions,
        });
      });

      // ===== Handle Requests =====

      messageBus.onRequest('saveFlow', async ({ uri, flow }) => {
        this.#logger.debug('Save flow requested');

        const result = await this.#flowStore.saveFlow(flow, uri);

        return result.match(
          () => {
            // Send notification for UI updates
            messageBus.sendNotification('flowSaved', { timestamp: new Date() });
            return { success: true as const };
          },
          (error) => {
            this.#logger.error('Failed to save flow', error);
            return {
              success: false as const,
              issues: wrapSaveExceptionIssues(flowStoreErrorToIssues(error)),
            };
          },
        );
      });

      messageBus.onRequest('loadFlow', async ({ uri }) => {
        const result = await this.#flowStore.loadFlow(uri);

        return result.match(
          (flow) => flow,
          (error) => {
            if (error.type === 'not_found') {
              return null;
            }
            this.#logger.error('Failed to load flow', error);
            return null;
          },
        );
      });

      messageBus.onRequest('getNodeTypeDefinitions', async () => {
        return this.#nodeTypeDefinitionProvider.getNodeTypeDefinitions();
      });

      messageBus.onRequest('getToolDefinitions', async () => {
        return this.#toolProvider.getAll();
      });

      // ===== Execution Handlers =====

      messageBus.onRequest('getExecutionContext', async () => {
        return {
          projectPath: this.#workflowRunner.getProjectPath(),
          namespacePath: this.#workflowRunner.getNamespacePath(),
          isReady: Boolean(this.#workflowRunner.getProjectPath()),
        };
      });

      messageBus.onRequest('getSessionInfo', async () => this.#buildSessionInfo());

      messageBus.onRequest('executeFlow', async ({ uri, context }) => {
        const goalPreview = context.goal?.substring(0, 50) || '(no goal)';
        const contextKeys = Object.keys(context).join(', ');
        this.#logger.info(
          `Execute flow requested: ${uri} with context keys: [${contextKeys}], goal: ${goalPreview}...`,
        );

        try {
          // 1. Load raw YAML from disk
          const yamlResult = await this.#flowStore.loadFlowYaml(uri);

          if (yamlResult.isErr()) {
            this.#logger.error('Failed to load flow YAML', yamlResult.error);
            const [firstIssue] = flowStoreErrorToIssues(yamlResult.error);
            return {
              success: false as const,
              error:
                yamlResult.error.type === 'not_found'
                  ? 'Flow file not found. Please save the flow first.'
                  : `Failed to load flow: ${firstIssue?.message ?? 'Unknown error'}`,
            };
          }

          const flowConfig = yamlResult.value;

          // DEBUG: Log the flowConfig being sent to the backend
          this.#logger.debug(
            `Flow config YAML (first 2000 chars):\n${flowConfig.substring(0, 2000)}`,
          );

          // 2. Generate execution ID
          const executionId = crypto.randomUUID();

          // 3. Get project context
          const projectPath = this.#workflowRunner.getProjectPath();

          if (!projectPath) {
            return {
              success: false as const,
              error: 'No project configured. Please open a GitLab project.',
            };
          }

          // 4. Track the execution
          this.#activeExecutions.set(executionId, {
            workflowId: '', // Will be set when workflow starts
            context,
            aborted: false,
          });

          // 5. Notify frontend that execution is starting
          messageBus.sendNotification('executionStarted', { executionId, context });

          // 6. Start workflow execution in background (intentionally not awaited)
          // eslint-disable-next-line no-void
          void this.#runWorkflowExecution(executionId, flowConfig, context, messageBus);

          return { success: true as const, executionId };
        } catch (error) {
          this.#logger.error('Failed to start flow execution', error);
          return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Unknown error starting execution',
          };
        }
      });

      messageBus.onRequest('cancelExecution', async ({ executionId }) => {
        this.#logger.info(`Cancel execution requested: ${executionId}`);

        const execution = this.#activeExecutions.get(executionId);
        if (!execution) {
          return { success: false };
        }

        // Mark as aborted
        execution.aborted = true;

        // Stop the workflow if we have a workflowId
        if (execution.workflowId) {
          this.#workflowRunner.stopWorkflow(execution.workflowId);
        }

        this.#activeExecutions.delete(executionId);

        return { success: true };
      });

      // ===== Catalog Handlers =====

      messageBus.onRequest('listCatalogFlows', async (params) => {
        const result = await this.#catalogFlowStore.listCatalogFlows(params);

        return result.match(
          (page) => ({ success: true as const, page }),
          (error) => {
            this.#logger.error('Failed to list catalog flows', error);
            return {
              success: false as const,
              error: error.type === 'io_error' ? error.message : 'Failed to list catalog flows',
            };
          },
        );
      });

      messageBus.onRequest(
        'createCatalogFlow',
        async ({ name, description, public: isPublic, flow }) => {
          const projectPath = this.#workflowRunner.getProjectPath();
          if (!projectPath) {
            return {
              success: false as const,
              error: 'No project configured. Open a GitLab project before creating a catalog flow.',
            };
          }

          let projectId: string | undefined;
          try {
            const projectData = await this.#agentPlatformProjectService.getProjectData(projectPath);
            projectId = projectData.projectId ?? undefined;
          } catch (error) {
            this.#logger.error('Failed to resolve project for catalog flow creation', error);
            return {
              success: false as const,
              error: `Failed to resolve project: ${error instanceof Error ? error.message : String(error)}`,
            };
          }

          if (!projectId) {
            return {
              success: false as const,
              error: 'Active project has no resolvable GitLab project ID',
            };
          }

          const result = await this.#catalogFlowStore.createFlow({
            projectId,
            name,
            description,
            public: isPublic,
            flow,
          });

          return result.match(
            ({ uri, summary }) => ({ success: true as const, uri, summary }),
            (error) => {
              this.#logger.error('Failed to create catalog flow', error);
              const issues = wrapSaveExceptionIssues(
                flowStoreErrorToIssues(error),
                "Couldn't create this catalog flow",
              );
              return {
                success: false as const,
                error: issues[0]?.message ?? "Couldn't create this catalog flow",
                details:
                  issues.length > 1 ? issues.slice(1).map((issue) => issue.message) : undefined,
              };
            },
          );
        },
      );
    });
  }

  /**
   * Run workflow execution and stream events to the webview
   */
  async #runWorkflowExecution(
    executionId: string,
    flowConfig: string,
    context: Record<string, string>,
    messageBus: FlowMessageBus,
  ): Promise<void> {
    const execution = this.#activeExecutions.get(executionId);
    if (!execution) {
      this.#logger.warn(`Execution ${executionId} not found when starting`);
      return;
    }

    let lastCheckpoint: string | undefined;
    let finalStatus: 'completed' | 'failed' | 'stopped' = 'completed';

    try {
      this.#logger.debug(
        `Starting workflow with flowConfigSchemaVersion: ${FLOW_V1_SCHEMA_VERSION}`,
      );

      const projectPath = this.#workflowRunner.getProjectPath();
      const projectData = await this.#agentPlatformProjectService.getProjectData(projectPath);
      const projectId = tryParseGitLabGidToString(projectData.projectId ?? undefined) || undefined;
      const namespaceId =
        tryParseGitLabGidToString(projectData.namespaceId ?? undefined) || undefined;
      const rootNamespaceId =
        tryParseGitLabGidToString(projectData.rootNamespaceId ?? undefined) || undefined;

      const additionalContext = this.#buildFlowInputContext(flowConfig, context);

      const generator = this.#workflowRunner.runWorkflow({
        goal: context.goal || '',
        flowConfig,
        flowConfigSchemaVersion: FLOW_V1_SCHEMA_VERSION,
        metadata: {
          projectId,
          namespaceId,
          rootNamespaceId,
          projectPath,
        },
        additionalContext,
      });

      let eventCount = 0;
      for await (const event of generator) {
        eventCount += 1;
        this.#logger.debug(`Received workflow event #${eventCount}: ${JSON.stringify(event)}`);

        // Check if execution was cancelled
        if (execution.aborted) {
          this.#logger.info(`Execution ${executionId} was aborted`);
          finalStatus = 'stopped';
          break;
        }

        // Handle error events
        if (isWorkflowExecutorErrorEvent(event)) {
          this.#logger.error(`Workflow error: ${event.message}`);
          finalStatus = 'failed';
          messageBus.sendNotification('executionCompleted', {
            executionId,
            status: 'failed',
            error: event.message,
          });
          this.#activeExecutions.delete(executionId);
          return;
        }

        // Skip any non-checkpoint event (e.g. retry/progress signalling). This
        // consumer only handles errors (above) and checkpoints (below); new
        // out-of-band event types are ignored by default.
        // eslint-disable-next-line no-continue
        if (!isDuoWorkflowEvent(event)) continue;

        // Convert DuoWorkflowEvent to ExecutionEvent
        const executionEvent: ExecutionEvent = {
          checkpoint: event.checkpoint,
          errors: event.errors,
          workflowGoal: event.workflowGoal,
          workflowStatus: event.workflowStatus as ExecutionEvent['workflowStatus'],
        };

        lastCheckpoint = event.checkpoint;

        // Send update to frontend
        messageBus.sendNotification('executionUpdate', {
          executionId,
          event: executionEvent,
        });

        // Check for terminal states
        if (event.workflowStatus === DuoWorkflowStatus.FINISHED) {
          finalStatus = 'completed';
          break;
        } else if (
          event.workflowStatus === DuoWorkflowStatus.FAILED ||
          event.workflowStatus === DuoWorkflowStatus.STOPPED
        ) {
          finalStatus = event.workflowStatus === DuoWorkflowStatus.FAILED ? 'failed' : 'stopped';
          break;
        }
      }

      // Send completion notification
      this.#logger.debug(
        `Workflow generator finished. Total events: ${eventCount}, finalStatus: ${finalStatus}, lastCheckpoint: ${lastCheckpoint}`,
      );
      messageBus.sendNotification('executionCompleted', {
        executionId,
        status: finalStatus,
        finalCheckpoint: lastCheckpoint,
      });
    } catch (error) {
      this.#logger.error(`Workflow execution failed for ${executionId}`, error);
      messageBus.sendNotification('executionCompleted', {
        executionId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown execution error',
      });
    } finally {
      this.#activeExecutions.delete(executionId);
    }
  }

  /**
   * Build additionalContext items from flow input declarations and UI context values.
   *
   * The backend expects each flow input category as a separate AdditionalContext item
   * with `content` being a JSON object keyed by field name. For example, given:
   *   flow.inputs: [{category: "context", input_schema: {user_name: {type: "string"}}}]
   *   context: {user_name: "John", goal: "..."}
   * This produces: [{category: "context", id: "context", content: '{"user_name":"John"}', ...}]
   */
  #buildFlowInputContext(flowConfigYaml: string, context: Record<string, string>): AIContextItem[] {
    let parsed: unknown;
    try {
      parsed = yaml.load(flowConfigYaml);
    } catch {
      return [];
    }

    const flowInputs = (parsed as Record<string, unknown>)?.flow as
      | Record<string, unknown>
      | undefined;
    const inputs = flowInputs?.inputs as
      | { category: string; input_schema: Record<string, unknown> }[]
      | undefined;
    if (!inputs) return [];

    const items: AIContextItem[] = [];
    for (const { category, input_schema } of inputs) {
      const values: Record<string, string> = {};
      for (const fieldName of Object.keys(input_schema)) {
        const value = context[fieldName];
        if (value !== undefined) {
          values[fieldName] = value;
        }
      }
      if (Object.keys(values).length > 0) {
        // Cast required: AIContextItem has a rigid category enum and mandatory metadata
        // designed for IDE context (files, snippets, etc.). Flow inputs use arbitrary
        // categories and the gRPC layer only needs {category, id, content, metadata}.
        items.push({
          id: category,
          category,
          content: JSON.stringify(values),
          metadata: {
            title: category,
            enabled: true,
            subType: 'snippet',
            icon: '',
            secondaryText: '',
            subTypeLabel: '',
          },
        } as AIContextItem);
      }
    }
    return items;
  }

  /**
   * Compose the session snapshot surfaced to the canvas: who is signed in,
   * which project the LSP is targeting, and what role that user holds on
   * it. User and project resolution are independent — either may end up
   * null without the other failing.
   */
  async #buildSessionInfo(): Promise<SessionInfo> {
    const user = this.#fetchSessionUser();
    const project = await this.#fetchSessionProject();
    return { user, project };
  }

  /**
   * Reads the synchronous user snapshot rather than awaiting
   * `getUser()`. The latter resolves only on `apiReconfigured` with a valid
   * state — if the canvas opens before auth lands, awaiting it would hang
   * `getSessionInfo` (and therefore the whole webview init) forever. We
   * return null until auth populates the field; the webview can refetch
   * later via `useSessionStore.fetchSessionInfo()`.
   */
  #fetchSessionUser(): SessionInfo['user'] {
    const { user } = this.#userService;
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }

  async #fetchSessionProject(): Promise<SessionInfo['project']> {
    const projectPath = this.#workflowRunner.getProjectPath();
    const namespacePath = this.#workflowRunner.getNamespacePath();
    if (!projectPath) return null;

    let projectId: string | null = null;
    try {
      const data = await this.#agentPlatformProjectService.getProjectData(projectPath);
      projectId = data.projectId ?? null;
    } catch (error) {
      this.#logger.warn(`Failed to resolve project ID for "${projectPath}": ${String(error)}`);
    }

    const permissions = await this.#fetchProjectPermissions(projectPath);
    this.#logger.debug('Fetched project permissions', {
      projectPath,
      hasAdminCatalog: permissions?.adminAiCatalogItem,
    });
    return {
      path: projectPath,
      id: projectId,
      namespacePath,
      role: this.#deriveRole(permissions),
      canCreateCatalogItem: permissions?.adminAiCatalogItem ?? null,
      canReadCatalogItem: permissions?.readAiCatalogItem ?? null,
    };
  }

  async #fetchProjectPermissions(projectPath: string): Promise<ProjectUserPermissions | null> {
    try {
      const result = await this.#graphql.execute(GetUserProjectPermissionsQuery, { projectPath });
      return result.project?.userPermissions ?? null;
    } catch (error) {
      this.#logger.warn(
        `Failed to resolve user permissions for "${projectPath}": ${String(error)}`,
      );
      return null;
    }
  }

  #deriveRole(permissions: ProjectUserPermissions | null): SessionProjectRole {
    if (!permissions) return 'unknown';
    if (permissions.removeProject) return 'owner';
    if (permissions.adminProject) return 'maintainer';
    if (permissions.pushCode) return 'developer';
    return 'reader';
  }
}
