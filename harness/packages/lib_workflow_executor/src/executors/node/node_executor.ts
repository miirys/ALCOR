import {
  DuoWorkflowEvent,
  DuoWorkflowStatus,
  generateErrorMessageFromStatusCode,
  tryParseFlowConfig,
  ToolApprovalType,
  WorkflowExecutorError,
  WorkflowStatusCode,
  WorkflowStreamEvent,
  WorkflowSuccessCode,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';
import {
  createInterfaceId,
  Implements,
  Service,
  ServiceLifetime,
  AsyncDisposable,
} from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ClientConfig, ConfigService, ITelemetryOptions } from '@gitlab-org/config';
import { ErrorHandler, SanitizedError } from '@gitlab-org/errors';
import { DUO_WORKFLOW_EVENT, DuoWorkflowTracker } from '@gitlab-org/telemetry';
import { CompositeDisposable } from '@gitlab-org/disposable';
import { GitLabApiService, truncateToByteLimit, tryParseGitLabGid } from '@gitlab-org/core';
import { LsFetch } from '@gitlab-org/fetch';
import { RepositoryDiscoveryService } from '@gitlab-org/repositories';
import {
  McpManagerWorkflowExecutorAdaptor as McpManager,
  McpToolApprovalController,
} from '@gitlab-org/ai-configuration';
import {
  persistToolApprovalForSession,
  persistPatternApprovalForSession,
} from '@gitlab-org/tool-approval';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { formatRangeLocation } from '@gitlab-org/document';
import {
  AdditionalContext,
  ClientEvent,
  HttpResponse,
  PlainTextResponse,
} from '@gitlab-org/duo-workflow-service';
import { type AIContextItem } from '@gitlab-org/ai-context';
import type { GenerateTokenResponse, WorkflowId } from '../../index';

import { ModelResolverService } from '../../model_resolver_service';
import { WorkflowTokenService } from '../../api/workflow_token_service';
import { isAgenticChatForbiddenError, isNoDuoNamespaceError } from '../../api/errors';
import { EventQueue } from '../../utils/event_queue';
import { Executor, RunWorkflowOptions } from '../executor';
import { ActionExecutor } from '../action_executor';
import { ActionExecutorFactory } from '../action_executor_factory';
import { USER_INTERRUPTED_COMMAND } from '../../api/workflow_command_service';
import { type WorkflowActionContext, type WorkflowActionOf } from './actions';
import { FileStateTracker } from './actions/file_state_tracker';
import { MAX_MESSAGE_SIZE } from './clients/constants';
import type {
  ClientSslConfig,
  WorkflowAction,
  WorkflowClient,
  WorkflowMetadata,
  WorkflowStream,
} from './clients/types';
import {
  type WebSocketConnectionConfig,
  type WebSocketWorkflowOptions,
  WebSocketWorkflowClient,
} from './clients/websocket_client';
import { mapClientErrorToUserFacingStatusCode } from './clients/errors';
import { resolveWorkflowStatusCode } from './resolve_status_code';
import {
  createSizeLimitExceededResponse,
  createSerializationErrorResponse,
  isPlaintextResponse,
} from './utils/response_truncation';

// Client capabilities is how gitlab-lsp -> workhorse -> Duo Workflow Service communicates
// capabilities that can be used by Duo Workflow Service without breaking
// backwards compatibility. We intersect the capabilities of all parties and
// then new behaviour can only depend on that behaviour if it makes it all the
// way through. Whenever you add to this list you must also update the constant in
// GitLab workhorse and GitLab javascript before the feature becomes available.
export const CLIENT_CAPABILITIES = [
  'shell_command',
  'read_file_chunked',
  'tool_call_approval', // Added in GitLab 18.9.0 - enables TOOL_CALL_APPROVAL_REQUIRED workflow status and session approvals
  'tool_call_pattern_approval', // Added in GitLab 18.12.0 - enables glob pattern-based session approvals (e.g. "git checkout *")
  'command_timeout', // Added in GitLab 18.11.0 - enables timeout parameter on runCommand actions
  'web_search', // Added in GitLab 18.11.0 - enables web search tool in chat workflow
  'incremental_streaming', // Enabled in GitLab 18.7+ - DWS sends only new/updated ui_chat_log messages per checkpoint instead of the full history
];

type NewCheckpointAction = WorkflowActionOf<'newCheckpoint'>;

type CheckpointChannelValues = {
  ui_chat_log?: unknown[];
  [key: string]: unknown;
};

type CheckpointPayload = {
  channel_values?: CheckpointChannelValues;
  [key: string]: unknown;
};

/**
 * Merges an incremental ui_chat_log slice into the accumulated full log.
 *
 * With `incremental_streaming` enabled, DWS sends only the subset of ui_chat_log
 * entries that changed since the last checkpoint. The slice starts from the last
 * message that was in progress (which may have been partially streamed) and
 * continues with any newly added messages.
 *
 * Merge strategy:
 * - If the incoming slice is empty, return the accumulated log unchanged.
 * - Find the position of the first incoming message in the accumulated log by
 *   matching its `message_id`. If found, replace entries from that position
 *   onward with the incoming slice (updating the in-progress message and
 *   appending any new ones).
 * - If the first message_id is not found (e.g. first checkpoint, or reset),
 *   append the full incoming slice to the accumulated log.
 */

/**
 * Minimal structural contract this merger depends on. The full chat-log entry
 * shape is owned by `lib_workflow_api/ui_chat_log.ts` (BaseMessageSchema);
 * here we only read `message_id` and otherwise pass entries through opaquely.
 */
type ChatLogEntry = { message_id?: unknown; [k: string]: unknown };

export function mergeIncrementalChatLog(
  accumulated: readonly ChatLogEntry[],
  incoming: readonly ChatLogEntry[],
): ChatLogEntry[] {
  if (incoming.length === 0) {
    return [...accumulated];
  }

  const firstMessageId = incoming[0]?.message_id;

  if (typeof firstMessageId === 'string' && firstMessageId.length > 0) {
    const overlapIndex = accumulated.findIndex((entry) => entry?.message_id === firstMessageId);
    if (overlapIndex !== -1) {
      return [...accumulated.slice(0, overlapIndex), ...incoming];
    }
  }

  // No overlap found — append incoming slice to accumulated log
  return [...accumulated, ...incoming];
}

type WorkflowTracingMetadata = {
  extended_logging: boolean;
  git_sha?: string;
  git_url?: string;
  git_branch?: string;
};

export interface NodeExecutor extends Executor, AsyncDisposable {}

export const NodeExecutor = createInterfaceId<NodeExecutor>('NodeExecutor');

const LOGGER_PREFIX = '[DuoWorkflowNodeExecutor]';

@Service({
  dependencies: [
    ConfigService,
    DuoWorkflowTracker,
    ErrorHandler,
    FileStateTracker,
    GitLabApiService,
    Logger,
    LsFetch,
    McpManager,
    McpToolApprovalController,
    ModelResolverService,
    RepositoryDiscoveryService,
    SecretRedactor,
    WorkflowTokenService,
    ActionExecutorFactory,
  ],
  lifetime: ServiceLifetime.Transient,
})
@Implements(NodeExecutor)
export class DefaultNodeExecutor implements NodeExecutor, Executor {
  #disposables = new CompositeDisposable();

  #currentWorkflowStatus?: DuoWorkflowStatus;

  #duoWorkflowTracker: DuoWorkflowTracker;

  #errorHandler: ErrorHandler;

  #fileStateTracker: FileStateTracker;

  #gitlabApiService: GitLabApiService;

  #prefixedLogger: Logger;

  #logger: Logger;

  #modelResolverService: ModelResolverService;

  #workflowTokenService: WorkflowTokenService;

  #repositoryDiscoveryService: RepositoryDiscoveryService;

  #actionExecutor: ActionExecutor;

  #client: WorkflowClient | null = null;

  #stream: WorkflowStream | null = null;

  #sslConfig: ClientSslConfig = {};

  #mcpManager: McpManager;

  #mcpToolApprovalController: McpToolApprovalController;

  #socketConnectionDetails?: WebSocketConnectionConfig;

  #secretRedactor: SecretRedactor;

  #actionHandlerAbortController: AbortController | null = null;

  #isRunningCommand = false;

  #telemetry?: ITelemetryOptions;

  /**
   * Accumulated ui_chat_log for the current workflow run.
   * When incremental_streaming is active, DWS sends only the new/updated
   * messages per checkpoint. We merge them here so downstream consumers
   * always receive the full log.
   */
  #accumulatedChatLog: ChatLogEntry[] = [];

  constructor(
    configService: ConfigService,
    duoWorkflowTracker: DuoWorkflowTracker,
    errorHandler: ErrorHandler,
    fileStateTracker: FileStateTracker,
    gitlabApiService: GitLabApiService,
    logger: Logger,
    lsFetch: LsFetch,
    mcpManager: McpManager,
    mcpToolApprovalController: McpToolApprovalController,
    modelResolverService: ModelResolverService,
    repositoryService: RepositoryDiscoveryService,
    secretRedactor: SecretRedactor,
    workflowTokenService: WorkflowTokenService,
    actionExecutorFactory: ActionExecutorFactory,
  ) {
    this.#duoWorkflowTracker = duoWorkflowTracker;
    this.#errorHandler = errorHandler;
    this.#fileStateTracker = fileStateTracker;
    this.#gitlabApiService = gitlabApiService;
    this.#logger = logger;
    this.#prefixedLogger = withPrefix(logger, `${LOGGER_PREFIX}`);
    this.#modelResolverService = modelResolverService;
    this.#workflowTokenService = workflowTokenService;
    this.#repositoryDiscoveryService = repositoryService;
    this.#mcpManager = mcpManager;
    this.#mcpToolApprovalController = mcpToolApprovalController;
    this.#actionExecutor = actionExecutorFactory.createExecutor();
    this.#disposables.add(this.#actionExecutor);
    this.#secretRedactor = secretRedactor;

    this.#setSocketConnectionDetails(gitlabApiService, lsFetch);

    this.#disposables.add(
      configService.onConfigChange((config) => {
        this.#setSslConfig(config);
        this.#setTelemetry(config);
      }),
    );
    this.#setSslConfig(configService.get());
    this.#setTelemetry(configService.get());
  }

  #setSocketConnectionDetails(gitlabApiService: GitLabApiService, lsFetch: LsFetch) {
    if (gitlabApiService.instanceInfo && gitlabApiService.tokenInfo) {
      const gitlabInstanceUrl = gitlabApiService.instanceInfo.instanceUrl;
      const webSocketOptions = lsFetch.getWebSocketOptions(gitlabInstanceUrl);
      this.#socketConnectionDetails = {
        gitlabInstanceUrl,
        token: gitlabApiService.tokenInfo.token,
        ...webSocketOptions,
      };
    }

    this.#disposables.add(
      gitlabApiService.onApiReconfigured((data) => {
        if (data.isInValidState) {
          const gitlabInstanceUrl = data.instanceInfo.instanceUrl;
          const webSocketOptions = lsFetch.getWebSocketOptions(gitlabInstanceUrl);
          this.#socketConnectionDetails = {
            gitlabInstanceUrl,
            token: data.tokenInfo.token,
            ...webSocketOptions,
          };
        } else {
          this.#socketConnectionDetails = undefined;
        }
      }),
    );
  }

  #setSslConfig({ httpAgentOptions, ignoreCertificateErrors }: ClientConfig) {
    this.#sslConfig = {
      httpAgentOptions,
      ignoreCertificateErrors,
    };
  }

  #setTelemetry({ telemetry }: ClientConfig) {
    this.#telemetry = telemetry;
  }

  async #forceDisconnect(): Promise<void> {
    this.#prefixedLogger.info(
      'Force disconnecting - aborting any outstanding action handlers, ending stream',
    );
    this.#actionHandlerAbortController?.abort();
    await this.#client?.disposeAsync();
    this.#prefixedLogger.info('Force disconnected');
  }

  async disposeAsync(): Promise<void> {
    this.#prefixedLogger.info('Disposing executor - starting shutdown');
    await this.#forceDisconnect();
    this.#disposables.dispose();
  }

  stopWorkflow() {
    this.#logger.debug('Requesting graceful workflow stop');
    this.#stream?.write({
      stopWorkflow: {
        reason: 'USER_ACTION_TRIGGERED_STOP',
      },
    });
  }

  interruptRunningCommand() {
    this.#logger.debug('Interrupting currently running command');
    this.#actionHandlerAbortController?.abort(new Error(USER_INTERRUPTED_COMMAND));
    this.#actionHandlerAbortController = new AbortController();
  }

  isCommandRunning(): boolean {
    return this.#isRunningCommand;
  }

  /**
   * Executes a workflow and yields events as they occur during execution.
   *
   * @param options - Configuration for the workflow execution
   * @yields {DuoWorkflowEvent | WorkflowExecutorError} - Stream of workflow events during execution
   * @returns {AsyncGenerator<DuoWorkflowEvent | WorkflowExecutorError, void, unknown>} - Generator that yields events until completion
   *
   * @remarks
   * In failure scenarios, the final yielded event will be a WorkflowExecutorError containing
   * the error details, including the WorkflowStatus code.
   * The generator completes (returns) when the workflow finishes successfully or encounters
   * a terminal error.
   */
  async *runWorkflow(
    options: RunWorkflowOptions,
  ): AsyncGenerator<WorkflowStreamEvent, void, unknown> {
    const {
      workflowId,
      goal,
      type,
      workspaceFolderPath,
      workspaceFolderUri,
      toolApproval,
      workflowDefinition,
      aiCatalogItemVersionId,
      flowConfig,
      flowConfigSchemaVersion,
      flowConfigId,
      flowVersion,
      streaming,
    } = options;
    this.#prefixedLogger = withPrefix(this.#logger, `${LOGGER_PREFIX}[${workflowId}]`);
    this.#accumulatedChatLog = [];

    const eventQueue = new EventQueue();
    let workflowToken: GenerateTokenResponse | null = null;

    try {
      this.#actionHandlerAbortController = new AbortController();

      this.#prefixedLogger.debug(
        `Running workflow: ${this.#secretRedactor.redactSecrets(
          JSON.stringify(options, null, 4),
          'workflow-run-options',
        )}`,
      );

      workflowToken = await this.#getAuthToken(
        workflowId,
        type,
        options.metadata.rootNamespaceId,
        options.metadata.projectPath,
      );

      const workflowMetadata = await this.#workflowMetadata(workflowToken, workspaceFolderPath);

      const namespaceId = options.metadata.rootNamespaceId || options.metadata.namespaceId;
      const resolvedModel = await this.#modelResolverService.resolveModel(
        options.metadata.selectedModelIdentifier,
        namespaceId,
      );

      if (options.langsmithTrace) {
        this.#prefixedLogger.info(
          `LangSmith distributed tracing enabled, trace header: ${options.langsmithTrace}`,
        );
      }

      this.#client = this.#createWorkflowClient(
        options.metadata,
        resolvedModel,
        options.agentPlatformFeatureSettingName,
        options.langsmithTrace,
        {
          workflowDefinition,
          aiCatalogItemVersionId: aiCatalogItemVersionId
            ? tryParseGitLabGid(aiCatalogItemVersionId)
            : undefined,
        },
      );

      this.#prefixedLogger.debug('Creating websocket connection...');
      this.#stream = await this.#client.executeWorkflow();
      this.#prefixedLogger.debug('WebSocket connection created successfully');

      this.#stream.on('data', async (action: WorkflowAction) => {
        try {
          // Re-fetch the token from the tokenService. Most of the time, this will be quick and use the cached valid token.
          // If the workflow has been running a very long time though, the token may have expired, and we will fetch a new one.
          workflowToken = await this.#getAuthToken(
            workflowId,
            type,
            options.metadata.rootNamespaceId,
            options.metadata.projectPath,
          );

          if (action.newCheckpoint) {
            const event = await this.#handleWorkflowCheckpoint(
              workflowId,
              action as NewCheckpointAction,
            );
            if (event) {
              eventQueue.push(event);
            }
          } else {
            const abortSignal =
              this.#actionHandlerAbortController?.signal ?? new AbortController().signal;
            this.#isRunningCommand = Boolean(action.runCommand || action.runShellCommand);
            const result = await this.#handleWorkflowAction(action, {
              workspaceFolderPath,
              workspaceFolderUri,
              workflowId,
              workflowToken,
              fileStateTracker: this.#fileStateTracker,
              abortSignal,
            });

            const wasUserInterrupted =
              abortSignal.aborted &&
              abortSignal.reason instanceof Error &&
              abortSignal.reason.message === USER_INTERRUPTED_COMMAND;

            if (!abortSignal.aborted || wasUserInterrupted) {
              this.#stream?.write(this.#createResponse(result, action.requestID));
            }
          }
        } catch (error) {
          this.#prefixedLogger.error('Error handling workflow action', error);
          eventQueue.push(
            new WorkflowExecutorError(
              'Error handling workflow action',
              WorkflowStatusCode.GENERAL_FAILURE,
            ),
          );
        } finally {
          this.#isRunningCommand = false;
        }
      });

      this.#stream.on('error', (error) => {
        this.#prefixedLogger.error('Stream error event received', error);
        this.#prefixedLogger.error(
          `Error details: ${JSON.stringify({
            message: error.message,
            code: (error as Error & { code?: number }).code,
            details: (error as Error & { details?: string }).details,
            metadata: (error as Error & { metadata?: unknown }).metadata,
          })}`,
        );
        this.#actionHandlerAbortController?.abort();
        // Stream errors are always Error objects, so map directly.
        const statusCode = mapClientErrorToUserFacingStatusCode(error);
        const message = `${LOGGER_PREFIX} Stream encountered error (code: ${statusCode})`;
        this.#errorHandler.handleError(message, new SanitizedError(message, error), {
          correlationId: this.#client?.getCorrelationId(),
          statusCode,
        });

        eventQueue.push({ type: 'completion', statusCode });
      });

      this.#stream.on('end', () => {
        this.#prefixedLogger.debug('Stream end event received');
        this.#actionHandlerAbortController?.abort();
        eventQueue.push({ type: 'completion', statusCode: WorkflowSuccessCode });
      });

      // Persist tool approval for session if applicable
      if (toolApproval && 'userApproved' in toolApproval && toolApproval.userApproved) {
        try {
          if (toolApproval.type === ToolApprovalType.APPROVE_FOR_SESSION && toolApproval.toolArgs) {
            const capabilities = this.#workflowTokenService.getServerCapabilities({
              workflowType: type || WorkflowType.CHAT,
              workflowId,
            });

            await persistToolApprovalForSession({
              workflowId,
              toolName: toolApproval.toolName,
              toolArgs: toolApproval.toolArgs,
              gitlabApiService: this.#gitlabApiService,
              logger: this.#prefixedLogger,
              capabilities,
              mcpToolApprovalController: this.#mcpToolApprovalController,
            });
          } else if (
            toolApproval.type === ToolApprovalType.APPROVE_PATTERN_FOR_SESSION &&
            toolApproval.pattern
          ) {
            await persistPatternApprovalForSession({
              workflowId,
              toolName: toolApproval.toolName,
              pattern: toolApproval.pattern,
              gitlabApiService: this.#gitlabApiService,
              logger: this.#prefixedLogger,
            });
          }
        } catch (e) {
          this.#prefixedLogger.warn(`Failed to persist tool approval; continuing: ${String(e)}`);
        }
      }

      const mcpTools = options.excludeMcpTools
        ? []
        : await this.#mcpManager.reload(workspaceFolderPath, workflowId);
      const approvedTools = mcpTools?.filter((x) => x.isApproved).map((x) => x.name) ?? [];
      const servers = Array.from(new Set(mcpTools.map((x) => x.serverName)));

      this.#prefixedLogger.info(
        `startRequest: mcp_tools=${mcpTools.length} preapproved_tools=${approvedTools.length} servers=${servers.length}`,
      );

      this.#prefixedLogger.debug(
        `startRequest: approved_tools=${truncateToByteLimit(JSON.stringify(approvedTools), 1024, { suffix: '...[truncated]' })}`,
      );

      try {
        const writeResult = this.#stream.write({
          startRequest: {
            workflowID: workflowId,
            clientVersion: '1.0',
            workflowDefinition: workflowDefinition || type || WorkflowType.SOFTWARE_DEVELOPMENT,
            goal: toolApproval ? '' : goal,
            workflowMetadata: JSON.stringify(workflowMetadata),
            additional_context: toolApproval
              ? []
              : this.#processAdditionalContext(options.additionalContext),
            clientCapabilities: CLIENT_CAPABILITIES,
            mcpTools,
            preapproved_tools: approvedTools,
            flowConfig: tryParseFlowConfig(flowConfig),
            flowConfigSchemaVersion:
              flowConfigSchemaVersion ?? tryParseFlowConfig(flowConfig)?.version ?? undefined,
            flowConfigId,
            flowVersion,
            streaming,
            approval:
              (toolApproval && {
                approval: toolApproval.userApproved === true ? {} : undefined,
                rejection:
                  toolApproval.userApproved === false
                    ? {
                        message: toolApproval.message,
                      }
                    : undefined,
              }) ??
              undefined,
          },
        });
        this.#prefixedLogger.debug(`startRequest write returned: ${writeResult}`);
      } catch (writeError) {
        this.#prefixedLogger.error('Error during write call', writeError);
        throw writeError;
      }
      this.#prefixedLogger.debug('startRequest written to stream');

      this.#prefixedLogger.debug('Entering event queue iteration...');
      for await (const event of eventQueue) {
        yield event;
      }
      this.#prefixedLogger.debug('Event queue iteration completed');
    } catch (error) {
      const isDuoAccessError = isAgenticChatForbiddenError(error) || isNoDuoNamespaceError(error);

      let statusCode: WorkflowStatusCode;
      // For typed Duo access errors, keep the accurate per-case message rather than the generic
      // status-code message (which would lose the no-namespace vs. not-entitled distinction).
      let userFacingMessage: string;
      if (isDuoAccessError) {
        statusCode = WorkflowStatusCode.NO_DUO_ACCESS;
        userFacingMessage = (error as Error).message;
      } else {
        statusCode = resolveWorkflowStatusCode(error, mapClientErrorToUserFacingStatusCode);
        userFacingMessage = generateErrorMessageFromStatusCode(statusCode);
      }

      const message = `${LOGGER_PREFIX} Workflow execution failed`;
      this.#errorHandler.handleError(message, new SanitizedError(message, error), {
        correlationId: this.#client?.getCorrelationId(),
        statusCode,
      });

      yield new WorkflowExecutorError(userFacingMessage, statusCode);
    }
  }

  async #handleWorkflowCheckpoint(
    workflowId: WorkflowId,
    action: NewCheckpointAction,
  ): Promise<DuoWorkflowEvent | null> {
    this.#prefixedLogger.debug(
      `Received new checkpoint: ${JSON.stringify({
        workflowStatus: action.newCheckpoint.status,
      })}`,
    );

    // this eslint violation predates the introduction of enum eslint rules

    const hasChangedStatus = this.#currentWorkflowStatus !== action.newCheckpoint.status;
    if (hasChangedStatus) {
      if (action.newCheckpoint.status === DuoWorkflowStatus.CREATED) {
        this.#duoWorkflowTracker.trackEvent(DUO_WORKFLOW_EVENT.START, { workflow_id: workflowId });
      } else if (action.newCheckpoint.status === DuoWorkflowStatus.FINISHED) {
        this.#duoWorkflowTracker.trackEvent(DUO_WORKFLOW_EVENT.FINISH, { workflow_id: workflowId });
      }
      this.#currentWorkflowStatus = action.newCheckpoint.status as DuoWorkflowStatus;
    }

    const checkpoint = this.#mergeCheckpointChatLog(action.newCheckpoint.checkpoint);

    const event: DuoWorkflowEvent = {
      checkpoint,
      errors: action.newCheckpoint.errors,
      workflowStatus: action.newCheckpoint.status as DuoWorkflowStatus,
      workflowGoal: action.newCheckpoint.goal,
      agentContextUsage: this.#mapAgentContextUsage(action.newCheckpoint.agent_context_usage),
    };

    return event;
  }

  /** Returns undefined when there is no usage data so consumers can treat it as "no data". */
  #mapAgentContextUsage(
    agentContextUsage: NewCheckpointAction['newCheckpoint']['agent_context_usage'] | undefined,
  ): DuoWorkflowEvent['agentContextUsage'] {
    if (!agentContextUsage) return undefined;

    const entries = Object.entries(agentContextUsage);
    if (entries.length === 0) return undefined;

    return Object.fromEntries(
      entries.map(([agent, usage]) => [
        agent,
        { totalTokens: usage.total_tokens, maxTokens: usage.max_tokens },
      ]),
    );
  }

  /**
   * Parses the raw checkpoint JSON, merges any incremental ui_chat_log slice
   * into the accumulated full log, and returns the updated checkpoint JSON string.
   *
   * When `incremental_streaming` is active, DWS omits already-sent messages from
   * the checkpoint's `ui_chat_log`, sending only the delta. This method reconstructs
   * the full log so all consumers downstream see a complete history.
   */
  #mergeCheckpointChatLog(rawCheckpoint: string): string {
    if (!rawCheckpoint) return rawCheckpoint;

    let parsed: CheckpointPayload;
    try {
      parsed = JSON.parse(rawCheckpoint) as CheckpointPayload;
    } catch {
      this.#logger.warn('Failed to parse raw checkpoint data, invalid JSON');
      return rawCheckpoint;
    }

    const incomingLog = parsed?.channel_values?.ui_chat_log as ChatLogEntry[] | undefined;

    if (!Array.isArray(incomingLog)) {
      // No ui_chat_log in this checkpoint — pass through unchanged
      return rawCheckpoint;
    }

    this.#accumulatedChatLog = mergeIncrementalChatLog(this.#accumulatedChatLog, incomingLog);

    const merged: CheckpointPayload = {
      ...parsed,
      channel_values: {
        ...parsed.channel_values,
        ui_chat_log: this.#accumulatedChatLog,
      },
    };

    return JSON.stringify(merged);
  }

  async #handleWorkflowAction(
    action: WorkflowAction,
    context: WorkflowActionContext,
  ): Promise<PlainTextResponse | HttpResponse> {
    const actionType = Object.keys(action).find(
      (key) => key !== 'requestID' && action[key as keyof WorkflowAction] !== undefined,
    );
    let workflowActionLogger = withPrefix(
      this.#prefixedLogger,
      `[actionType: ${actionType ?? 'missing_workflow_action'}]`,
    );
    if (action?.requestID?.length) {
      workflowActionLogger = withPrefix(this.#prefixedLogger, `[requestID: ${action.requestID}]`);
    }

    workflowActionLogger.debug(
      `Action received: ${this.#secretRedactor.redactSecrets(JSON.stringify(action), 'workflow-action')}`,
    );

    try {
      if (this.#actionHandlerAbortController?.signal.aborted) {
        return {
          response: '',
          error: 'Action not executed because workflow has been cancelled or stopped',
        };
      }
      const result = await this.#actionExecutor.execute(action, context);
      return this.#applySecretRedaction(result, `${actionType}_tool_output`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      workflowActionLogger.error(`Error handling action: ${error}`);
      return this.#applySecretRedaction(
        { error, response: '' },
        `${actionType}_tool_execution_error`,
      );
    }
  }

  #applySecretRedaction(
    result: PlainTextResponse | HttpResponse,
    resultSource: string,
  ): PlainTextResponse | HttpResponse {
    if (isPlaintextResponse(result)) {
      const { redacted, ranges: redactedRanges } = this.#secretRedactor.redactSecretsWithRanges(
        result.response,
        resultSource,
      );

      let redactionNote = '';
      const redactionCount = redactedRanges.length;
      if (redactionCount > 0) {
        const pluralisedSecrets = `${redactionCount} secret${redactionCount === 1 ? '' : 's'}`;
        const pluralisedRangesText = `${redactionCount === 1 ? 'This range contains' : 'These ranges contain'}`;
        const locations = redactedRanges.map((range) => formatRangeLocation(range)).join(', ');
        redactionNote = `\n\n---\nNote: ${pluralisedSecrets} redacted at: ${locations}. ${pluralisedRangesText} asterisks (*) replacing actual values and cannot be edited.`;
      }

      return {
        response: `${redacted}${redactionNote}`,
        error: this.#secretRedactor.redactSecrets(result.error, resultSource),
      };
    }

    return {
      ...result,
      body: this.#secretRedactor.redactSecrets(result.body, resultSource),
      error: this.#secretRedactor.redactSecrets(result.error, resultSource),
    };
  }

  #createWorkflowClient(
    workflowMetadata: Partial<WorkflowMetadata>,
    resolvedModel: string | undefined,
    agentPlatformFeatureSettingName?: string,
    langsmithTrace?: string,
    workflowOptions?: WebSocketWorkflowOptions,
  ): WorkflowClient {
    const clientMetadata = { ...workflowMetadata, selectedModelIdentifier: resolvedModel };

    if (!this.#socketConnectionDetails) {
      throw new WorkflowExecutorError(
        'Tried to create a WebSocket client before the GitLab API configuration data was available.',
        WorkflowStatusCode.INVALID_API_CONFIGURATION,
      );
    }

    try {
      return new WebSocketWorkflowClient(
        this.#logger,
        this.#sslConfig,
        this.#socketConnectionDetails,
        clientMetadata,
        this.#gitlabApiService.instanceInfo,
        this.#telemetry,
        agentPlatformFeatureSettingName,
        workflowOptions,
        langsmithTrace,
      );
    } catch (err) {
      this.#logger.error('Failed to create WebSocket client: ', err);
      throw new WorkflowExecutorError(
        'Failed to create WebSocket client',
        WorkflowStatusCode.SERVICE_CONNECTION_FAILED,
      );
    }
  }

  async #workflowMetadata(
    workflowToken: GenerateTokenResponse,
    workspaceFolderPath: string,
  ): Promise<WorkflowTracingMetadata> {
    const metadata: WorkflowTracingMetadata = {
      extended_logging: workflowToken.workflow_metadata?.extended_logging ?? false,
    };

    const repositories =
      await this.#repositoryDiscoveryService.getRepositoriesForWorkspace(workspaceFolderPath);

    const repo = repositories.values().next().value;

    if (repo) {
      const remotes = await repo.listRemotes();
      const remote = remotes.find((r) => r.remote === 'origin') ?? remotes[0];

      metadata.git_url = remote?.url;
      metadata.git_sha = (await repo.getCurrentCommit()) || undefined;
      metadata.git_branch = (await repo.getCurrentBranchName()) || undefined;
    }
    return metadata;
  }

  #createResponse(response: PlainTextResponse | HttpResponse, requestID: string): ClientEvent {
    const clientEvent: ClientEvent = {
      actionResponse: {
        requestID,
        ...(isPlaintextResponse(response)
          ? { plainTextResponse: response }
          : { httpResponse: response }),
      },
    };

    if (!this.#client) {
      throw new Error(
        'Workflow client is not initialized. This should not happen during response creation.',
      );
    }

    try {
      const responseSize = this.#client.getResponseByteSize(clientEvent);

      if (responseSize <= MAX_MESSAGE_SIZE) {
        return clientEvent;
      }

      return createSizeLimitExceededResponse(response, requestID, responseSize, MAX_MESSAGE_SIZE);
    } catch (serializationError) {
      this.#prefixedLogger.error(
        'Failed to serialize ClientEvent for size check',
        serializationError,
      );

      return createSerializationErrorResponse(response, requestID);
    }
  }

  #processAdditionalContext(additionalContext: AIContextItem[] = []): AdditionalContext[] {
    // Filter for context items that have full file content
    const fileContentProviders = ['open_tab', 'local_file_search', 'import'];

    // Pre-populate FileStateTracker with files from additionalContext
    // This allows edit_file actions to work on files that were included via AI context providers
    additionalContext.forEach((context) => {
      if (
        context.category === 'file' &&
        context.content &&
        context.id &&
        context.metadata?.subType &&
        fileContentProviders.includes(context.metadata.subType)
      ) {
        try {
          // Extract file path from the context item ID (which is typically a file URI).
          // For file:// URIs, strip the scheme to get the filesystem path.
          // For virtual filesystem URIs (e.g. adt://, semanticfs://), use the URI as-is
          // since LspFileAccessService can look up documents by their full URI.
          const filePath = context.id.startsWith('file://')
            ? decodeURIComponent(context.id.replace('file://', ''))
            : context.id;

          this.#fileStateTracker.recordFileRead(filePath, context.content);
          this.#prefixedLogger.debug(`Pre-populated file state for: ${filePath}`);
        } catch (error) {
          this.#prefixedLogger.warn(
            `Failed to pre-populate file state for context item ${context.id}`,
            error,
          );
        }
      }
    });

    return additionalContext.map((context) => ({
      ...context,
      metadata: JSON.stringify(context.metadata),
    }));
  }

  async #getAuthToken(
    workflowId: WorkflowId,
    type?: WorkflowType,
    rootNamespaceId?: string,
    projectPath?: string,
  ): Promise<GenerateTokenResponse> {
    try {
      return await this.#workflowTokenService.getToken(
        workflowId,
        type,
        rootNamespaceId,
        projectPath,
      );
    } catch (error) {
      // Preserve typed Duo access errors so their accurate message survives instead of being
      // flattened into the generic auth-token failure.
      if (isAgenticChatForbiddenError(error) || isNoDuoNamespaceError(error)) {
        throw error;
      }
      this.#logger.debug(`Rejecting with status code ${WorkflowStatusCode.AUTH_TOKEN_FETCH_ERROR}`);
      throw new WorkflowExecutorError(
        'Failed to fetch authentication token',
        WorkflowStatusCode.AUTH_TOKEN_FETCH_ERROR,
      );
    }
  }
}
