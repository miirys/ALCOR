import { type Result, ok, err } from 'neverthrow';
import {
  WorkflowRunner,
  DuoWorkflowEvent,
  DuoWorkflowStatus,
  PreCreateWorkflowPayload,
  WorkflowType,
  WorkflowStatusCode,
  generateErrorMessageFromStatusCode,
  isTerminated,
  isInProgressState,
  RunWorkflowPayload,
  GET_LATEST_CHECKPOINT_QUERY,
  GET_WORKFLOW_EVENTS_QUERY,
  type DuoWorkflowLatestCheckpoint,
  type DuoWorkflowEventConnection,
  isWorkflowExecutorErrorEvent,
  isDuoWorkflowEvent,
  WorkflowStreamEvent,
  ToolApprovalType,
} from '@gitlab-lsp/workflow-api';
import {
  parseLatestCheckpointWorkflowData,
  getStatus,
  createDefaultWorkflowEvent,
} from '@gitlab-lsp/workflow-api';
import { Logger } from '@gitlab-org/logging';
import {
  type AIContextItem,
  ChatContextManager,
  SystemContextManager,
} from '@gitlab-org/ai-context';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { isSandboxUnavailableError } from '@gitlab-org/sandbox/errors';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { doNotAwait, GitLabApiService, ifVersionGte, isDuoAccessMessage } from '@gitlab-org/core';
import { MessageBus } from '@gitlab-org/message-bus';
import {
  DuoAgentPlatformTracker,
  DuoAgentPlatformEvent,
  DuoAgentPlatformContext,
} from '@gitlab-org/telemetry';
import { parseWorkflowData } from '../utils';
import {
  ControllerData,
  ControllerNoReply,
  ControllerResponse,
  getWorkflowParams,
  sendWorkflowEventParams,
} from './types';
import { NO_REPLY } from './constants';

export const initWorkflowController = (
  workflowApi: WorkflowRunner,
  subscriptionCallback: (message: DuoWorkflowEvent, workflowId: string) => void,
  messageBus: MessageBus,
  log: Logger,
  chatContextManager: ChatContextManager,
  systemContextManager: SystemContextManager,
  secretRedactor: SecretRedactor,
  gitlabApiService: GitLabApiService,
  duoAgentPlatformTracker: DuoAgentPlatformTracker,
  mcpManager: McpManagerWorkflowExecutorAdaptor,
) => {
  const activeWorkflows = new Map<string, (event: DuoWorkflowEvent, workflowId: string) => void>();

  const controller = {
    async getWorkflowById({
      workflowId,
      isRefetch,
    }: getWorkflowParams): Promise<ControllerResponse[]> {
      try {
        log.debug(`GETTING WORKFLOW BY ID ${workflowId}`);
        const graphqlWorkflowId = `gid://gitlab/Ai::DuoWorkflows::Workflow/${workflowId}`;

        let projectFullPath: string | undefined;

        const parsedData = await ifVersionGte(
          gitlabApiService.instanceInfo?.instanceVersion,
          '18.3.0',
          async () => {
            const response = await workflowApi.getGraphqlData<DuoWorkflowLatestCheckpoint>({
              query: GET_LATEST_CHECKPOINT_QUERY,
              variables: { workflowId: graphqlWorkflowId },
            });

            const parsedDataResult = parseLatestCheckpointWorkflowData(response);
            projectFullPath = response.duoWorkflowWorkflows?.nodes?.[0]?.project?.fullPath;

            return parsedDataResult.match(
              (data) => data,
              (error) => {
                log.error('Failed to parse latest workflow checkpoint, using default', error);
                return createDefaultWorkflowEvent();
              },
            );
          },
          async () => {
            const response = await workflowApi.getGraphqlData<DuoWorkflowEventConnection>({
              query: GET_WORKFLOW_EVENTS_QUERY,
              variables: { workflowId: graphqlWorkflowId },
            });
            projectFullPath = response.duoWorkflowWorkflows?.nodes?.[0]?.project?.fullPath;

            return parseWorkflowData(response);
          },
        );

        if (projectFullPath) {
          log.info(
            `[WorkflowController] Workflow ${workflowId} belongs to project: ${projectFullPath}`,
          );
        }

        const status = getStatus(parsedData);

        if (!isTerminated(status) && !isRefetch) {
          activeWorkflows.set(workflowId, subscriptionCallback);
        }

        const events: ControllerResponse[] = [
          { eventName: 'workflowStarted', data: workflowId },
          { eventName: 'workflowCheckpoint', data: parsedData },
          { eventName: 'workflowStatus', data: status },
        ];

        if (parsedData.workflowGoal) {
          events.push({
            eventName: 'workflowGoal',
            data: parsedData.workflowGoal,
          });
        }

        if (projectFullPath) {
          events.push({
            eventName: 'setWorkflowProject',
            data: projectFullPath,
          });
        }

        return events;
      } catch (e) {
        const error = e as Error;
        log.error(`Failed to get workflow by ID ${workflowId}`, error);

        return [
          {
            eventName: 'workflowError',
            data: { message: `Error fetching workflow: ${error?.message}` },
          },
        ];
      }
    },

    async startSubscriptions({ workflowId }: { workflowId: string }) {
      activeWorkflows.set(workflowId, subscriptionCallback);
      return NO_REPLY;
    },

    async sendWorkflowEvent({
      eventType,
      workflowId,
      message,
    }: sendWorkflowEventParams): Promise<ControllerNoReply> {
      await workflowApi.sendEvent(workflowId, eventType, message);
      return NO_REPLY;
    },

    async preCreateWorkflow({
      draftGoal,
      type,
      workflowDefinition,
      aiCatalogItemVersionId,
      metadata,
    }: PreCreateWorkflowPayload): Promise<ControllerResponse | ControllerNoReply> {
      try {
        const workflowId = await workflowApi.preCreateWorkflow(
          draftGoal,
          type,
          workflowDefinition,
          aiCatalogItemVersionId,
          metadata,
        );

        // Kick off precalculation immediately (synchronously starts caching in providers)
        // so that startWorkflow can reuse the cached promises rather than recalculating cold.
        const precalculateStartMs = Date.now();
        const precalculatePromise = systemContextManager.precalculateOnWorkflowStart();

        doNotAwait(
          (async () => {
            try {
              await precalculatePromise;
              log.info(
                `[preCreateWorkflow] precalculateOnWorkflowStart took ${
                  Date.now() - precalculateStartMs
                }ms`,
              );
              const systemContextStartMs = Date.now();
              const systemContextItems = await systemContextManager.getSystemContextItems();
              log.info(
                `[preCreateWorkflow] getSystemContextItems took ${
                  Date.now() - systemContextStartMs
                }ms`,
              );
              messageBus.sendNotification('setSystemContextItems', systemContextItems);
            } catch (error) {
              log.error('Error getting system context items', error);
            }
          })(),
        );

        if (metadata.rootFsPath) {
          mcpManager.preWarm(metadata.rootFsPath);
        }

        return { eventName: 'workflowPreCreated', data: workflowId };
      } catch (e) {
        log.error(
          `Failed while attempting to optimistically pre-create the workflow. Workflow will be created normally once prompt has been submitted.`,
          e,
        );
        // Return error so it can be handled by the store
        return { eventName: 'workflowPreCreationError', data: null };
      }
    },

    async startWorkflow({
      goal,
      type,
      existingWorkflowId,
      preCreatedWorkflowId,
      metadata,
      toolApproval,
      flowConfig,
      aiCatalogItemVersionId,
      workflowDefinition,
      additionalOptions,
      flowConfigId,
      flowConfigSchemaVersion,
      flowVersion,
    }: RunWorkflowPayload): Promise<ControllerData> {
      if (toolApproval?.userApproved === true) {
        let approvalScope: 'session' | 'once' | 'pattern' = 'once';
        if (toolApproval.type === ToolApprovalType.APPROVE_FOR_SESSION) {
          approvalScope = 'session';
        } else if (toolApproval.type === ToolApprovalType.APPROVE_PATTERN_FOR_SESSION) {
          approvalScope = 'pattern';
        }
        duoAgentPlatformTracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
          source: 'chat',
          toolName: toolApproval.toolName,
          approvalScope,
          workflowId: existingWorkflowId,
        });
      }

      const processingErrors: ControllerResponse[] = [];
      let additionalContext: AIContextItem[] = [];
      try {
        additionalContext = await chatContextManager.retrieveContextItemsWithContent({
          newConversation: !existingWorkflowId,
          mode: 'agentic',
        });
      } catch (error) {
        log.error('Error getting additional context', error);

        processingErrors.push({
          eventName: 'workflowError',
          data: 'An error occurred while retrieving attached context items. Chat will proceed without them.',
        });
        additionalContext = [];
      }

      // Only include system context when starting a new conversation (not adding to existing workflow)
      let systemContext: AIContextItem[] = [];
      if (!existingWorkflowId) {
        try {
          const systemContextStartMs = Date.now();
          systemContext = await systemContextManager.getSystemContextItems();
          log.info(
            `[startWorkflow] getSystemContextItems took ${Date.now() - systemContextStartMs}ms`,
          );
        } catch (error) {
          log.error('Error getting system context', error);
          systemContext = [];
        }
      }

      // Combine system context and user-selected context
      const allContext = [...systemContext, ...additionalContext];

      let workflowId: string | undefined;
      let creationError: Error | undefined;
      try {
        if (existingWorkflowId || preCreatedWorkflowId) {
          workflowId = existingWorkflowId || preCreatedWorkflowId;
        } else {
          workflowId = await workflowApi.createWorkflow(
            goal,
            type || WorkflowType.CHAT,
            workflowDefinition,
            aiCatalogItemVersionId,
            metadata,
            additionalOptions,
          );
        }
      } catch (error) {
        log.error(`Failed to create a workflow with goal ${goal}`, error);
        creationError = error as Error;
      }

      if (workflowId === undefined) {
        const isUsageQuotaError = creationError?.message.includes('insufficient GitLab credits');

        if (isUsageQuotaError) {
          return [
            {
              eventName: 'setUsageQuotaExceeded',
              data: { exceeded: true, isMidStream: true },
            },
            { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
          ];
        }

        // Typed Duo access errors carry an accurate message (no Duo access / no namespace); surface
        // it verbatim instead of the generic "could not create the workflow" text.
        const duoAccessMessage = isDuoAccessMessage(creationError?.message)
          ? creationError?.message
          : undefined;

        return [
          {
            eventName: 'workflowError',
            data:
              duoAccessMessage ??
              generateErrorMessageFromStatusCode(WorkflowStatusCode.CREATION_FAILED),
          },
          { eventName: 'workflowStatus', data: DuoWorkflowStatus.FAILED },
        ];
      }

      activeWorkflows.set(workflowId, subscriptionCallback);

      const workflowEvents = workflowApi.runWorkflow({
        goal,
        type,
        existingWorkflowId: workflowId,
        metadata,
        additionalContext: allContext,
        toolApproval,
        workflowDefinition,
        aiCatalogItemVersionId,
        flowConfig,
        flowConfigId,
        flowConfigSchemaVersion,
        flowVersion,
        additionalOptions,
      });

      // Process workflow events as they come through in the background
      // We don't await this function, so that "startWorkflow" returns after starting the flow
      // rather than after the full workflow completes
      doNotAwait(controller.processWorkflowEvents(workflowId, workflowEvents, goal));

      if (existingWorkflowId) {
        return [];
      }

      await chatContextManager.clearSelectedContextItems();

      return [
        { eventName: 'workflowStarted', data: workflowId },
        { eventName: 'setContextCurrentItemsResult', data: [] },
        ...processingErrors,
      ];
    },

    async processWorkflowEvents(
      workflowId: string,
      workflowEvents: AsyncGenerator<WorkflowStreamEvent>,
      goal: string,
    ) {
      let lastStatus: DuoWorkflowStatus | undefined;

      try {
        for await (const event of workflowEvents) {
          if (isWorkflowExecutorErrorEvent(event)) {
            log.error(`Workflow failed with status code "${event.statusCode}": ${event.message}`);
            activeWorkflows.delete(workflowId);

            if (event.statusCode === WorkflowStatusCode.USAGE_QUOTA_EXCEEDED) {
              messageBus.sendNotification('setUsageQuotaExceeded', {
                exceeded: true,
                isMidStream: true,
              });
            } else {
              messageBus.sendNotification('workflowError', {
                message: event.message,
              });
            }
            messageBus.sendNotification('workflowStatus', DuoWorkflowStatus.FAILED);
            return;
          }

          // Skip any non-checkpoint event (e.g. retry/progress signalling). This
          // consumer only handles errors (above) and checkpoints (below); new
          // out-of-band event types are ignored by default.
          // eslint-disable-next-line no-continue
          if (!isDuoWorkflowEvent(event)) continue;

          lastStatus = event.workflowStatus;

          const callback = activeWorkflows.get(workflowId);
          if (callback) {
            callback(event, workflowId);
          } else {
            // no active workflow callback, user must have navigated away. Break the events loop
            break;
          }
        }

        activeWorkflows.delete(workflowId);

        // If iterator exhausted while workflow was still in progress (CREATED or RUNNING),
        // send INPUT_REQUIRED to clear the loading state
        if (lastStatus && isInProgressState(lastStatus)) {
          log.warn(
            `Workflow ${workflowId} iterator exhausted while in progress state: ${lastStatus}`,
          );
          messageBus.sendNotification('workflowStatus', DuoWorkflowStatus.INPUT_REQUIRED);
        }
      } catch (error) {
        log.error(`Failed to start workflow with goal ${goal}`, error);
        activeWorkflows.delete(workflowId);

        let errorMessage: string;
        if (isSandboxUnavailableError(error)) {
          errorMessage = error.message;
        } else if (isWorkflowExecutorErrorEvent(error)) {
          errorMessage = generateErrorMessageFromStatusCode(error.statusCode);
        } else if (typeof error === 'number') {
          errorMessage = generateErrorMessageFromStatusCode(error);
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          errorMessage = generateErrorMessageFromStatusCode(null);
        }

        messageBus.sendNotification('workflowError', {
          message: errorMessage,
        });
        messageBus.sendNotification('workflowStatus', DuoWorkflowStatus.FAILED);
      }
    },

    stopWorkflow({ workflowId }: { workflowId: string }): ControllerNoReply {
      workflowApi.stopWorkflow(workflowId);
      return NO_REPLY;
    },

    interruptRunningCommand({ workflowId }: { workflowId: string }): ControllerNoReply {
      workflowApi.interruptRunningCommand(workflowId);
      return NO_REPLY;
    },

    trackEvent({
      event,
      context,
    }: {
      event: DuoAgentPlatformEvent;
      context: DuoAgentPlatformContext;
    }): ControllerNoReply {
      duoAgentPlatformTracker.trackEvent(event, context);
      return NO_REPLY;
    },

    redactUserMessage(payload: { content: string }): Result<string, string> {
      const { content } = payload;

      try {
        const redacted = secretRedactor.redactSecrets(content, 'user-input');
        return ok(redacted);
      } catch (error) {
        log.error('Failed to redact user message', error);
        return err(
          'An error occurred while performing secret redaction checks on your message. Your message was not sent.',
        );
      }
    },
  };

  return controller;
};
