import { Logger, withPrefix } from '@gitlab-org/logging';
import { AIContextItem, SystemContextManager, type WorkflowContext } from '@gitlab-org/ai-context';
import { workspaceFolderPathFromUri } from '@gitlab-org/fs';
import {
  generateErrorMessageFromStatusCode,
  isDuoWorkflowEvent,
  isTerminated,
  isTransientStatusCode,
  isWorkflowExecutorErrorEvent,
  isWorkflowRetryEvent,
  RunWorkflowPayload,
  type ToolApproval,
  ToolApprovalType,
  WorkflowRunner,
  WorkflowStatusCode,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';
import { isUsageQuotaExceededError } from '@gitlab-lsp/workflow-api/node';
import {
  type CreateWorkflowOptions,
  type WorkflowId,
  isAgenticChatForbiddenError,
  isDuoCliDisabledError,
  isNoDuoNamespaceError,
} from '@gitlab-org/workflow-executor';
import { isSandboxUnavailableError } from '@gitlab-org/sandbox/errors';
import { ConfigService } from '@gitlab-org/config';
import { ProjectDetails, ProjectService, tryParseGitLabGidToString } from '@gitlab-org/core';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { DuoAgentPlatformEvent, DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { supportsToolCallApprovals } from '@gitlab-org/tool-approval';
import {
  type AgentEvent,
  AgentEventType,
  type AgentMode,
  type ApprovalScope,
  type BackendInitResult,
  CliBackend,
  type UserAction,
  UserActionType,
} from '../backend';
import { getAgentModeConfig } from '../../agents/agents';
import type { ParsedCliInput } from '../../parse';
import type { GitLabModelManager } from './gitlab_model_manager';
import type { GitLabParsedOptions } from './gitlab_parsed_options';
import type { RootNamespaceIdService } from './root_namespace_id_service';
import { buildChatPartialFlowConfig, FLOW_CONFIG_SCHEMA_VERSION } from './flow_config_builder';
import { WorkflowEventMapper } from './workflow_event_mapper';
import { WorkflowAgentPrivileges } from './workflow_agent_privileges';
import { buildPlanContextItem } from './system_context/plan_context';

const RESUMED_SESSION_ENDED_MESSAGE =
  'Previous session has ended and cannot be resumed. Your next message will start a fresh conversation.';

/**
 * Single source of truth for workflow liveness.
 *
 * `resumed` carries an id from a prior process whose liveness has not been
 * probed yet; it is the only state that triggers RESUMED_SESSION_ENDED_MESSAGE
 * when the probe turns out terminal without producing output. A real checkpoint
 * promotes it to `live`; a terminal checkpoint or non-transient failure demotes
 * it to `dead`. Transient errors and an unavailable sandbox leave it `resumed`
 * so the notice still surfaces on the retry.
 */
type WorkflowState =
  | { type: 'none' }
  | { type: 'resumed'; id: WorkflowId }
  | { type: 'live'; id: WorkflowId }
  | { type: 'dead'; id: WorkflowId };

export class GitLabBackend implements CliBackend {
  readonly id = 'gitlab';

  #logger: Logger;

  #workflowRunner: WorkflowRunner;

  #configService: ConfigService;

  #cliInput: ParsedCliInput;

  #backendOpts: GitLabParsedOptions;

  #projectService: ProjectService;

  #rootNamespaceIdService: RootNamespaceIdService;

  #workflowEventMapper: WorkflowEventMapper;

  #systemContextManager: SystemContextManager;

  #mcpManager: McpManagerWorkflowExecutorAdaptor;

  #modelManager: GitLabModelManager;

  #duoAgentPlatformTracker: DuoAgentPlatformTracker;

  #workflow: WorkflowState = { type: 'none' };

  #projectDetails?: ProjectDetails;

  #systemContext: AIContextItem[] = [];

  #firstMessageContext: AIContextItem[] | null = null;

  #activeAgentMode: AgentMode | undefined;

  #privileges: WorkflowAgentPrivileges;

  #workflowCapabilities = new Map<string, string[]>();

  constructor(
    logger: Logger,
    workflowRunner: WorkflowRunner,
    configService: ConfigService,
    cliInput: ParsedCliInput,
    backendOpts: GitLabParsedOptions,
    projectService: ProjectService,
    rootNamespaceIdService: RootNamespaceIdService,
    workflowEventMapper: WorkflowEventMapper,
    systemContextManager: SystemContextManager,
    mcpManager: McpManagerWorkflowExecutorAdaptor,
    modelManager: GitLabModelManager,
    duoAgentPlatformTracker: DuoAgentPlatformTracker,
  ) {
    this.#logger = withPrefix(logger, '[GitLabBackend]');
    this.#workflowRunner = workflowRunner;
    this.#configService = configService;
    this.#cliInput = cliInput;
    this.#backendOpts = backendOpts;
    this.#projectService = projectService;
    this.#rootNamespaceIdService = rootNamespaceIdService;
    this.#workflowEventMapper = workflowEventMapper;
    this.#systemContextManager = systemContextManager;
    this.#mcpManager = mcpManager;
    this.#modelManager = modelManager;
    this.#duoAgentPlatformTracker = duoAgentPlatformTracker;
    this.#privileges = new WorkflowAgentPrivileges(
      workflowRunner,
      this.#isRunCommand || cliInput.dangerouslySkipPermissions,
    );
  }

  get #isRunCommand(): boolean {
    return this.#cliInput.command.name === 'run';
  }

  get #workflowId(): WorkflowId | undefined {
    return 'id' in this.#workflow ? this.#workflow.id : undefined;
  }

  async preinitialize(): Promise<void> {
    this.#mcpManager.preWarm(this.#cliInput.cwd);
  }

  getSessionId(): WorkflowId | undefined {
    return this.#workflowId;
  }

  #errorEvent(message: string): AgentEvent {
    return { type: AgentEventType.Error, message, timestamp: Date.now() };
  }

  dispose(): void {
    this.#workflow = { type: 'none' };
    this.#firstMessageContext = null;
    this.#activeAgentMode = undefined;
    this.#workflowCapabilities.clear();
    this.#logger.debug('GitLabBackend disposed');
  }

  /**
   * Determines which approval scopes are available for tool approvals.
   *
   * @returns Array of available approval scopes, defaulting to ['once'] if no capabilities
   */
  #getAvailableApprovalScopes(): ApprovalScope[] {
    const workflowId = this.#workflowId;

    // If no workflow yet, return minimal set
    if (!workflowId) {
      return ['once'];
    }

    const capabilities = this.#workflowCapabilities.get(workflowId) ?? null;

    const supportsSession = supportsToolCallApprovals({
      logger: this.#logger,
      capabilities,
    });

    return supportsSession ? ['once', 'session'] : ['once'];
  }

  /**
   * Backend initialisation specific to GitLab backend.
   * Common initialisation already run at this point via CliInitialisationService
   */
  async initialize(existingSessionId?: string): Promise<BackendInitResult> {
    if (this.#backendOpts.gitlabProjectPath) {
      this.#configService.set('projectPath', this.#backendOpts.gitlabProjectPath);
    }

    const projectPath =
      this.#backendOpts.gitlabProjectPath || this.#configService.get('projectPath');

    if (projectPath) {
      this.#logger.debug(`Fetching project details for: ${projectPath}`);
      try {
        this.#projectDetails =
          await this.#projectService.getProjectFromPathWithNamespace(projectPath);
        this.#logger.debug(`Fetched project details for ${projectPath}`);
      } catch (error) {
        this.#logger.warn(
          `Failed to fetch project details for ${projectPath}. Some features may be unavailable.`,
          error,
        );
      }
    } else {
      this.#logger.debug(
        "No project path found in config. Falling back to user's configured default Duo namespace.",
      );
    }

    const rootNamespaceId = await this.#rootNamespaceIdService.resolve(this.#projectDetails);
    this.#configService.set('rootNamespaceId', rootNamespaceId);
    await this.#modelManager.initialize();
    await this.#modelManager.resolveModel();

    let sessionRejectionReason: string | undefined;

    if (existingSessionId) {
      this.#workflow = { type: 'resumed', id: existingSessionId };
      this.#logger.debug(`Resuming existing workflow: ${existingSessionId}`);
    } else {
      try {
        const id = await this.#preCreateWorkflow();
        this.#workflow = { type: 'live', id };
        this.#logger.debug(`Created new workflow: ${id}`);
      } catch (error) {
        sessionRejectionReason = this.#createAccessDeniedResult(error);
      }
    }

    // The resumed workflow's privileges may have been set by a different client,
    // so reconcile to the current mode (best-effort).
    if (existingSessionId) {
      const result = await this.#privileges.reconcile(existingSessionId, this.#activeAgentMode);
      if (result.type === 'error') {
        this.#logger.error(
          `Failed to set agent privileges on resume. This might mean the session doesn't have the right tools available. Underlying error: ${result.message}`,
        );
      } else if (result.type === 'applied') {
        this.#logger.debug(
          `Reconciled agent privileges on resume to '${this.#activeAgentMode ?? 'unknown'}' mode`,
        );
      }
    }

    // Fetch system context after workflow creation so hook providers have access to the session ID
    const workflowContext: WorkflowContext | undefined = this.#workflowId
      ? {
          sessionId: this.#workflowId,
          cwd: this.#resolveProjectRoot(),
          source: existingSessionId ? 'resume' : 'startup',
        }
      : undefined;

    try {
      this.#systemContext = await this.#systemContextManager.getSystemContextItems(workflowContext);
      this.#logger.debug(
        `Retrieved ${this.#systemContext.length} system context items for GitLab backend`,
      );
    } catch (error) {
      this.#logger.error('Failed to get system context', error);
      this.#systemContext = [];
    }

    // For new workflows, include system context with the first message
    if (this.#workflowId && !existingSessionId) {
      this.#firstMessageContext = [...this.#systemContext];
    }

    // For interactive mode, workflowId might be undefined if access was denied
    if (!this.#workflowId) {
      if (this.#isRunCommand) {
        throw new Error('Workflow ID not available after initialization');
      }
      // For interactive mode, workflowId is intentionally undefined when access is denied
      // The backend will exist so we can display the UI
      this.#logger.debug('No workflow ID created - Agentic Chat is not available');
    }

    return { sessionId: this.#workflowId || '', sessionRejectionReason };
  }

  get #workflowType(): WorkflowType {
    if (this.#isRunCommand && this.#backendOpts.workflowType) {
      return this.#backendOpts.workflowType as WorkflowType;
    }
    return WorkflowType.CHAT;
  }

  #detectProjectId(): string {
    return tryParseGitLabGidToString(this.#projectDetails?.id);
  }

  #detectNamespaceId(): string {
    return tryParseGitLabGidToString(this.#projectDetails?.namespace.id);
  }

  /**
   * Creates an access result object for display in interactive mode UI
   * For headless 'run' mode, throws the error instead
   */
  #resolveProjectRoot(): string {
    const folders = this.#configService.get('workspaceFolders') || [];
    if (folders.length > 0) {
      return workspaceFolderPathFromUri(folders[0].uri);
    }
    return this.#cliInput.cwd;
  }

  #createAccessDeniedResult(error: unknown): string {
    this.#logger.error('Failed to create workflow', error);

    const failFast = (msg: string): never => {
      throw new Error(`Failed to initialize workflow: ${msg}`);
    };

    // The CLI-tailored, user-facing text lives here rather than in the service
    // layer, which only throws a typed DuoCliDisabledError carrying the raw
    // server reason.
    if (isDuoCliDisabledError(error)) {
      const message =
        'ALCOR has not been enabled by your administrator.\n' +
        'To enable it, ask your administrator to go to:\n' +
        'Admin area > GitLab Duo > Configuration.';

      // For 'run' command, fail fast with the same user-facing message
      if (this.#isRunCommand) failFast(message);

      return message;
    }

    // Typed Duo access errors already carry an accurate, user-facing message — surface it as-is
    // (including in 'run' mode) rather than the generic fail-fast text below.
    if (isAgenticChatForbiddenError(error) || isNoDuoNamespaceError(error)) {
      if (this.#isRunCommand) failFast(error.message);

      return error.message;
    }

    // For 'run' command, always fail fast
    if (this.#isRunCommand) {
      failFast(error instanceof Error ? error.message : 'Unknown error');
    }

    if (isUsageQuotaExceededError(error)) {
      return 'No credits remain for this billing period. Contact your administrator for more credits.';
    }

    // For interactive mode, create an error result for UI display
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error checking Agentic Chat access';

    return `Failed to verify Agentic Chat access: ${errorMessage}. Please check your network connection and GitLab instance availability.`;
  }

  async #preCreateWorkflow(): Promise<string> {
    const aiCatalogVersionItemId = undefined;

    const agentPrivileges = this.#privileges.privilegesForMode(this.#activeAgentMode);
    const autoApprovedOptions = {
      allowAgentToRequestUser: false,
      agentPrivileges,
      preApprovedAgentPrivileges: agentPrivileges,
    };

    let createWorkflowOptions: CreateWorkflowOptions | undefined;

    if (this.#isRunCommand) {
      createWorkflowOptions = {
        ...autoApprovedOptions,
        requiresDuoCliEnabled: false,
      };
    } else if (this.#cliInput.dangerouslySkipPermissions) {
      createWorkflowOptions = {
        ...autoApprovedOptions,
        requiresDuoCliEnabled: true, // TUI mode still requires admin check
      };
    } else {
      createWorkflowOptions = {
        agentPrivileges,
        requiresDuoCliEnabled: true,
      };
    }

    const metadata = {
      rootNamespaceId: this.#configService.get('rootNamespaceId') ?? '',
      selectedModelIdentifier: this.#modelManager.getModel().modelRef,
    };

    const workflowId = await this.#workflowRunner.preCreateWorkflow(
      '',
      this.#workflowType,
      undefined,
      aiCatalogVersionItemId,
      metadata,
      createWorkflowOptions,
    );
    this.#privileges.markCreated(this.#activeAgentMode);

    // Fetch and store server capabilities from the cached token
    const capabilities = this.#workflowRunner.getServerCapabilities(workflowId, this.#workflowType);

    if (capabilities) {
      this.#workflowCapabilities.set(workflowId, capabilities);
      this.#logger.info(
        `Initialized workflow ${workflowId} capabilities: [${capabilities.join(', ')}]`,
      );
    } else {
      this.#logger.warn(`No server capabilities available for workflow ${workflowId}`);
    }

    return workflowId;
  }

  async *sendMessageStream(
    action: UserAction,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent, void, unknown> {
    let flowConfigSchemaVersion: string | undefined;
    let flowConfig: string | undefined;
    let excludeMcpTools: boolean | undefined;
    let flowConfigId: string | undefined;
    let flowVersion: string | undefined;
    let workflowDefinition: string = this.#workflowType;

    if (action.type === UserActionType.SendPrompt) {
      this.#activeAgentMode = action.agentMode;
    }

    if (this.#backendOpts.developer) {
      // Under --developer, the registry developer flow is the single source of
      // truth for BOTH plan and build. The two things that differ per mode are
      // reconciled on the same flow/checkpoint:
      //   - tools: gated server-side via agent privileges (#privileges.reconcile
      //     below + privilegesForMode on create), so plan is read-only.
      //   - prompt: switched via the per-turn `plan_context` item
      //     (#getAiContextItemsForMessage), which the flow resolves into
      //     `plan_enabled`.
      // Keeping a single flow definition means plan↔build switching just resumes
      // the same FlowState checkpoint instead of swapping flow topology
      // mid-session (which closes the websocket and fails the turn).
      this.#logger.info(
        `Developer flow (registry); mode=${this.#activeAgentMode ?? 'build'} via plan_context + agent privileges`,
      );
      flowConfigSchemaVersion = 'v1';
      flowConfigId = 'developer';
      flowVersion = '2.0.0-local';
      flowConfig = undefined;
      workflowDefinition = 'developer/v2-local';
      // Defence-in-depth: plan mode is enforced server-side via agent
      // privileges (READ_ONLY_FILES + READ_ONLY_GITLAB), which already exclude
      // write/MCP tool dispatch. We additionally set excludeMcpTools so MCP
      // tools are never offered in plan mode even if a future privilege change
      // stops covering the MCP channel.
      excludeMcpTools = this.#activeAgentMode === 'plan';
    } else {
      // Legacy (non --developer) path: plan mode mirrors client-side as an inline
      // chat-partial config that the gateway wraps into chat.Workflow. The
      // legacy chat.Workflow does not resolve context:inputs.*, so the
      // plan_context item has no effect here and is omitted (see
      // #getAiContextItemsForMessage).
      const modeConfig = getAgentModeConfig(this.#activeAgentMode);
      if (modeConfig) {
        this.#logger.info(
          `Agent mode: ${modeConfig.name} (${modeConfig.allowedTools.length} tools, MCP ${modeConfig.excludeMcp ? 'excluded' : 'included'})`,
        );
        flowConfig = buildChatPartialFlowConfig(modeConfig);
        flowConfigSchemaVersion = FLOW_CONFIG_SCHEMA_VERSION;
        excludeMcpTools = modeConfig.excludeMcp;
      } else if (this.#isRunCommand) {
        const validated = this.#validateFlowConfigOptions();
        flowConfigSchemaVersion = validated.flowConfigSchemaVersion;
        flowConfigId = validated.flowConfigId;
        flowVersion = validated.flowVersion;
        flowConfig = this.#backendOpts.flowConfig;
      }
    }

    // The gateway re-reads privileges each turn, so reconciling the running
    // workflow applies a mode switch on the next turn without recreating it
    // (preserving history).
    if (this.#workflowId) {
      const result = await this.#privileges.reconcile(this.#workflowId, this.#activeAgentMode);
      if (result.type === 'error') {
        // Under `--developer` the mutation is guaranteed available (the flag is
        // only enabled on instances >= 19.2 that expose it), so abort the turn.
        // Otherwise the switch may hit older instances lacking the mutation, so
        // degrade to the flow config's restricted toolset and continue.
        if (this.#backendOpts.developer) {
          this.#logger.error(`Failed to update agent privileges: ${result.message}`);
          yield {
            type: AgentEventType.Error,
            message: `Failed to switch mode: could not update agent privileges. ${result.message}`,
            timestamp: Date.now(),
          };
          return;
        }
        this.#logger.warn(
          `Could not update agent privileges for mode switch; continuing with prompt/toolset enforcement only: ${result.message}`,
        );
      }
    }

    // A resumed session is the only state eligible for the "session ended"
    // notice. The probe concludes — and this turn-local flag stops mattering —
    // once a real checkpoint promotes it to `live` or a terminal/non-transient
    // outcome demotes it to `dead`.
    const isResumedSession = this.#workflow.type === 'resumed';

    let workflowId = this.#workflow.type === 'dead' ? undefined : this.#workflowId;
    if (!workflowId) {
      try {
        workflowId = await this.#preCreateWorkflow();
        this.#workflow = { type: 'live', id: workflowId };
      } catch (err) {
        this.#logger.error('Error creating workflow', err);
        yield this.#errorEvent(
          generateErrorMessageFromStatusCode(WorkflowStatusCode.FAILED_TO_START),
        );
        return;
      }
    } else if (!this.#workflowCapabilities.has(workflowId)) {
      // For existing workflow, ensure capabilities are fetched if not already present
      const capabilities = this.#workflowRunner.getServerCapabilities(
        workflowId,
        this.#workflowType,
      );
      if (capabilities) {
        this.#workflowCapabilities.set(workflowId, capabilities);
        this.#logger.info(
          `Initialized workflow ${workflowId} capabilities: [${capabilities.join(', ')}]`,
        );
      }
    }

    // Set up abort handler
    const abortHandler = () => {
      if (!workflowId) return;

      if (this.#workflowRunner.isCommandRunning(workflowId)) {
        this.#logger.info(`User interrupted running command in workflow ${workflowId}`);
        this.#workflowRunner.interruptRunningCommand(workflowId);
      } else {
        this.#logger.info(`Aborting workflow ${workflowId}`);
        this.#duoAgentPlatformTracker.trackEvent(DuoAgentPlatformEvent.WorkflowStopped, {
          source: 'chat',
          workflowId,
          reason: 'stop_button_click',
        });
        this.#workflowRunner.stopWorkflow(workflowId);
      }
    };
    signal?.addEventListener('abort', abortHandler);

    try {
      // Build metadata object, using pre-configured values if available
      const metadata = {
        projectId: this.#backendOpts.duoWorkflowProjectId || this.#detectProjectId(),
        namespaceId: this.#backendOpts.duoWorkflowNamespaceId || this.#detectNamespaceId(),
        rootNamespaceId: this.#configService.get('rootNamespaceId') ?? '',
        selectedModelIdentifier: this.#modelManager.getModel().modelRef,
      };

      let toolApproval: ToolApproval | undefined;
      if (action.type === UserActionType.SendToolApproval) {
        if (!action.approved) {
          toolApproval = {
            userApproved: false as const,
            message: action.rejectionReason,
          };
        } else if (action.scope === 'once' || !action.toolArgs) {
          toolApproval = {
            userApproved: true as const,
            toolName: action.toolName,
            type: ToolApprovalType.APPROVE_ONCE,
            toolArgs: action.toolArgs,
          };
        } else if (action.pattern) {
          toolApproval = {
            userApproved: true as const,
            toolName: action.toolName,
            type: ToolApprovalType.APPROVE_PATTERN_FOR_SESSION,
            pattern: action.pattern,
          };
        } else {
          toolApproval = {
            userApproved: true as const,
            toolName: action.toolName,
            type: ToolApprovalType.APPROVE_FOR_SESSION,
            toolArgs: action.toolArgs,
          };
        }
      }

      const workflowPayload: RunWorkflowPayload = {
        goal: this.#resolveGoal(action),
        metadata,
        type: this.#workflowType,
        workflowDefinition,
        existingWorkflowId: workflowId,
        additionalContext: this.#getAiContextItemsForMessage(action),
        toolApproval,
        flowConfig,
        flowConfigSchemaVersion,
        flowConfigId,
        flowVersion,
        excludeMcpTools,
        // Enable token-by-token UI streaming for the interactive developer flow.
        // The developer flow (developer/2.0.0-local) opts into streaming by
        // declaring on_agent_reasoning + on_agent_final_answer in its ui_log_events.
        streaming: this.#backendOpts.developer,
        agentPlatformFeatureSettingName: this.#backendOpts.agentPlatformFeatureSettingName,
        langsmithTrace: this.#backendOpts.langsmithTrace,
      };

      const workflowEvents = this.#workflowRunner.runWorkflow(workflowPayload);
      let noCheckpointYet = true;
      for await (const event of workflowEvents) {
        if (isWorkflowRetryEvent(event)) {
          yield {
            type: AgentEventType.Retry,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            backoffMs: event.backoffMs,
            timestamp: Date.now(),
          };
          // eslint-disable-next-line no-continue
          continue;
        }

        if (isWorkflowExecutorErrorEvent(event)) {
          this.#logger.error(
            `Workflow failed with status code "${event.statusCode}": ${event.message}`,
          );
          const isTransient = event.statusCode !== null && isTransientStatusCode(event.statusCode);
          if (!isTransient) {
            this.#workflow = { type: 'dead', id: workflowId };
          }
          // A transient error leaves the workflow alive, so the next message
          // reuses it — showing the "session ended" message would contradict that.
          const showSessionEnded = isResumedSession && !isTransient;
          yield this.#errorEvent(showSessionEnded ? RESUMED_SESSION_ENDED_MESSAGE : event.message);
          return;
        }

        // Skip any non-checkpoint event (e.g. retry/progress signalling). This
        // consumer only handles errors (above) and checkpoints (below); new
        // out-of-band event types are ignored by default.
        // eslint-disable-next-line no-continue
        if (!isDuoWorkflowEvent(event)) continue;

        if (isTerminated(event.workflowStatus)) {
          this.#workflow = { type: 'dead', id: workflowId };
          // The resume probe produced no output before ending — substitute the
          // friendly notice for the empty terminal checkpoint. A checkpoint that
          // carried output (noCheckpointYet === false) falls through so its
          // content is shown instead.
          if (isResumedSession && noCheckpointYet) {
            yield this.#errorEvent(RESUMED_SESSION_ENDED_MESSAGE);
            return;
          }
        } else {
          this.#workflow = { type: 'live', id: workflowId };
        }
        noCheckpointYet = false;
        const availableScopes = this.#getAvailableApprovalScopes();
        const agentEvents = await this.#workflowEventMapper.mapWorkflowEvent(
          event,
          availableScopes,
        );
        for (const agentEvent of agentEvents) {
          yield agentEvent;
        }
      }

      this.#logger.info('Workflow completed successfully');
    } catch (error) {
      this.#logger.error('Workflow failed: ', error);
      let message: string;
      if (isSandboxUnavailableError(error)) {
        // An unavailable sandbox is a local/environment problem, not a dead
        // workflow — surface the actionable message and leave the workflow
        // resumable rather than forcing a fresh conversation.
        message = error.message;
      } else if (isResumedSession) {
        this.#workflow = { type: 'dead', id: workflowId };
        message = RESUMED_SESSION_ENDED_MESSAGE;
      } else {
        message = generateErrorMessageFromStatusCode(WorkflowStatusCode.GENERAL_FAILURE);
      }
      yield this.#errorEvent(message);
    } finally {
      // Clean up abort handler
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  #validateFlowConfigOptions(): {
    flowConfigSchemaVersion: string | undefined;
    flowConfigId: string | undefined;
    flowVersion: string | undefined;
  } {
    const { flowConfigSchemaVersion, flowConfigId, flowVersion } = this.#backendOpts;

    const hasValue = (v: string | undefined): boolean => v !== undefined && v !== '';

    if (hasValue(flowConfigSchemaVersion) && hasValue(flowConfigId) && hasValue(flowVersion)) {
      return { flowConfigSchemaVersion, flowConfigId, flowVersion };
    }

    const entries = Object.entries({ flowVersion, flowConfigId, flowConfigSchemaVersion });
    const provided = entries.filter(([, v]) => hasValue(v)).map(([k]) => k);
    const missing = entries.filter(([, v]) => !hasValue(v)).map(([k]) => k);

    if (provided.length > 0 && missing.length > 0) {
      const providedNames = provided.join(', ');
      const missingNames = missing.join(', ');
      this.#logger.warn(
        `Flow config options must all be set together or all omitted. Provided: [${providedNames}], missing: [${missingNames}]. Discarding all flow config version options.`,
      );
    }

    return { flowConfigSchemaVersion: undefined, flowConfigId: undefined, flowVersion: undefined };
  }

  #resolveGoal(action: UserAction): string {
    if (action.type === UserActionType.SendPrompt) return action.prompt;
    if (this.#cliInput.command.name === 'run') return this.#cliInput.command.goal;
    return '';
  }

  #getAiContextItemsForMessage(action: UserAction): AIContextItem[] {
    // plan_context tells the registry developer flow which mode to render, so it
    // is rebuilt from the active mode and sent on every turn. The legacy
    // chat.Workflow ignores context:inputs.*, so we omit it there.
    const planContextItems: AIContextItem[] = this.#backendOpts.developer
      ? [buildPlanContextItem(this.#activeAgentMode === 'plan')]
      : [];

    // For 'run' command, always include system context when starting the workflow
    if (this.#isRunCommand && this.#cliInput.command.name === 'run') {
      const userContext = this.#cliInput.command.aiContextItems || [];
      const aiContextItems = [...this.#systemContext, ...userContext, ...planContextItems];
      this.#logger.debug(
        `AIContextItems: ${this.#systemContext.length} system items + ${userContext.length} user items + ${planContextItems.length} plan_context items = ${aiContextItems.length} total`,
      );
      return aiContextItems;
    }

    // For interactive chat (SendPrompt), include first message context if available
    if (action.type === UserActionType.SendPrompt) {
      if (this.#firstMessageContext) {
        const userContext = action.aiContextItems ?? [];
        const aiContextItems = [...this.#firstMessageContext, ...userContext, ...planContextItems];
        this.#logger.debug(
          `AIContextItems: ${this.#firstMessageContext.length} system items + ${userContext.length} user items + ${planContextItems.length} plan_context items = ${aiContextItems.length} total`,
        );
        this.#firstMessageContext = null; // reset now that it's been included in the workflow once
        return aiContextItems;
      }

      const userContext = action.aiContextItems ?? [];
      const aiContextItems = [...userContext, ...planContextItems];
      this.#logger.debug(
        `AIContextItems: ${userContext.length} user items + ${planContextItems.length} plan_context items = ${aiContextItems.length} total`,
      );
      return aiContextItems;
    }

    // Other action types (e.g. SendToolApproval): send plan_context so the
    // active mode is reconciled on tool-approval turns too (empty on the legacy
    // chat.Workflow path).
    return [...planContextItems];
  }
}
