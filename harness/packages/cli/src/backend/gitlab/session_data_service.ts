import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  type ChatLog,
  type DuoWorkflowLatestCheckpoint,
  extractUiChatLog,
  GET_LATEST_CHECKPOINT_QUERY,
  WorkflowFilter,
  WorkflowRunner,
} from '@gitlab-lsp/workflow-api';
import type {
  DuoWorkflowData,
  getWorkflowsVariables,
  DuoMessage,
  DuoWorkflowInfo,
} from '@gitlab-org/graphql';
import { toGitLabGid, tryParseGitLabGidToString } from '@gitlab-org/core';
import type { SessionListItem } from '@gitlab-org/tui';
import type { SessionEvent } from '../backend';
import { ToolInputFormatterService } from '../tool_input_formatter';
import { SessionDataService } from '../../sessions/session_data_service';
import type { GetSessionHistoryOptions, SessionHistoryPage } from '../../sessions/session_history';
import { WorkflowEventMapperService } from './workflow_event_mapper';

@Implements(SessionDataService)
@Service({
  dependencies: [Logger, WorkflowRunner, ToolInputFormatterService],
  lifetime: ServiceLifetime.Singleton,
})
export class GitLabSessionDataService implements SessionDataService {
  #logger: Logger;

  #workflowRunner: WorkflowRunner;

  #workflowEventMapper: WorkflowEventMapperService;

  constructor(
    logger: Logger,
    workflowRunner: WorkflowRunner,
    toolInputFormatter: ToolInputFormatterService,
  ) {
    this.#logger = withPrefix(logger, '[SessionDataService]');
    this.#workflowRunner = workflowRunner;
    this.#workflowEventMapper = new WorkflowEventMapperService(toolInputFormatter, logger);
  }

  /**
   * Fetches a paginated list of session history items, filtering out archived and dangling workflows.
   */
  async getSessionHistory(options: GetSessionHistoryOptions): Promise<SessionHistoryPage> {
    const pageSize = options.pageSize ?? 50;
    const isBackward = Boolean(options.beforeCursor);

    const variables: getWorkflowsVariables = {
      type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
      first: isBackward ? null : pageSize,
      last: isBackward ? pageSize : null,
      after: options.afterCursor ?? null,
      before: options.beforeCursor ?? null,
      search: options.search ?? null,
    };

    const data = await this.#workflowRunner.getGraphqlData<DuoWorkflowData>({
      operationName: 'duoWorkflows',
      query: null,
      variables,
      signal: options.signal,
    });

    const edges = data.duoWorkflowWorkflows.edges ?? [];
    const items = edges
      .map((edge) => edge.node)
      .filter((workflow) => !workflow.archived)
      .filter((workflow) => !this.#isDanglingPreCreatedWorkflow(workflow))
      .map(
        (workflow) =>
          ({
            id: tryParseGitLabGidToString(workflow.id),
            title: workflow.goal || 'Untitled session',
            status: workflow.humanStatus,
            lastActivity: workflow.updatedAt,
            lastMessagePreview: this.#formatLastMessagePreview(
              workflow.latestCheckpoint?.duoMessages,
            ),
          }) satisfies SessionListItem,
      );

    const { pageInfo } = data.duoWorkflowWorkflows;

    return {
      items,
      pageInfo: {
        hasNextPage: pageInfo.hasNextPage,
        hasPreviousPage: pageInfo.hasPreviousPage,
        endCursor: pageInfo.endCursor || undefined,
        startCursor: pageInfo.startCursor || undefined,
      },
    };
  }

  /**
   * Retrieves session messages as SessionEvents for a given session from its latest checkpoint.
   */
  async getSessionMessages(sessionId: string): Promise<SessionEvent[]> {
    const chatLog = await this.#getRawChatLog(sessionId);
    return this.#workflowEventMapper.mapChatLogToSessionEvents(chatLog);
  }

  async #getRawChatLog(sessionId: string): Promise<ChatLog[]> {
    const response = await this.#workflowRunner.getGraphqlData<DuoWorkflowLatestCheckpoint>({
      query: GET_LATEST_CHECKPOINT_QUERY,
      variables: { workflowId: toGitLabGid('Ai::DuoWorkflows::Workflow', sessionId) },
    });

    const latestCheckpoint = response.duoWorkflowWorkflows?.nodes?.[0]?.latestCheckpoint;
    if (!latestCheckpoint) {
      return [];
    }

    const chatLogResult = extractUiChatLog(latestCheckpoint);
    if (chatLogResult.isErr()) {
      this.#logger.error('Failed to extract chat log from checkpoint', chatLogResult.error);
      return [];
    }

    return chatLogResult.value;
  }

  #formatLastMessagePreview(messages: DuoMessage[] | undefined): string | undefined {
    const last = messages?.at(-1);
    if (!last) return undefined;

    if (last.messageType === 'tool') {
      try {
        const info = JSON.parse(last.toolInfo ?? '{}');
        const name = typeof info.name === 'string' ? info.name : 'unknown';
        return `Used tool: ${name}`;
      } catch {
        return 'Used tool';
      }
    }

    return last.content?.split(/[\r\n]/)[0].trim();
  }

  #isDanglingPreCreatedWorkflow(workflow: DuoWorkflowInfo): boolean {
    const MAX_PRE_CREATED_GOAL_LENGTH = 3;
    return (
      workflow.latestCheckpoint === null &&
      (workflow.goal ?? '').length <= MAX_PRE_CREATED_GOAL_LENGTH
    );
  }
}
