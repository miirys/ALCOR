import { createInterfaceId } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import {
  type ChatLog,
  type DuoWorkflowEvent,
  type WorkflowTool,
  extractUiChatLog,
  isPlanApprovalRequest,
} from '@gitlab-lsp/workflow-api';
import {
  AgentEventType,
  UserEventType,
  type AgentEvent,
  type ApprovalScope,
  type SessionEvent,
} from '../backend';
import { ToolInputFormatterService } from '../tool_input_formatter';

/**
 * Key under which the backend reports the primary agent's context usage in the
 * per-agent `agent_context_usage` map. Coupled to the Duo Workflow Service
 * naming convention; this is the single place to update if the backend renames it.
 */
const PREFERRED_AGENT_KEY = 'agent';

export interface WorkflowEventMapper {
  mapWorkflowEvent(
    duoEvent: DuoWorkflowEvent,
    availableScopes: ApprovalScope[],
  ): Promise<AgentEvent[]>;
  mapChatLogToSessionEvents(chatLog: ChatLog[]): Promise<SessionEvent[]>;
}

export const WorkflowEventMapper = createInterfaceId<WorkflowEventMapper>('WorkflowEventMapper');

export class WorkflowEventMapperService implements WorkflowEventMapper {
  #toolInputFormatter: ToolInputFormatterService;

  #logger: Logger;

  #lastMessageContent = '';

  #lastMessageId = '';

  /**
   * The number of messages that were present in the last processed checkpoint.
   * Used to detect when a checkpoint adds multiple new messages at once
   * (e.g. parallel tool calls), so we can process each new message individually.
   */
  #lastProcessedMessageCount = 0;

  constructor(toolInputFormatter: ToolInputFormatterService, logger: Logger) {
    this.#toolInputFormatter = toolInputFormatter;
    this.#logger = logger;
  }

  #parseTimestamp(timestamp: string): number {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  /**
   * Checks if two tool args are equivalent for matching purposes
   */
  #argsMatch(args1: Record<string, unknown>, args2: Record<string, unknown>): boolean {
    // For command-based tools, compare program field
    if ('program' in args1 && 'program' in args2) {
      return args1.program === args2.program;
    }

    // For other tools, do deep equality check via JSON comparison
    return JSON.stringify(args1) === JSON.stringify(args2);
  }

  /**
   * The backend pairs a no-op or failed compaction tool card with a separate
   * agent message carrying the explanation (other clients ignore tool-card
   * content, so it is sent as its own entry). The CLI renders the compaction
   * card itself, so this notice is redundant. Per the backend contract the only
   * agent message that can directly follow a compaction tool card is this notice.
   *
   * Keyed on `tool_info.name === 'compaction'` — the same signal the formatter
   * uses to route the compaction card (see CompactionFormatter) — so the card
   * rendering and this suppression can never disagree about what is a
   * compaction entry.
   */
  #isCompactionNotice(messages: ChatLog[], index: number): boolean {
    if (index <= 0) return false;
    const previous = messages[index - 1];
    return previous.message_type === 'tool' && previous.tool_info?.name === 'compaction';
  }

  /**
   * Maps a single incoming workflow event to one or more agent events
   * for the UI layer, handling streaming text deltas and tool lifecycle.
   *
   * @param duoEvent The workflow event from the backend
   * @param availableScopes Approval scopes available for this workflow (from capability check)
   */
  async mapWorkflowEvent(
    duoEvent: DuoWorkflowEvent,
    availableScopes: ApprovalScope[],
  ): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];

    const workflowMessagesResult = extractUiChatLog(duoEvent);
    if (workflowMessagesResult.isErr()) {
      this.#logger.error('Failed to parse workflow checkpoint', workflowMessagesResult.error);
      return events;
    }

    // Record context usage only after the checkpoint parses. On a parse error we
    // discard the chat log, so bumping the usage percentage here would tick the
    // indicator upward for a turn the user never sees.
    const tokenUsageEvent = this.#mapTokenUsage(duoEvent.agentContextUsage);
    if (tokenUsageEvent) {
      events.push(tokenUsageEvent);
    }

    const workflowMessages = workflowMessagesResult.value;
    if (workflowMessages.length === 0) {
      return events;
    }

    const latestMessage = workflowMessages[workflowMessages.length - 1];

    // Always process from #lastProcessedMessageCount so that checkpoints which
    // batch multiple new entries (e.g. ToolsExecutor emitting an agent text
    // message followed by one or more tool results in a single state update)
    // are handled correctly regardless of which message type is last.
    //
    // We do NOT advance #lastProcessedMessageCount when the last message is an
    // agent message, because the backend streams agent content in-place: the
    // same index keeps receiving more content until the turn is complete.
    // Keeping the count stable lets the delta mechanism re-process it on the
    // next checkpoint and emit only the incremental text chunk.
    const newMessagesStartIndex = this.#lastProcessedMessageCount;
    if (latestMessage.message_type !== 'agent') {
      this.#lastProcessedMessageCount = workflowMessages.length;
    }

    const messagePromises = workflowMessages
      .slice(newMessagesStartIndex)
      .map((message, offset) =>
        this.#processMessage(
          message,
          newMessagesStartIndex + offset,
          workflowMessages,
          availableScopes,
          newMessagesStartIndex,
        ),
      );
    const newEventBatches = await Promise.all(messagePromises);
    for (const batch of newEventBatches) {
      events.push(...batch);
    }

    return events;
  }

  /**
   * Selects one entry from the per-agent context-usage map and maps it to a
   * TokenUsage event. Selection rule: prefer the entry keyed `agent`; otherwise
   * use the sole entry when there is exactly one; otherwise emit nothing.
   *
   * Returns undefined (no event) when the map is missing/empty, no entry can be
   * selected, or the values are unusable (non-finite, totalTokens <= 0, or
   * maxTokens <= 0). The threshold/percentage formatting lives in the TUI; this
   * mapper only forwards the raw counts.
   */
  #mapTokenUsage(
    agentContextUsage: DuoWorkflowEvent['agentContextUsage'],
  ): (AgentEvent & { type: AgentEventType.TokenUsage }) | undefined {
    if (!agentContextUsage) return undefined;

    const entries = Object.entries(agentContextUsage);
    const usage =
      agentContextUsage[PREFERRED_AGENT_KEY] ?? (entries.length === 1 ? entries[0][1] : undefined);
    if (!usage) return undefined;

    const { totalTokens, maxTokens } = usage;
    if (!Number.isFinite(totalTokens) || totalTokens <= 0) return undefined;
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) return undefined;

    return {
      type: AgentEventType.TokenUsage,
      totalTokens,
      maxTokens,
      timestamp: Date.now(),
    };
  }

  async #processMessage(
    message: ChatLog,
    messageIndex: number,
    workflowMessages: ChatLog[],
    availableScopes: ApprovalScope[],
    newMessagesStartIndex: number = 0,
  ): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];

    // Only process assistant and tool messages - user messages are handled by the controller
    switch (message.message_type) {
      case 'user':
        // Skip user messages
        break;

      case 'agent': {
        const currentContent = message.content;

        // Skip agent messages with no content — nothing to render
        if (!currentContent) break;

        // Skip the redundant compaction notice paired with a compaction card
        if (this.#isCompactionNotice(workflowMessages, messageIndex)) break;

        const currentId = `${messageIndex}`;
        const timestamp = this.#parseTimestamp(message.timestamp);

        // Check if this is the same message being updated (same ID)
        if (currentId === this.#lastMessageId) {
          // Compute delta from last known content
          if (!currentContent.startsWith(this.#lastMessageContent)) {
            this.#logger.error(
              `Workflow Service replaced message content unexpectedly. Message ID: ${currentId} Previous message: "${this.#lastMessageContent}", Current message: "${currentContent}"`,
            );
            events.push({
              type: AgentEventType.TextChunk,
              messageId: currentId,
              content: currentContent,
              timestamp,
            });
            this.#lastMessageContent = currentContent;
          }
          const delta = currentContent.slice(this.#lastMessageContent.length);
          if (delta.length > 0) {
            events.push({
              type: AgentEventType.TextChunk,
              messageId: currentId,
              content: delta,
              timestamp,
            });
            this.#lastMessageContent = currentContent;
          }
        } else {
          // New message (different ID)
          events.push({
            type: AgentEventType.TextChunk,
            messageId: currentId,
            content: currentContent,
            timestamp,
          });
          this.#lastMessageContent = currentContent;
          this.#lastMessageId = currentId;
        }
        break;
      }

      case 'request': {
        if (isPlanApprovalRequest(message)) break;
        // If a matching tool result also appears in the same new batch, the tool
        // was auto-approved and already ran. Skip the approval UI in that case —
        // the tool case below will emit ToolAwaitingApproval + ToolComplete instead.
        const hasMatchingToolInBatch = workflowMessages
          .slice(newMessagesStartIndex)
          .some(
            (m) =>
              m.message_type === 'tool' &&
              m.tool_info !== null &&
              message.tool_info !== null &&
              m.tool_info.name === message.tool_info.name &&
              this.#argsMatch(m.tool_info.args, message.tool_info.args),
          );

        if (!hasMatchingToolInBatch) {
          events.push(
            await this.#createToolAwaitingApprovalEvent(
              `${messageIndex}`,
              message.tool_info.name,
              message.tool_info.args,
              message.content,
              this.#parseTimestamp(message.timestamp),
              availableScopes,
              message.tool_info.suggested_patterns,
            ),
          );
        }
        break;
      }

      case 'tool': {
        // Match approval requests with tool use
        // this craziness is here because tool approval request and tool use are completely different messages from the workflow service perspective
        // We are trying to combine them here so we can show unified tool element for the request and then the call.
        let approvalRequestIndex: number | undefined;
        for (let i = messageIndex - 1; i >= 0; i--) {
          const prevMsg = workflowMessages[i];
          if (
            prevMsg.message_type === 'request' &&
            prevMsg.tool_info !== null &&
            message.tool_info !== null &&
            prevMsg.tool_info.name === message.tool_info.name &&
            this.#argsMatch(prevMsg.tool_info.args, message.tool_info.args)
          ) {
            approvalRequestIndex = i;
            break;
          }
        }

        const toolId = `${approvalRequestIndex ?? messageIndex}`;
        const timestamp = this.#parseTimestamp(message.timestamp);

        // If no approval request was found, emit a "fake" tool_awaiting_approval event
        // to notify the UI that the tool started (for auto-approved tools)
        if (approvalRequestIndex === undefined) {
          const toolName = message.tool_info?.name || 'unknown tool';
          events.push(
            await this.#createToolAwaitingApprovalEvent(
              toolId,
              toolName,
              message.tool_info?.args || {},
              message.content,
              timestamp,
              availableScopes,
            ),
          );
        }

        const output = this.#extractToolOutput(message);

        // When a tool call fails, the node_executor sends a response to DWS like `{ result: '', error: 'Action error: <tool failed reason>' }`
        // However, the next ui_chat_log entry we receive contains a tool entry with `status: 'success'`, so in order to display the tool call as
        // failed we have to check the content for this known string.
        events.push(this.#createToolCompleteEvent(toolId, output, timestamp));

        break;
      }

      default:
        break;
    }

    return events;
  }

  /**
   * Converts a complete chat log into session events suitable for
   * replaying or restoring a previous workflow session in the UI.
   */
  async mapChatLogToSessionEvents(chatLog: ChatLog[]): Promise<SessionEvent[]> {
    const entryResults = await Promise.all(
      chatLog.map((entry, i) => this.#mapChatLogEntry(entry, i, chatLog)),
    );
    return entryResults.flat();
  }

  async #mapChatLogEntry(
    entry: ChatLog,
    index: number,
    chatLog: ChatLog[],
  ): Promise<SessionEvent[]> {
    const timestamp = this.#parseTimestamp(entry.timestamp);
    const messageId = `${index}`;

    switch (entry.message_type) {
      case 'user':
        return [{ type: UserEventType.UserMessage, messageId, content: entry.content, timestamp }];

      case 'agent':
        if (!entry.content) return [];
        // Skip the redundant compaction notice paired with a compaction card
        if (this.#isCompactionNotice(chatLog, index)) return [];
        return [{ type: AgentEventType.TextChunk, messageId, content: entry.content, timestamp }];

      case 'request':
        return this.#mapRequestEntry(entry, index, chatLog, messageId, timestamp);

      case 'tool':
        return this.#mapToolEntry(entry, index, chatLog, messageId, timestamp);

      default:
        return [];
    }
  }

  async #mapRequestEntry(
    entry: ChatLog & { message_type: 'request' },
    index: number,
    chatLog: ChatLog[],
    messageId: string,
    timestamp: number,
  ): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    if (isPlanApprovalRequest(entry)) return events;
    const matchingToolIndex = this.#findMatchingToolExecution(chatLog, index);
    const isTrailingRequest = index === chatLog.length - 1;

    // For historical chat log rehydration, default to ['once'] (no session approval for past events)
    events.push(
      await this.#createToolAwaitingApprovalEvent(
        messageId,
        entry.tool_info.name,
        entry.tool_info.args,
        entry.content,
        timestamp,
        ['once'],
      ),
    );

    if (matchingToolIndex !== -1) {
      const toolEntry = chatLog[matchingToolIndex];
      if (toolEntry.message_type !== 'tool') return events;
      const toolTimestamp = this.#parseTimestamp(toolEntry.timestamp);
      const output = this.#extractToolOutput(toolEntry);

      events.push(this.#createToolCompleteEvent(messageId, output, toolTimestamp));
    } else if (!isTrailingRequest) {
      // A trailing tool approval without a matching resolution (approved, rejected) means
      // the session was closed without the user responding.
      // For non-trailing approvals, we synthesise a ToolComplete: the on-replay tool state
      // starts as `approval_request` when ToolAwaitingApproval is processed, and without a
      // following ToolComplete it would stay in that state — incorrectly re-presenting the
      // approval prompt for a tool the agent has already moved past.
      events.push({
        type: AgentEventType.ToolComplete,
        toolId: messageId,
        result: '',
        timestamp,
      });
    }

    return events;
  }

  async #mapToolEntry(
    entry: ChatLog & { message_type: 'tool' },
    index: number,
    chatLog: ChatLog[],
    messageId: string,
    timestamp: number,
  ): Promise<AgentEvent[]> {
    if (this.#hasMatchingRequest(chatLog, index)) return [];

    const toolName = entry.tool_info?.name ?? 'unknown tool';
    const output = this.#extractToolOutput(entry);

    // For historical chat log rehydration, default to ['once'] (no session approval for past events)
    return [
      await this.#createToolAwaitingApprovalEvent(
        messageId,
        toolName,
        entry.tool_info?.args ?? {},
        entry.content,
        timestamp,
        ['once'],
      ),
      this.#createToolCompleteEvent(messageId, output, timestamp),
    ];
  }

  async #createToolAwaitingApprovalEvent(
    toolId: string,
    toolName: string,
    args: Record<string, unknown>,
    content: string,
    timestamp: number,
    availableScopes: ApprovalScope[],
    suggestedPatterns?: string[],
  ): Promise<AgentEvent & { type: AgentEventType.ToolAwaitingApproval }> {
    return {
      type: AgentEventType.ToolAwaitingApproval,
      toolId,
      toolName,
      input: await this.#toolInputFormatter.formatToolInput(toolName, args),
      content,
      timestamp,
      availableScopes,
      suggestedPatterns,
    };
  }

  #createToolCompleteEvent(
    toolId: string,
    output: string,
    timestamp: number,
  ): AgentEvent & { type: AgentEventType.ToolComplete } {
    return output.startsWith('Action error:')
      ? { type: AgentEventType.ToolComplete, toolId, result: '', error: output, timestamp }
      : { type: AgentEventType.ToolComplete, toolId, result: output, timestamp };
  }

  #extractToolOutput(entry: WorkflowTool): string {
    const toolResponse = entry.tool_info?.tool_response;
    return typeof toolResponse === 'string'
      ? toolResponse
      : (toolResponse?.content ?? entry.content);
  }

  // Known limitation / edge-case: greedy matching can misattribute results when the chat log contains
  // multiple request/tool pairs with identical tool names and args (e.g. two `bash { command: 'ls' }`
  // calls). Both requests will match the first tool entry, losing the second tool's output.
  // This only affects session replay (mapChatLogToSessionEvents), not live streaming.
  // See: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2900#note_3108821806
  #findMatchingToolExecution(chatLog: ChatLog[], requestIndex: number): number {
    const request = chatLog[requestIndex];
    if (request.message_type !== 'request' || isPlanApprovalRequest(request)) return -1;

    for (let i = requestIndex + 1; i < chatLog.length; i++) {
      const entry = chatLog[i];
      if (
        entry.message_type === 'tool' &&
        entry.tool_info !== null &&
        entry.tool_info.name === request.tool_info.name &&
        this.#argsMatch(entry.tool_info.args, request.tool_info.args)
      ) {
        return i;
      }
    }
    return -1;
  }

  #hasMatchingRequest(chatLog: ChatLog[], toolIndex: number): boolean {
    const tool = chatLog[toolIndex];
    if (tool.message_type !== 'tool' || tool.tool_info === null) return false;

    for (let i = toolIndex - 1; i >= 0; i--) {
      const entry = chatLog[i];
      if (
        entry.message_type === 'request' &&
        !isPlanApprovalRequest(entry) &&
        entry.tool_info.name === tool.tool_info.name &&
        this.#argsMatch(entry.tool_info.args, tool.tool_info.args)
      ) {
        return true;
      }
    }
    return false;
  }
}
