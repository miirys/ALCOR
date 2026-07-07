import { v4 as uuidv4 } from 'uuid';
import { doNotAwait } from '@gitlab-org/core';
import {
  type AppCallbacks,
  type AppState,
  type CommandComponentRegistry,
  ChatElement,
  defaultInputState,
  DropdownProvider,
  getAppName,
  type ErrorMessage,
} from '@gitlab-org/tui';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { ErrorHandler } from '@gitlab-org/errors';
import { CompositeDisposable, type Disposable } from '@gitlab-org/disposable';
import { collection, Service, ServiceLifetime } from '@gitlab/needle';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { ExitHandler } from '../../utils/exit';
import { type IUpdateChecker, UpdateChecker } from '../../utils/update_checker';
import { CliInitializationService } from '../../cli_initialization_service';
import {
  SendPromptAction as PromptAction,
  ToolApprovalAction,
  UserActionType,
} from '../../backend/backend';
import { ParsedCliInput } from '../../parse';
import { RuntimeContext } from '../../runtime_context';
import {
  CredentialProvider,
  formatCredentialSource,
  type CredentialSource,
} from '../../utils/credential_provider';
import { CliContextManager } from '../../ai_context/cli_ai_context_manager';
import { SlashCommandAction, type SlashCommand, SlashCommandService } from '../../slash_commands';
import { SessionManager } from '../../sessions';
import { ModelManager } from '../../model_manager';
import { TerminalProgressService } from '../../utils/terminal_progress_service';
import { NotificationService } from '../../utils/notification_service';
import { DiagnosticsReporter } from '../doctor/diagnostics_reporter';
import type { ControllerApi, StateMutation } from './controller_api';
import { AppStore } from './app_store';
import { McpStatusController } from './mcp_status_controller';
import { McpApprovalController } from './mcp_approval_controller';
import { PermissionModeService } from './permission_mode_service';
import { PromptHistoryController } from './prompt_history_controller';
import { ToolApprovalHandler } from './tool_approval_handler';
import { TurnController } from './turn_controller';

@Service({
  dependencies: [
    Logger,
    ErrorHandler,
    SecretRedactor,
    CliInitializationService,
    ParsedCliInput,
    RuntimeContext,
    CliContextManager,
    UpdateChecker,
    SlashCommandService,
    ExitHandler,
    SessionManager,
    CredentialProvider,
    McpStatusController,
    McpApprovalController,
    ModelManager,
    collection(DropdownProvider),
    ToolApprovalHandler,
    PermissionModeService,
    TerminalProgressService,
    AgentSkillsResolver,
    PromptHistoryController,
    DiagnosticsReporter,
    NotificationService,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class TUIController implements Disposable {
  #updateCallback?: (state: AppState) => void;

  #sessionManager: SessionManager;

  #store: AppStore = new AppStore();

  #logger: Logger;

  #errorHandler: ErrorHandler;

  #initService: CliInitializationService;

  #cliInput: ParsedCliInput;

  #runtimeContext: RuntimeContext;

  #aiContextManager: CliContextManager;

  #slashCommandService: SlashCommandService;

  #updateChecker: IUpdateChecker;

  #exitHandler: ExitHandler;

  #credentialProvider: CredentialProvider;

  #mcpStatusController: McpStatusController;

  #mcpApprovalController: McpApprovalController;

  #modelManager: ModelManager;

  #dropdownProviders: DropdownProvider[];

  #toolApprovalHandler: ToolApprovalHandler;

  #permissionModeService: PermissionModeService;

  #agentSkillsResolver: AgentSkillsResolver;

  #promptHistoryController: PromptHistoryController;

  #diagnosticsReporter: DiagnosticsReporter;

  #turnController: TurnController;

  #isInitialized?: Promise<void>;

  #disposables = new CompositeDisposable();

  constructor(
    logger: Logger,
    errorHandler: ErrorHandler,
    secretRedactor: SecretRedactor,
    initService: CliInitializationService,
    cliInput: ParsedCliInput,
    runtimeContext: RuntimeContext,
    aiContextManager: CliContextManager,
    updateChecker: IUpdateChecker,
    slashCommandService: SlashCommandService,
    exitHandler: ExitHandler,
    sessionManager: SessionManager,
    credentialProvider: CredentialProvider,
    mcpStatusController: McpStatusController,
    mcpApprovalController: McpApprovalController,
    modelManager: ModelManager,
    dropdownProviders: DropdownProvider[],
    toolApprovalHandler: ToolApprovalHandler,
    permissionModeService: PermissionModeService,
    terminalProgress: TerminalProgressService,
    agentSkillsResolver: AgentSkillsResolver,
    promptHistoryController: PromptHistoryController,
    diagnosticsReporter: DiagnosticsReporter,
    notificationService: NotificationService,
  ) {
    this.#logger = withPrefix(logger, '[TUIController]');
    this.#updateChecker = updateChecker;
    this.#errorHandler = errorHandler;
    this.#initService = initService;
    this.#cliInput = cliInput;
    this.#runtimeContext = runtimeContext;
    this.#aiContextManager = aiContextManager;
    this.#slashCommandService = slashCommandService;
    this.#exitHandler = exitHandler;
    this.#sessionManager = sessionManager;
    this.#credentialProvider = credentialProvider;
    this.#mcpStatusController = mcpStatusController;
    this.#mcpApprovalController = mcpApprovalController;
    this.#modelManager = modelManager;
    this.#dropdownProviders = dropdownProviders;
    this.#toolApprovalHandler = toolApprovalHandler;
    this.#permissionModeService = permissionModeService;
    this.#agentSkillsResolver = agentSkillsResolver;
    this.#promptHistoryController = promptHistoryController;
    this.#diagnosticsReporter = diagnosticsReporter;
    this.#turnController = new TurnController(
      logger,
      this.#store,
      sessionManager,
      secretRedactor,
      promptHistoryController,
      slashCommandService,
      aiContextManager,
      terminalProgress,
      toolApprovalHandler,
      permissionModeService,
      notificationService,
      errorHandler,
    );
  }

  /**
   * Initialises the controller with everything required before we can render the TUI
   * This is a blocking method, and only work critical for the initial rendering of
   * the TUI should be done here, everything else should be moved to #lazyInitialize
   */
  async initialize(onStateUpdate: (state: AppState) => void): Promise<void> {
    this.#updateCallback = onStateUpdate;
    this.#store.initialize((state) => this.#updateCallback?.(state));
    this.#setupInitialState();

    this.#disposables.add({
      dispose: this.#modelManager.onModelChanged((model) => {
        this.#store.setState({ ...this.#store.getState(), selectedModel: model.modelName });
      }),
    });

    this.#disposables.add(
      this.#sessionManager.onActiveSessionChanged(() => {
        this.#turnController.syncFromSession();
        this.#presentPendingToolApproval(this.#sessionManager.getActiveSession()?.elements.at(-1));
      }),
    );

    // Clean up the MCP approval event listener and release any pending gate on exit.
    this.#disposables.add(this.#mcpApprovalController);

    this.#isInitialized = this.#lazyInitialize();
  }

  dispose(): void {
    const sessionId = this.#sessionManager.getActiveSession()?.sessionId;
    if (sessionId) {
      // eslint-disable-next-line no-console
      console.error(`\nTo resume, run: ${getAppName()} --existing-session-id ${sessionId}`);
    }
    this.#disposables.dispose();
  }

  /**
   * Initialises the main LS code, including the DI container, and all required initial API requests.
   * This is non-blocking on the UI, and runs in the background as the TUI initially renders.
   */
  async #lazyInitialize(): Promise<void> {
    // load prompt history early so user interface feels responsive
    await this.#promptHistoryController.load(this.#cliInput.cwd);

    const credentials = await this.#credentialProvider.getCredentials();

    try {
      const { criticalError, workspaceFolder, username, gitlabRemote, existingSessionId } =
        await this.#initService.initialize();

      if (criticalError) {
        await this.#showCriticalErrorAndExit(criticalError);
        return;
      }

      const { sessionDetails } = await this.#sessionManager.createSession(existingSessionId);

      if (gitlabRemote) {
        this.#store.setState({
          ...this.#store.getState(),
          gitlabRemoteInfo: {
            status: 'connected',
            gitlabPath: gitlabRemote.namespaceWithPath,
            gitlabHost: gitlabRemote.host,
          },
        });
      } else {
        this.#store.setState({
          ...this.#store.getState(),
          gitlabRemoteInfo: {
            status: 'error',
            errorMessage: `Could not find GitLab remote info in project ${workspaceFolder}. Some features might not be available.`,
          },
        });
      }

      const hasRejection = Boolean(sessionDetails.sessionRejectionReason);
      this.#store.setState({
        ...this.#store.getState(),
        agenticChatAccess: {
          status: hasRejection ? 'unavailable' : 'available',
          sessionCreated: !hasRejection,
          reason: sessionDetails.sessionRejectionReason,
        },
      });
      doNotAwait(this.#checkForUpdates());

      const session = this.#sessionManager.getActiveSession();
      if (session) {
        // Subscribe before preinitialize triggers reloadAllServers so the
        // 'servers:pending-approval' event is not missed.
        this.#mcpApprovalController.subscribe(this.#createControllerApi());

        doNotAwait(
          // Call session.preinitialize() in background - don't block UI rendering
          session.preinitialize().catch((error) => {
            this.#logger.warn('Session pre-initialization failed (non-critical)', error);
          }),
        );

        // Block until the user has decided on all pending MCP servers (or there
        // are none). This is the only TUI surface that can resolve a pending server.
        await this.#mcpApprovalController.waitForPendingApprovals();
      }

      // Subscribe after approval so the status bar reflects the final connected/
      // rejected states, not the transient pending state.
      this.#mcpStatusController.subscribe(this.#createControllerApi());

      this.#lazySetupInitialState(username, credentials.source);
      doNotAwait(this.#registerSkillSlashCommands());
    } catch (error) {
      this.#errorHandler.handleError('ALCOR initialization failed', error);
      const message = error instanceof Error ? error.message : 'Unknown initialization error';
      await this.#showCriticalErrorAndExit(message);
    }
  }

  async #showCriticalErrorAndExit(message: string): Promise<void> {
    let report: string | undefined;
    try {
      report = await this.#diagnosticsReporter.report();
    } catch (error) {
      this.#logger.warn('Failed to render critical-error diagnostics report', error);
    }
    const errorElement: ErrorMessage = {
      id: `error-${uuidv4()}`,
      type: 'error',
      error: report ? `${message}\n\n${report}` : message,
      timestamp: Date.now(),
    };
    const currentState = this.#store.getState();
    this.#store.setState({
      ...currentState,
      elements: [...currentState.elements, errorElement],
    });
    await this.#exitHandler.exit(1);
  }

  async #registerSkillSlashCommands(): Promise<void> {
    try {
      const { commands: skillCommands, warnings } =
        await this.#agentSkillsResolver.getSkillSlashCommands();

      for (const warning of warnings) {
        this.#showInfo(`⚠️ Skill file skipped: "${warning.path}" — ${warning.reason}`);
      }

      if (skillCommands.length === 0) return;

      const dynamicCommands: SlashCommand[] = skillCommands.map((skill) => ({
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

  async #checkForUpdates(): Promise<void> {
    const updateResult = await this.#updateChecker.checkForUpdate(this.#runtimeContext.cliVersion);

    if (updateResult.type === 'error') {
      this.#logger.warn('Failed to check for updates', updateResult.error);
    }
    if (updateResult.type === 'up-to-date') {
      this.#logger.debug(
        `ALCOR is up to date, latest version: ${updateResult.updateInfo.latestVersion}`,
      );
    }
    this.#store.setState({
      ...this.#store.getState(),
      updateCheckResult: updateResult,
    });
  }

  getDropdownProviders(): DropdownProvider[] {
    return this.#dropdownProviders;
  }

  #commandComponentRegistry?: CommandComponentRegistry;

  getCommandComponentRegistry(): CommandComponentRegistry {
    if (!this.#commandComponentRegistry) {
      this.#commandComponentRegistry = this.#slashCommandService.buildComponentRegistry(
        this.#createControllerApi(),
      );
    }
    return this.#commandComponentRegistry;
  }

  getCallbacks(): AppCallbacks {
    const api = this.#createControllerApi();

    return {
      ...this.#turnController.getCallbacks(api),
      onChoiceSubmit: (value) => {
        const action = value as ToolApprovalAction;
        if (action.type === UserActionType.SendToolApproval) {
          this.#toolApprovalHandler.handleChoiceSubmit(api, action);
        }
      },
      onExit: () => this.#handleExit(),
      toggleExpanded: () => {
        const currentState = this.#store.getState();
        this.#store.setState({
          ...currentState,
          expanded: !currentState.expanded,
        });
      },
      onTextChange: async (text: string) => {
        await this.#aiContextManager?.syncWithTextBuffer(text);
      },
      ...this.#promptHistoryController.getCallbacks(api),
      ...this.#toolApprovalHandler.getCallbacks(api),
      onCycleAgent: () => this.#handleCycleAgent(),
      onFocusChange: (focused: boolean) => {
        this.#turnController.setTerminalFocused(focused);
      },
    };
  }

  /**
   * Setup the store with initial static state that does not require any API calls or other
   * blocking actions. This will be rendered immediately.
   */
  #setupInitialState(): void {
    this.#store.setState({
      elements: [],
      isLoading: false,
      input: defaultInputState,
      expanded: false,
      cwd: this.#cliInput.cwd,
      gitlabRemoteInfo: {
        status: 'not-checked',
      },
      agenticChatAccess: {
        status: 'checking',
        sessionCreated: false,
      },
      selectedModel: '',
      availableAgents: ['build', 'plan'],
      selectedAgent: 'build',
      permissionMode: this.#permissionModeService.getMode(),
    });
  }

  /**
   * Update the static initial state with content from the backend
   * once it is available.
   */
  #lazySetupInitialState(username: string, credentialSource: CredentialSource): void {
    const currentState = this.#store.getState();

    this.#store.setState({
      ...currentState,
      username,
      credentialSource: formatCredentialSource(credentialSource).short,
      selectedModel: this.#modelManager.getModel().modelName,
    });
  }

  /**
   * Called after session rehydration when the active session changes.
   * Presents any tool awaiting approval at the end of the session's elements.
   * Idempotent — already-prompting state is a no-op so we don't double-prompt
   * or clobber a rejection-reason if the user is mid-typing.
   */
  #presentPendingToolApproval(element: ChatElement | undefined): void {
    if (element?.type !== 'tool' || element.state.type !== 'approval_request') return;

    const state = this.#store.getState();
    if (this.#toolApprovalHandler.isPromptingFor(state, element.id)) return;

    this.#toolApprovalHandler.presentApprovalChoices(
      this.#createControllerApi(),
      [element],
      state.selectedAgent,
    );
  }

  #handleCycleAgent(): void {
    const currentState = this.#store.getState();
    const { availableAgents, selectedAgent } = currentState;
    const currentIndex = availableAgents.indexOf(selectedAgent);
    const nextIndex = (currentIndex + 1) % availableAgents.length;
    this.#store.setState({
      ...currentState,
      selectedAgent: availableAgents[nextIndex],
    });
  }

  #handleExit(): void {
    doNotAwait(this.#exitHandler.exit(0));
  }

  #showError(message: string): void {
    const session = this.#sessionManager.getActiveSession();
    session?.addError(message);
    this.#turnController.syncFromSession();
  }

  #showInfo(message: string): void {
    const session = this.#sessionManager.getActiveSession();
    session?.addInfo(message);
    this.#turnController.syncFromSession();
  }

  /**
   * Create a ControllerApi instance for handlers to use.
   */
  #createControllerApi(): ControllerApi {
    const api: ControllerApi = {
      mutateState: (mutation: StateMutation) => {
        const newState = mutation(this.#store.getState());
        this.#store.setState(newState);
        return newState;
      },

      showError: (message: string) => this.#showError(message),

      showInfo: (message: string) => this.#showInfo(message),

      sendPrompt: async (prompt: PromptAction) => {
        await this.#turnController.sendPrompt(api, prompt);
      },

      ensureInitialized: async () => {
        await this.#isInitialized;
      },

      getCommands: () => {
        return this.#slashCommandService.getCommands();
      },

      sendToolApproval: (action: ToolApprovalAction) => {
        doNotAwait(this.#turnController.sendApproval(api, action));
      },

      exit: () => {
        doNotAwait(this.#exitHandler.exit(0));
      },
    };
    return api;
  }
}
