import { v4 as uuidv4 } from 'uuid';
import type {
  AgentMode,
  ChatElement,
  ContextUsage,
  ErrorMessage,
  InfoMessage,
  Message,
  RetryStatus,
  ToolCall,
  ToolInput,
} from '@gitlab-org/tui';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  AgentEvent,
  AgentEventType,
  CliBackend,
  RetryAgentEvent,
  SessionEvent,
  UserAction,
  UserEvent,
  UserEventType,
} from '../backend/backend';
import { CancelController } from './cancel_controller';

/**
 * Patch A: mirrors a session event into the local journal. Fire-and-forget by
 * contract — implementations must never throw into the stream path.
 */
export type SessionEventMirror = (sessionId: string, event: SessionEvent, title?: string) => void;

export interface Session {
  readonly sessionId: string;
  readonly elements: readonly ChatElement[];
  readonly isLoading: boolean;
  readonly retryStatus: RetryStatus | undefined;
  readonly contextUsage: ContextUsage | undefined;

  preinitialize(): Promise<void>;
  rehydrateFromEvents(events: SessionEvent[]): void;
  addUserMessageAndStartLoading(content: string, agentMode?: AgentMode): void;
  addError(message: string, timestamp?: number): ErrorMessage;
  addInfo(message: string): InfoMessage;
  sendMessageStream(action: UserAction): AsyncGenerator<ChatElement | RetryAgentEvent>;
  cancelStream(): void;
  forceStop(reason?: string): Promise<void>;
}

export class ChatSession implements Session {
  #initialSessionId: string;

  #backend: CliBackend;

  #logger: Logger;

  #elements: ChatElement[] = [];

  #isLoading = false;

  /**
   * Transient retry progress for the in-flight turn. Set when a Retry event
   * arrives, cleared by any subsequent real event and at turn finalization.
   * Never persisted to #elements and never set during rehydration.
   */
  #retryStatus?: RetryStatus;

  /** Latest context-window usage reported by the backend. */
  #contextUsage?: ContextUsage;

  #abortController?: AbortController;

  #currentAssistantMessage?: Message;

  #toolCalls = new Map<string, ToolCall>();

  #cancelController: CancelController;

  // Patch A: optional local-journal mirror. Undefined leaves behavior unchanged
  // (e.g. in tests and backends without a local store binding).
  #mirror?: SessionEventMirror;

  // The session title is set once, from the first user message of the session.
  #titleMirrored = false;

  constructor(sessionId: string, backend: CliBackend, logger: Logger, mirror?: SessionEventMirror) {
    this.#initialSessionId = sessionId;
    this.#backend = backend;
    this.#mirror = mirror;
    this.#logger = withPrefix(logger, `[Session: ${sessionId}]`);
    // Patch C: structured cancel/force-stop teardown. Aborting the controller
    // fires the backend's abort handler (which stops the workflow /
    // interrupts a running command), so the backend cancel is best-effort and
    // feature-detected; ws + tool-child teardown are handled by the backend at
    // this layer, so they are no-ops here (drift vs. the wiring note).
    const backendWithCancel = backend as CliBackend & {
      cancelActiveWorkflow?(workflowId: string, reason: string): Promise<void>;
    };
    this.#cancelController = new CancelController({
      logger: this.#logger,
      backend: {
        cancelActiveWorkflow: async (workflowId, reason) => {
          await backendWithCancel.cancelActiveWorkflow?.(workflowId, reason);
        },
      },
      toolExecutor: { killActive: async () => {} },
      ui: { emit: () => {} },
      getAbortController: () => this.#abortController,
      getActiveWs: () => undefined,
      getActiveWorkflowId: () => this.#backend.getSessionId?.(),
    });
  }

  /**
   * Prefers the backend's current id, which can change when a terminated
   * session is recovered mid-conversation, so the resume hint points at the
   * live workflow rather than the dead one passed at construction.
   */
  get sessionId(): string {
    return this.#backend.getSessionId?.() ?? this.#initialSessionId;
  }

  get elements(): readonly ChatElement[] {
    return this.#elements;
  }

  get isLoading(): boolean {
    return this.#isLoading;
  }

  get retryStatus(): RetryStatus | undefined {
    return this.#retryStatus;
  }

  get contextUsage(): ContextUsage | undefined {
    return this.#contextUsage;
  }

  rehydrateFromEvents(events: SessionEvent[]): void {
    this.#elements = [];
    for (const event of events) {
      this.#drainGenerator(this.#processSessionEvent(event));
    }
    this.#elements = this.#elements.map((el) =>
      el.type === 'message' ? { ...el, isComplete: true } : el,
    );
    this.#finalizeTurn();
  }

  addUserMessageAndStartLoading(content: string, agentMode?: AgentMode): void {
    const message: Message = {
      id: uuidv4(),
      type: 'message',
      role: 'user',
      content,
      timestamp: Date.now(),
      isComplete: true,
      agentMode,
    };
    this.#elements = [...this.#elements, message];
    this.#isLoading = true;

    // Patch A: user messages never come back through the backend stream, so the
    // synthesized UserEvent is mirrored here. The first one also titles the
    // session in the local manifest.
    this.#mirrorEvent(
      {
        type: UserEventType.UserMessage,
        messageId: message.id,
        content,
        timestamp: message.timestamp,
      },
      this.#titleMirrored ? undefined : content.split(/[\r\n]/)[0].slice(0, 80),
    );
    this.#titleMirrored = true;
  }

  addError(message: string, timestamp?: number): ErrorMessage {
    const errorMessage: ErrorMessage = {
      id: `error-${uuidv4()}`,
      type: 'error',
      error: message,
      timestamp: timestamp ?? Date.now(),
    };
    this.#elements = [...this.#elements, errorMessage];
    return errorMessage;
  }

  addInfo(message: string): InfoMessage {
    const infoMessage: InfoMessage = {
      id: `info-${uuidv4()}`,
      type: 'info',
      message,
      timestamp: Date.now(),
    };
    this.#elements = [...this.#elements, infoMessage];
    return infoMessage;
  }

  async *sendMessageStream(action: UserAction): AsyncGenerator<ChatElement | RetryAgentEvent> {
    this.#isLoading = true;
    this.#cancelController.reset();
    this.#abortController = new AbortController();

    try {
      const agentEvents = this.#backend.sendMessageStream(action, this.#abortController.signal);
      const chatElements = this.#processAgentEvents(agentEvents);
      const chatElementsWithCompletion = this.#withCompletionTracking(chatElements);

      yield* chatElementsWithCompletion;
    } catch (error) {
      this.#logger.error('Error in message streaming:', error);
      yield this.addError('Sorry, there was an error processing your message. Please try again.');
    } finally {
      this.#finalizeTurn();
    }
  }

  async *#processAgentEvents(
    events: AsyncIterable<AgentEvent>,
  ): AsyncGenerator<ChatElement | RetryAgentEvent> {
    for await (const event of events) {
      // Root cause of "cancel doesn't cancel": aborting stops the backend from
      // issuing NEW work, but events already buffered in this async iterable
      // still arrive and used to repaint the UI a beat after the user cancelled
      // — making cancel look broken. Once cancelled/force-stopped, drop any
      // trailing events instead of applying them.
      if (this.#abortController?.signal.aborted) break;
      // Patch A: mirror every applied backend-stream event into the local
      // journal, except Retry (transient progress, explicitly never persisted).
      // Mirroring happens after the abort check so the journal matches what the
      // user actually saw.
      if (event.type !== AgentEventType.Retry) {
        this.#mirrorEvent(event);
      }
      yield* this.#processAgentEvent(event);
    }
  }

  #mirrorEvent(event: SessionEvent, title?: string): void {
    try {
      this.#mirror?.(this.sessionId, event, title);
    } catch (err) {
      this.#logger.warn('failed to mirror session event', err as Error);
    }
  }

  cancelStream(): void {
    this.#cancelController.cancel('user cancel').catch(() => undefined);
  }

  async forceStop(reason = 'user force stop'): Promise<void> {
    await this.#cancelController.forceStop(reason);
  }

  async preinitialize(): Promise<void> {
    await this.#backend.preinitialize?.();
  }

  *#processSessionEvent(event: SessionEvent): Generator<ChatElement | RetryAgentEvent> {
    if (event.type === UserEventType.UserMessage) {
      yield* this.#processUserEvent(event);
    } else {
      yield* this.#processAgentEvent(event);
    }
  }

  *#processUserEvent(event: UserEvent): Generator<ChatElement> {
    const userMessage: Message = {
      id: event.messageId,
      type: 'message',
      role: 'user',
      content: event.content,
      timestamp: event.timestamp,
      isComplete: true,
    };
    this.#elements = [...this.#elements, userMessage];
    yield userMessage;
  }

  *#processAgentEvent(event: AgentEvent): Generator<ChatElement | RetryAgentEvent> {
    // Retry status is transient: a Retry event sets it; any other event clears
    // it once the stream resumes. A retry produces no ChatElement; instead the
    // retry event is yielded onward so the UI can re-sync from the session.
    if (event.type === AgentEventType.Retry) {
      this.#retryStatus = {
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        backoffMs: event.backoffMs,
        startedAt: Date.now(),
      };
      yield event;
      return;
    }
    // Context usage is a side-channel update: record the latest counts (they
    // persist across turns) and produce no ChatElement. It is not a "real"
    // turn event, so it does not clear the transient retry status.
    if (event.type === AgentEventType.TokenUsage) {
      this.#contextUsage = { totalTokens: event.totalTokens, maxTokens: event.maxTokens };
      return;
    }
    // Any subsequent real event clears the transient retry status; the real
    // element from the switch below drives the next sync.
    this.#retryStatus = undefined;

    switch (event.type) {
      case AgentEventType.TextChunk: {
        if (
          !this.#currentAssistantMessage ||
          this.#currentAssistantMessage.id !== event.messageId
        ) {
          this.#currentAssistantMessage = {
            id: event.messageId,
            type: 'message',
            role: 'assistant',
            content: event.content,
            timestamp: event.timestamp,
            isComplete: false,
          };
          this.#elements = [...this.#elements, this.#currentAssistantMessage];
        } else {
          this.#currentAssistantMessage.content += event.content;
          this.#updateElement(this.#currentAssistantMessage);
        }
        yield { ...this.#currentAssistantMessage };
        break;
      }

      case AgentEventType.ToolStart: {
        const toolCall: ToolCall = {
          id: event.toolId,
          type: 'tool',
          name: event.name,
          input: event.input as ToolInput,
          state: { type: 'loading' },
          timestamp: event.timestamp,
        };
        this.#toolCalls.set(event.toolId, toolCall);
        this.#createOrUpdateToolCall(toolCall);
        yield toolCall;
        break;
      }

      case AgentEventType.ToolAwaitingApproval: {
        const toolCall: ToolCall = {
          id: event.toolId,
          type: 'tool',
          name: event.toolName,
          input: event.input as ToolInput,
          state: {
            type: 'approval_request',
            content: '',
            availableScopes: event.availableScopes,
            suggestedPatterns: event.suggestedPatterns,
          },
          timestamp: event.timestamp,
        };
        this.#toolCalls.set(event.toolId, toolCall);
        this.#createOrUpdateToolCall(toolCall);
        yield toolCall;
        break;
      }

      case AgentEventType.ToolComplete: {
        // Look up the existing tool element by id. We check #toolCalls first (fast
        // path for the same-stream case) but fall back to #elements so that tools
        // which were registered in a previous stream (e.g. after an approval
        // round-trip where #finalizeTurn cleared #toolCalls) are still updated.
        const existing =
          this.#toolCalls.get(event.toolId) ??
          (this.#elements.find(
            (el): el is ToolCall => el.type === 'tool' && el.id === event.toolId,
          ) as ToolCall | undefined);
        if (existing) {
          const updatedToolCall: ToolCall = {
            ...existing,
            state: event.error
              ? { type: 'error', error: event.error }
              : { type: 'success', output: event.result },
          };
          this.#createOrUpdateToolCall(updatedToolCall);
          this.#toolCalls.delete(event.toolId);
          yield updatedToolCall;
        }
        break;
      }

      case AgentEventType.Error: {
        this.#logger.error(`Agent error: ${event.message}`);
        yield this.addError(event.message, event.timestamp);
        break;
      }

      default:
        this.#logger.warn(`Unknown agent event type: ${JSON.stringify(event)}`);
        break;
    }
  }

  async *#withCompletionTracking(
    stream: AsyncGenerator<ChatElement | RetryAgentEvent>,
  ): AsyncGenerator<ChatElement | RetryAgentEvent> {
    let trackingMessage: Message | undefined;

    for await (const element of stream) {
      if (element.type === AgentEventType.Retry) {
        yield element;
        // eslint-disable-next-line no-continue
        continue;
      }

      if (trackingMessage && this.#shouldCompleteTrackedMessage(element, trackingMessage)) {
        this.#markComplete(trackingMessage.id);
        yield { ...trackingMessage, isComplete: true };
        trackingMessage = undefined;
      }

      if (this.#isStreamingAssistantMessage(element)) {
        trackingMessage = element;
      }

      yield element;
    }

    if (trackingMessage) {
      this.#markComplete(trackingMessage.id);
      yield { ...trackingMessage, isComplete: true };
    }
  }

  #markComplete(id: string | undefined): void {
    if (!id) return;
    this.#elements = this.#elements.map((el) => (el.id === id ? { ...el, isComplete: true } : el));
  }

  #createOrUpdateToolCall(toolCall: ToolCall): void {
    const index = this.#elements.findIndex((el) => el.type === 'tool' && el.id === toolCall.id);
    if (index < 0) {
      this.#elements = [...this.#elements, toolCall];
      return;
    }
    const updatedElements = [...this.#elements];
    updatedElements[index] = toolCall;
    this.#elements = updatedElements;
  }

  #updateElement(element: ChatElement): void {
    const index = this.#elements.findIndex((el) => el.id === element.id);
    if (index >= 0) {
      this.#elements = [
        ...this.#elements.slice(0, index),
        element,
        ...this.#elements.slice(index + 1),
      ];
    }
  }

  #finalizeTurn(): void {
    this.#isLoading = false;
    this.#retryStatus = undefined;
    this.#currentAssistantMessage = undefined;
    this.#toolCalls.clear();
    this.#abortController = undefined;
  }

  #drainGenerator(gen: Generator<unknown>): void {
    let result = gen.next();
    while (!result.done) {
      result = gen.next();
    }
  }

  #isStreamingAssistantMessage(el: ChatElement): el is Message {
    return el.type === 'message' && el.role === 'assistant' && !el.isComplete;
  }

  #shouldCompleteTrackedMessage(el: ChatElement, tracked: Message): boolean {
    return el.type !== 'message' || el.id !== tracked.id;
  }
}
