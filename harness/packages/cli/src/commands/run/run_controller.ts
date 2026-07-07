import type { ChatElement, ToolCall } from '@gitlab-org/tui';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ErrorHandler } from '@gitlab-org/errors';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { ExitHandler } from '../../utils/exit';
import { CliInitializationService } from '../../cli_initialization_service';
import {
  AgentEventType,
  UserActionType,
  type UserAction,
  type ToolApprovalAction,
} from '../../backend/backend';
import { ParsedCliInput } from '../../parse';
import { SessionManager } from '../../sessions';
import { TerminalProgressService } from '../../utils/terminal_progress_service';
import { NotificationService } from '../../utils/notification_service';
import { SlashCommandAction, SlashCommandService } from '../../slash_commands';
import { RunResultWriter } from './run_result_writer';

@Service({
  dependencies: [
    Logger,
    ErrorHandler,
    SecretRedactor,
    CliInitializationService,
    ParsedCliInput,
    ExitHandler,
    SessionManager,
    TerminalProgressService,
    SlashCommandService,
    AgentSkillsResolver,
    NotificationService,
    RunResultWriter,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class RunController {
  #logger: Logger;

  #errorHandler: ErrorHandler;

  #secretRedactor: SecretRedactor;

  #initService: CliInitializationService;

  #cliInput: ParsedCliInput;

  #exitHandler: ExitHandler;

  #sessionManager: SessionManager;

  #terminalProgress: TerminalProgressService;

  #slashCommandService: SlashCommandService;

  #agentSkillsResolver: AgentSkillsResolver;

  #notificationService: NotificationService;

  #resultWriter: RunResultWriter;

  constructor(
    logger: Logger,
    errorHandler: ErrorHandler,
    secretRedactor: SecretRedactor,
    initService: CliInitializationService,
    cliInput: ParsedCliInput,
    exitHandler: ExitHandler,
    sessionManager: SessionManager,
    terminalProgress: TerminalProgressService,
    slashCommandService: SlashCommandService,
    agentSkillsResolver: AgentSkillsResolver,
    notificationService: NotificationService,
    resultWriter: RunResultWriter,
  ) {
    this.#logger = withPrefix(logger, '[RunController]');
    this.#errorHandler = errorHandler;
    this.#secretRedactor = secretRedactor;
    this.#initService = initService;
    this.#cliInput = cliInput;
    this.#exitHandler = exitHandler;
    this.#sessionManager = sessionManager;
    this.#terminalProgress = terminalProgress;
    this.#slashCommandService = slashCommandService;
    this.#agentSkillsResolver = agentSkillsResolver;
    this.#notificationService = notificationService;
    this.#resultWriter = resultWriter;
  }

  async initialize(): Promise<void> {
    try {
      const { criticalError, existingSessionId } = await this.#initService.initialize();

      if (criticalError) {
        this.#logger.error(criticalError);
        await this.#exitHandler.exit(1);
        return;
      }

      const { session } = await this.#sessionManager.createSession(existingSessionId, {
        skipHistoryRehydration: true,
      });

      try {
        await session.preinitialize();
      } catch (error) {
        this.#logger.warn('Session pre-initialization failed (non-critical)', error);
      }

      await this.#registerSkillSlashCommands();
    } catch (error) {
      this.#errorHandler.handleError('ALCOR initialization failed', error);
      await this.#exitHandler.exit(1);
    }
  }

  async execute(): Promise<void> {
    const session = this.#sessionManager.getActiveSession();
    if (!session || this.#cliInput.command?.name !== 'run') {
      throw new Error('Controller not initialized. Call initialize() first.');
    }

    const { goal, approval, rejectionReason, outputFormat } = this.#cliInput.command;
    const jsonMode = outputFormat === 'json';

    let action: UserAction;
    if (approval) {
      action = this.#buildApprovalAction(approval, rejectionReason);
    } else {
      action = this.#buildPromptAction(goal);
    }

    this.#logger?.info(`Executing workflow: ${JSON.stringify(action, null, 4)}`);

    try {
      const stream = session.sendMessageStream(action);
      const progressTrackedStream = this.#terminalProgress.trackStream(stream);

      let finalElement: ChatElement | undefined;
      for await (const item of progressTrackedStream) {
        // eslint-disable-next-line no-continue
        if (item.type === AgentEventType.Retry) continue; // ignore retry progress as there is no UI to update in headless mode

        this.#handleAgentEvent(item);
        finalElement = item;
      }

      // A non-interactive run is inherently a background/multitask case, so treat the
      // terminal as unfocused when deciding whether to notify.
      const failed = finalElement?.type === 'error';
      this.#notificationService.notify(failed ? 'error' : 'response_ready', { focused: false });

      const exitCode = failed ? 1 : 0;

      // stdout carries only the result; logs go to stderr. In json mode that
      // result is one machine-readable document, in text mode the response text.
      if (jsonMode) {
        this.#resultWriter.writeJson(
          session,
          failed
            ? { status: 'error', exitCode, error: this.#errorFrom(finalElement) }
            : { status: 'success', exitCode },
        );
      } else {
        this.#resultWriter.writeText(session);
      }

      await this.#exitHandler.exit(exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#logger?.error('Workflow failed:', error instanceof Error ? error : undefined);

      // A thrown failure still owes json-mode consumers exactly one document, so
      // emit an error result before the exception propagates. In text mode the
      // failure is already surfaced on stderr via the log above.
      if (jsonMode) {
        this.#resultWriter.writeJson(session, { status: 'error', exitCode: 1, error: message });
      }

      throw error;
    }
  }

  /** Extracts the error string from a terminal error element, if present. */
  #errorFrom(finalElement: ChatElement | undefined): string {
    return finalElement?.type === 'error' ? finalElement.error : 'Unknown error';
  }

  async #registerSkillSlashCommands(): Promise<void> {
    try {
      const { commands: skillCommands, warnings } =
        await this.#agentSkillsResolver.getSkillSlashCommands();

      for (const warning of warnings) {
        this.#logger.warn(`Skill file skipped: "${warning.path}" — ${warning.reason}`);
      }

      if (skillCommands.length === 0) return;

      const dynamicCommands = skillCommands.map((skill) => ({
        name: skill.name,
        description: skill.description,
        action: SlashCommandAction.Skills,
      }));

      this.#slashCommandService.registerDynamicCommands(dynamicCommands);
      this.#logger.debug(
        `Registered ${dynamicCommands.length} skill slash commands: ${dynamicCommands.map((c) => c.name).join(', ')}`,
      );
    } catch (error) {
      this.#logger.warn('Failed to register skill slash commands - skipping', error);
    }
  }

  #rewriteSkillGoal(goal: string): string {
    const trimmed = goal.trim();
    if (!this.#slashCommandService.isCommand(trimmed)) return goal;

    const parts = trimmed.split(/\s+/);
    const commandName = parts[0];

    if (commandName === '/skills') {
      return 'Which agent skills are available in this project?';
    }

    if (!this.#slashCommandService.isDynamicCommand(trimmed)) return goal;

    const skillName = commandName.slice(1);
    const rest = parts.slice(1).join(' ');
    let prompt = `Use the ${skillName} skill`;
    if (rest) {
      prompt += `: '${rest}'`;
    }
    return prompt;
  }

  #buildPromptAction(goal: string): UserAction {
    const redactedGoal = this.#secretRedactor.redactSecrets(goal, 'user-input');
    const effectiveGoal = this.#rewriteSkillGoal(redactedGoal);

    if (effectiveGoal !== redactedGoal) {
      this.#logger?.info(`Skill command rewritten to: "${effectiveGoal}"`);
    }

    return { type: UserActionType.SendPrompt, prompt: effectiveGoal };
  }

  #buildApprovalAction(
    approval: 'approved' | 'rejected',
    rejectionReason?: string,
  ): ToolApprovalAction {
    if (approval === 'rejected') {
      return {
        type: UserActionType.SendToolApproval,
        toolId: '',
        toolName: '',
        approved: false,
        rejectionReason,
      };
    }
    return {
      type: UserActionType.SendToolApproval,
      toolId: '',
      toolName: '',
      approved: true,
      scope: 'once',
    };
  }

  #handleAgentEvent(element: ChatElement): void {
    switch (element.type) {
      // The completed assistant message is the run's result and is emitted to
      // stdout by the result writer, so it is not logged here.
      case 'message':
        break;

      case 'tool': {
        const toolCall = element as ToolCall;
        switch (toolCall.state.type) {
          case 'loading':
            this.#logger?.info(`Tool started: ${toolCall.name}`);
            break;
          case 'success':
            this.#logger?.info(`Tool completed: ${toolCall.id}`);
            break;
          case 'error':
            this.#logger?.info(`Tool completed: ${toolCall.id}`);
            this.#logger?.error(`Tool error: ${toolCall.state.error}`);
            break;
          case 'approval_request':
            // gitlab_backend event mapping emits one of these even though we don't get an actual approval request
            break;
          default:
            break;
        }
        break;
      }

      case 'error': {
        this.#logger?.error(`Error: ${element.error}`);
        break;
      }

      default:
        break;
    }
  }
}
