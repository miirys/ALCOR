import { throttle } from 'lodash-es';
import {
  type AppCallbacks,
  type ChatElement,
  defaultInputState,
  type ToolCall,
} from '@gitlab-org/tui';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { ErrorHandler } from '@gitlab-org/errors';
import {
  AgentEventType,
  type SendPromptAction as PromptAction,
  type ToolApprovalAction,
  type UserAction,
  UserActionType,
} from '../../backend/backend';
import { CliContextManager } from '../../ai_context/cli_ai_context_manager';
import { SlashCommandService } from '../../slash_commands';
import { SessionManager } from '../../sessions';
import { TerminalProgressService } from '../../utils/terminal_progress_service';
import { NotificationService } from '../../utils/notification_service';
import type { ControllerApi } from './controller_api';
import { AppStore } from './app_store';
import { ToolApprovalHandler } from './tool_approval_handler';
import { PermissionModeService } from './permission_mode_service';
import { PromptHistoryController } from './prompt_history_controller';

type TurnCallbacks = Pick<
  AppCallbacks,
  'onSubmit' | 'onCancelStream' | 'onForceStop' | 'onCancelQueuedPrompt'
>;

/**
 * Owns the conversation turn lifecycle: deciding whether an incoming prompt is
 * queued, dispatched as a slash command, or streamed; running the message
 * stream; presenting tool approvals; and flushing a queued prompt once the turn
 * ends. Keeping this out of the TUIController keeps the controller focused on
 * wiring (initialization, MCP, models, callbacks) rather than turn mechanics.
 */
export class TurnController {
  #logger: Logger;

  #store: AppStore;

  #sessionManager: SessionManager;

  #secretRedactor: SecretRedactor;

  #promptHistoryController: PromptHistoryController;

  #slashCommandService: SlashCommandService;

  #aiContextManager: CliContextManager;

  #terminalProgress: TerminalProgressService;

  #toolApprovalHandler: ToolApprovalHandler;

  #permissionModeService: PermissionModeService;

  #notificationService: NotificationService;

  #errorHandler: ErrorHandler;

  // Default to focused: a terminal launched in the foreground (the common case) is already
  // focused, and DEC mode ?1004 does not emit a focus-in event for an already-focused terminal,
  // so we'd otherwise fire a spurious notification on the first turn-end. Focus-out/in events
  // keep this accurate thereafter.
  #terminalFocused = true;

  // 100ms keeps streamed text feeling live (~10fps) while still batching
  // re-renders; the previous 500ms made token streaming appear chunky.
  #throttledStateSync = throttle(() => this.#syncAppStateFromSession(), 100, {
    leading: true,
    trailing: true,
  });

  constructor(
    logger: Logger,
    store: AppStore,
    sessionManager: SessionManager,
    secretRedactor: SecretRedactor,
    promptHistoryController: PromptHistoryController,
    slashCommandService: SlashCommandService,
    aiContextManager: CliContextManager,
    terminalProgress: TerminalProgressService,
    toolApprovalHandler: ToolApprovalHandler,
    permissionModeService: PermissionModeService,
    notificationService: NotificationService,
    errorHandler: ErrorHandler,
  ) {
    this.#logger = withPrefix(logger, '[TurnController]');
    this.#store = store;
    this.#sessionManager = sessionManager;
    this.#secretRedactor = secretRedactor;
    this.#promptHistoryController = promptHistoryController;
    this.#slashCommandService = slashCommandService;
    this.#aiContextManager = aiContextManager;
    this.#terminalProgress = terminalProgress;
    this.#toolApprovalHandler = toolApprovalHandler;
    this.#permissionModeService = permissionModeService;
    this.#notificationService = notificationService;
    this.#errorHandler = errorHandler;
  }

  getCallbacks(api: ControllerApi): TurnCallbacks {
    return {
      onSubmit: (value) =>
        this.#handleSubmitInput(api, {
          type: UserActionType.SendPrompt,
          prompt: value,
          agentMode: this.#store.getState().selectedAgent,
        }),
      onCancelStream: () => {
        const session = this.#sessionManager.getActiveSession();
        if (this.#store.getState().isLoading && session) {
          this.#logger.info('Cancelling stream due to ESC key press');
          session.cancelStream();
        }
      },
      onForceStop: () => {
        const session = this.#sessionManager.getActiveSession();
        if (session) {
          this.#logger.info('Force-stopping stream due to second ESC key press');
          session.forceStop().catch(() => undefined);
        }
      },
      onCancelQueuedPrompt: () => this.#cancelQueuedPrompt(),
    };
  }

  /**
   * Send a prompt programmatically (e.g. from a slash-command handler). Skips
   * prompt history so command-generated prompts do not pollute it.
   */
  async sendPrompt(api: ControllerApi, action: PromptAction): Promise<void> {
    await this.#handleSendPrompt(api, action, false);
  }

  async sendApproval(api: ControllerApi, toolAction: ToolApprovalAction): Promise<void> {
    const currentState = this.#store.getState();
    if (currentState.isLoading) {
      return;
    }

    this.#store.setState({
      ...currentState,
      input: defaultInputState,
    });

    await this.#startStream(api, toolAction);
  }

  /** Sync app state from the active session immediately (cancelling any pending throttle). */
  syncFromSession(): void {
    this.#immediateStateSync();
  }

  setTerminalFocused(focused: boolean): void {
    this.#terminalFocused = focused;
  }

  async #handleSubmitInput(api: ControllerApi, action: PromptAction): Promise<void> {
    if (!action.prompt.trim()) {
      return;
    }

    // Mid-turn: queue the prompt instead of dropping it; flushed at the turn boundary.
    if (this.#store.getState().isLoading) {
      this.#queuePrompt(action.prompt);
      return;
    }

    // Try to handle as a slash command first
    if (this.#slashCommandService.isCommand(action.prompt)) {
      try {
        await api.ensureInitialized();
        // Record the raw input in prompt history BEFORE dispatch so slash
        // commands stay up-arrow-recallable regardless of how execute()
        // terminates (throws, gets cancelled, or takes non-trivial time
        // before returning cleanly). Mirrors how #handleSendPrompt records
        // history for non-slash prompts before streaming.
        // PromptHistoryController.addToHistory swallows its own errors, so
        // this is safe to await without gating command execution.
        await this.#promptHistoryController.addToHistory(
          this.#secretRedactor.redactSecrets(action.prompt, 'user-input'),
        );
        await this.#slashCommandService.execute(action.prompt, api);
        return;
      } catch (error) {
        this.#errorHandler.handleError('Failed to execute slash command', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error executing slash command';
        api.showError(errorMessage);
        return;
      }
    }

    await this.#handleSendPrompt(api, action);
  }

  /**
   * Hold a prompt submitted mid-turn. A single slot is kept; submitting again
   * overwrites it, which is how the user revises a queued message. The agent
   * mode is captured here so cycling agents before flush does not change the
   * request the user signed off on.
   */
  #queuePrompt(prompt: string): void {
    const state = this.#store.getState();
    this.#store.setState({
      ...state,
      input: defaultInputState,
      queuedPrompt: { prompt, agentMode: state.selectedAgent },
    });
  }

  /**
   * Clears the queued prompt without cancelling the active stream, restoring
   * its text into the input box so the user can edit and resubmit. Pushing
   * input.lines re-seeds TextInput's internal buffer; any draft typed after
   * the prompt was queued is replaced by the restored text. The cursor is
   * placed at the end of the restored text so appending continues naturally.
   */
  #cancelQueuedPrompt(): void {
    const state = this.#store.getState();
    if (state.queuedPrompt === undefined) return;

    const lines = state.queuedPrompt.prompt.split('\n');
    this.#store.setState({
      ...state,
      queuedPrompt: undefined,
      input: {
        ...defaultInputState,
        lines,
        cursorLine: lines.length - 1,
        cursorColumn: lines[lines.length - 1].length,
      },
    });
  }

  /**
   * Re-submits a queued prompt through the normal input path so slash commands
   * and history behave as a fresh submission would. On failure the queued
   * prompt is restored so the user can retry, and the error is logged rather
   * than propagated: the failure belongs to the queued submission, not the
   * turn whose completion triggered the flush.
   */
  async #flushQueuedPrompt(api: ControllerApi): Promise<void> {
    const queued = this.#store.getState().queuedPrompt;
    if (queued === undefined) return;

    this.#store.setState({ ...this.#store.getState(), queuedPrompt: undefined });
    try {
      await this.#handleSubmitInput(api, {
        type: UserActionType.SendPrompt,
        prompt: queued.prompt,
        agentMode: queued.agentMode,
      });
    } catch (err) {
      this.#store.setState({ ...this.#store.getState(), queuedPrompt: queued });
      this.#errorHandler.handleError('Failed to flush queued prompt', err);
    }
  }

  async #handleSendPrompt(
    api: ControllerApi,
    action: PromptAction,
    addToHistory: boolean = true,
  ): Promise<void> {
    if (this.#store.getState().isLoading) {
      return;
    }

    const redactedPrompt = this.#secretRedactor.redactSecrets(action.prompt, 'user-input');
    const redactedAction = { ...action, prompt: redactedPrompt };

    if (addToHistory) {
      await this.#promptHistoryController.addToHistory(redactedAction.prompt);
    }

    await this.#startStream(api, redactedAction);
  }

  async #startStream(api: ControllerApi, action: UserAction): Promise<void> {
    // set loading state
    this.#store.setState({
      ...this.#store.getState(),
      input: defaultInputState,
      isLoading: true,
    });

    // Wait for lazy initialization to complete if needed
    await api.ensureInitialized();

    const session = this.#sessionManager.getActiveSession();
    if (!session) throw new Error('Session not initialized');

    if (action.type === UserActionType.SendPrompt) {
      // Slash-command-generated prompts arrive without an agentMode; fall back to
      // the current selection so the displayed message keeps its agent badge.
      session.addUserMessageAndStartLoading(
        action.prompt,
        action.agentMode ?? this.#store.getState().selectedAgent,
      );
      this.#immediateStateSync();
    }

    const userAction = await this.#mergeAiContextItems(action);

    const stream = session.sendMessageStream(userAction);
    const progressTrackedStream = this.#terminalProgress.trackStream(stream);

    let lastErrorElement: ChatElement | undefined;
    const pendingApprovals = new Map<string, ToolCall>();

    for await (const element of progressTrackedStream) {
      if (element.type === AgentEventType.Retry) {
        this.#immediateStateSync(); // Retry produces no ChatElement, but we re-sync transient retry status so UI updates.
        // eslint-disable-next-line no-continue
        continue;
      }

      if (this.#isStreamingTextUpdate(element)) {
        this.#throttledStateSync();
      } else {
        this.#immediateStateSync();
      }

      if (element.type === 'error') {
        lastErrorElement = element;
      }

      if (element.type === 'tool') {
        const toolCall = element as ToolCall;
        if (toolCall.state.type === 'approval_request') {
          pendingApprovals.set(toolCall.id, toolCall);
        } else {
          // Tool completed or errored — no longer needs approval
          pendingApprovals.delete(toolCall.id);
        }
      }
    }

    if (lastErrorElement?.type === 'error') {
      this.#errorHandler.handleError(
        'Error in message streaming',
        new Error(lastErrorElement.error),
      );
    }

    const pendingApprovalList = [...pendingApprovals.values()];
    const autoApprove = pendingApprovalList.length > 0 && this.#permissionModeService.isAuto();

    if (pendingApprovalList.length > 0 && !autoApprove) {
      this.#toolApprovalHandler.presentApprovalChoices(
        api,
        pendingApprovalList,
        this.#store.getState().selectedAgent,
      );
    }

    // In auto mode the pending approvals are resolved without user input, so
    // no "approval needed" notification is raised.
    this.#notifyTurnEnd(lastErrorElement, pendingApprovalList.length > 0 && !autoApprove);

    // Sync BEFORE auto-approving so isLoading reflects the finished stream —
    // sendApproval drops actions while the store still reports loading.
    this.#immediateStateSync();

    if (autoApprove) {
      this.#logger.info(
        `Auto mode: approving ${pendingApprovalList.length} pending tool call(s) without prompting`,
      );
      this.#toolApprovalHandler.autoApproveAll(
        api,
        pendingApprovalList,
        this.#store.getState().selectedAgent,
      );
      // The approval restarts the stream; a queued prompt flushes when that
      // continuation turn ends.
      return;
    }

    // Only flush once the turn has truly ended; a pending approval means it hasn't.
    if (pendingApprovalList.length === 0) {
      await this.#flushQueuedPrompt(api);
    }
  }

  /**
   * Raises a system notification for the turn's end state so the user is alerted when the
   * session needs attention while they're multitasking. The NotificationService applies the
   * configured channel and focus gating before delivering.
   */
  #notifyTurnEnd(lastErrorElement: ChatElement | undefined, hasPendingApproval: boolean): void {
    const ctx = { focused: this.#terminalFocused };
    if (lastErrorElement?.type === 'error') {
      this.#notificationService.notify('error', ctx);
    } else if (hasPendingApproval) {
      this.#notificationService.notify('approval', ctx);
    } else {
      this.#notificationService.notify('response_ready', ctx);
    }
  }

  #isStreamingTextUpdate(element: ChatElement): boolean {
    return element.type === 'message' && element.role === 'assistant' && !element.isComplete;
  }

  async #mergeAiContextItems(action: UserAction): Promise<UserAction> {
    if (action.type !== UserActionType.SendPrompt) return action;

    const userAction = action;
    try {
      const aiContextItems = await this.#aiContextManager.retrieveContextItemsWithContent({
        mode: 'agentic',
      });
      userAction.aiContextItems = [...(userAction.aiContextItems || []), ...(aiContextItems || [])];
      await this.#aiContextManager.clearSelectedContextItems();
    } catch (error) {
      this.#logger.error(
        'Failed to get AIContextItems for message. Context items will be omitted.',
        error,
      );
    }
    return userAction;
  }

  #immediateStateSync(): void {
    this.#throttledStateSync.cancel();
    this.#syncAppStateFromSession();
  }

  #syncAppStateFromSession(): void {
    const session = this.#sessionManager.getActiveSession();
    if (!session) return;

    this.#store.setState({
      ...this.#store.getState(),
      sessionId: session.sessionId,
      elements: [...session.elements],
      isLoading: session.isLoading,
      retryStatus: session.retryStatus,
      contextUsage: session.contextUsage,
    });
  }
}
