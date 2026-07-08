import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { doNotAwait } from '@gitlab-org/core';
import type {
  AppCallbacks,
  AppState,
  ChatElement,
  ErrorMessage,
  Message,
  RetryStatus,
  ToolCall,
  UpdateCheckResult,
  UpdateInfo,
} from '@gitlab-org/tui';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { ErrorHandler } from '@gitlab-org/errors';
import type { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { AgentEventType, type RetryAgentEvent, UserActionType } from '../../backend/backend';
import type { ParsedCliInput } from '../../parse';
import type { RuntimeContext } from '../../runtime_context';
import type { Credentials, CredentialProvider } from '../../utils/credential_provider';
import type { IUpdateChecker } from '../../utils/update_checker';
import type {
  CliInitializationService,
  InitializationResult,
} from '../../cli_initialization_service';
import type { CliContextManager } from '../../ai_context/cli_ai_context_manager';
import type { SlashCommandService } from '../../slash_commands';

import type { SlashCommandHandler } from '../../slash_commands/slash_command_handler';
import type { ExitHandler } from '../../utils/exit';
import type { ModelManager } from '../../model_manager';
import type { Session, SessionManager } from '../../sessions';
import { TerminalProgressService } from '../../utils/terminal_progress_service';
import type { NotificationService } from '../../utils/notification_service';
import type { DiagnosticsReporter } from '../doctor/diagnostics_reporter';
import type { McpStatusController } from './mcp_status_controller';
import type { McpApprovalController } from './mcp_approval_controller';
import type { ControllerApi } from './controller_api';
import { TUIController } from './tui_controller';
import type { ToolApprovalHandler } from './tool_approval_handler';
import type { PermissionModeService } from './permission_mode_service';
import type { PromptHistoryController } from './prompt_history_controller';

describe('TUIController', () => {
  let controller: TUIController;
  let mockLogger: Logger;
  let mockErrorHandler: ErrorHandler;
  let mockSecretRedactor: SecretRedactor;
  let mockInitService: CliInitializationService;
  let mockCliInput: ParsedCliInput;
  let mockRuntimeContext: RuntimeContext;
  let mockCredentialProvider: CredentialProvider;
  let mockAiContextManager: CliContextManager;
  let mockUpdateChecker: IUpdateChecker;
  let mockSlashCommandService: SlashCommandService;
  let mockExitHandler: ExitHandler;
  let mockSessionManager: SessionManager;
  let mockMcpStatusController: McpStatusController;

  let mockMcpApprovalController: McpApprovalController;
  let mockModelManager: ModelManager;
  let mockToolApprovalHandler: ToolApprovalHandler;
  let mockPermissionModeService: PermissionModeService;
  let mockTerminalProgress: TerminalProgressService;
  let mockAgentSkillsResolver: AgentSkillsResolver;
  let mockPromptHistoryController: PromptHistoryController;
  let mockDiagnosticsReporter: DiagnosticsReporter;
  let mockNotificationService: NotificationService;
  let mockUpdateCallback: jest.MockedFunction<(state: AppState) => void>;

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockErrorHandler = createFakePartial<ErrorHandler>({
      handleError: jest.fn(),
    });

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn<SecretRedactor['redactSecrets']>().mockImplementation((text) => text),
    });

    mockInitService = createFakePartial<CliInitializationService>({
      initialize: jest.fn<CliInitializationService['initialize']>().mockResolvedValue(
        createFakePartial<InitializationResult>({
          existingSessionId: 'test-session-id',
          workspaceFolder: '/test/workspace',
          username: '@testuser',
          systemContext: [],
        }),
      ),
    });

    mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: '/test/cwd',
      command: { name: 'tui' },
    });

    mockRuntimeContext = createFakePartial<RuntimeContext>({
      cliVersion: '0.0.0-test',
    });

    mockCredentialProvider = createFakePartial<CredentialProvider>({
      getCredentials: jest.fn<() => Promise<Credentials>>().mockResolvedValue({
        token: 'test-token',
        baseUrl: 'https://gitlab.example.com',
        source: { type: 'env-or-flag' },
      }),
    });

    mockAiContextManager = createFakePartial<CliContextManager>({
      retrieveContextItemsWithContent:
        jest.fn<CliContextManager['retrieveContextItemsWithContent']>(),
      clearSelectedContextItems: jest.fn<CliContextManager['clearSelectedContextItems']>(),
    });

    mockUpdateChecker = createFakePartial<IUpdateChecker>({
      checkForUpdate: jest
        .fn<IUpdateChecker['checkForUpdate']>()
        .mockResolvedValue({ type: 'error', error: new Error('test') }),
    });

    mockSlashCommandService = createFakePartial<SlashCommandService>({
      isCommand: jest.fn<SlashCommandService['isCommand']>().mockReturnValue(false),
      getCommands: jest.fn<SlashCommandService['getCommands']>().mockReturnValue([]),
      execute: jest.fn<SlashCommandService['execute']>().mockResolvedValue(undefined),
      searchCommands: jest.fn<SlashCommandService['searchCommands']>().mockReturnValue([]),
      buildComponentRegistry: jest
        .fn<SlashCommandService['buildComponentRegistry']>()
        .mockReturnValue(new Map()),
    });

    mockExitHandler = createFakePartial<ExitHandler>({
      exit: jest.fn<ExitHandler['exit']>().mockResolvedValue(undefined as never),
    });

    const mockSession = createFakePartial<Session>({
      sessionId: 'test-session-id',
      elements: [],
      isLoading: false,
      preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
    });

    mockSessionManager = createFakePartial<SessionManager>({
      createSession: jest.fn<SessionManager['createSession']>().mockResolvedValue({
        session: mockSession,
        sessionDetails: {},
      }),
      getActiveSession: jest.fn<SessionManager['getActiveSession']>().mockReturnValue(mockSession),
      onActiveSessionChanged: jest
        .fn<SessionManager['onActiveSessionChanged']>()
        .mockReturnValue({ dispose: () => {} }),
    });

    mockModelManager = createFakePartial<ModelManager>({
      getModel: jest
        .fn<ModelManager['getModel']>()
        .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
      setModel: jest.fn<ModelManager['setModel']>(),
      onModelChanged: jest.fn<ModelManager['onModelChanged']>().mockReturnValue(() => {}),
      initialize: jest.fn<ModelManager['initialize']>().mockResolvedValue(undefined),
      saveModel: jest.fn<ModelManager['saveModel']>().mockResolvedValue(undefined),
    });

    mockMcpStatusController = createFakePartial<McpStatusController>({
      subscribe: jest.fn(),
    });

    mockMcpApprovalController = createFakePartial<McpApprovalController>({
      subscribe: jest.fn(),
      waitForPendingApprovals: jest
        .fn<McpApprovalController['waitForPendingApprovals']>()
        .mockResolvedValue(undefined),
      dispose: jest.fn(),
    });

    mockToolApprovalHandler = createFakePartial<ToolApprovalHandler>({
      presentApprovalChoices: jest.fn(),
      handleChoiceSubmit: jest.fn<ToolApprovalHandler['handleChoiceSubmit']>(),
      getCallbacks: jest.fn<ToolApprovalHandler['getCallbacks']>().mockReturnValue({
        onSubmitRejectionReason: jest.fn(),
        onCancelRejectionReason: jest.fn(),
      }),
      isPromptingFor: jest.fn<ToolApprovalHandler['isPromptingFor']>().mockReturnValue(false),
      autoApproveAll: jest.fn<ToolApprovalHandler['autoApproveAll']>(),
    });

    mockPermissionModeService = createFakePartial<PermissionModeService>({
      getMode: jest.fn<PermissionModeService['getMode']>().mockReturnValue('default'),
      setMode: jest.fn<PermissionModeService['setMode']>(),
      isAuto: jest.fn<PermissionModeService['isAuto']>().mockReturnValue(false),
      toggle: jest.fn<PermissionModeService['toggle']>().mockReturnValue('auto'),
    });

    mockTerminalProgress = createFakePartial<TerminalProgressService>({
      trackStream: jest
        .fn<TerminalProgressService['trackStream']>()
        .mockImplementation(async function* (stream) {
          yield* stream;
        }),
    });

    mockAgentSkillsResolver = createFakePartial<AgentSkillsResolver>({
      getSkillSlashCommands: jest
        .fn<AgentSkillsResolver['getSkillSlashCommands']>()
        .mockResolvedValue({ commands: [], warnings: [] }),
    });

    mockDiagnosticsReporter = createFakePartial<DiagnosticsReporter>({
      report: jest.fn<DiagnosticsReporter['report']>().mockResolvedValue('# diagnostics-report'),
    });

    mockPromptHistoryController = createFakePartial<PromptHistoryController>({
      load: jest.fn<PromptHistoryController['load']>().mockResolvedValue(undefined),
      addToHistory: jest.fn<PromptHistoryController['addToHistory']>().mockResolvedValue(undefined),
      getCallbacks: jest.fn<PromptHistoryController['getCallbacks']>().mockReturnValue({
        onHistoryPrevious: jest.fn(),
        onHistoryNext: jest.fn(),
        onOpenHistorySearch: jest.fn(),
        onCancelHistorySearch: jest.fn(),
        onHistorySearchQueryChange: jest.fn(),
        onSelectHistoryItem: jest.fn(),
        onDeleteHistoryItem: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }),
    });

    mockNotificationService = createFakePartial<NotificationService>({
      notify: jest.fn(),
    });

    mockUpdateCallback = jest.fn();

    controller = new TUIController(
      mockLogger,
      mockErrorHandler,
      mockSecretRedactor,
      mockInitService,
      mockCliInput,
      mockRuntimeContext,
      mockAiContextManager,
      mockUpdateChecker,
      mockSlashCommandService,
      mockExitHandler,
      mockSessionManager,
      mockCredentialProvider,
      mockMcpStatusController,
      mockMcpApprovalController,
      mockModelManager,
      [],
      mockToolApprovalHandler,
      mockPermissionModeService,
      mockTerminalProgress,
      mockAgentSkillsResolver,
      mockPromptHistoryController,
      mockDiagnosticsReporter,
      mockNotificationService,
    );
  });

  describe('onSubmit', () => {
    describe('when a message contains secrets', () => {
      const originalPrompt = 'deploy with API_KEY=secret123';
      const redactedPrompt = 'deploy with API_KEY=[REDACTED]';

      let mockSession: Session;
      let streamCompletePromise: Promise<void>;
      let resolveStreamComplete: () => void;

      beforeEach(async () => {
        streamCompletePromise = new Promise<void>((resolve) => {
          resolveStreamComplete = resolve;
        });

        jest
          .mocked(mockSecretRedactor.redactSecrets)
          .mockImplementation((text) =>
            text === originalPrompt ? redactedPrompt : (text as string),
          );

        const sessionElements: ChatElement[] = [];
        mockSession = createFakePartial<Session>({
          sendMessageStream: jest.fn(async function* () {
            yield* [];
            resolveStreamComplete();
          }),
          addUserMessageAndStartLoading: jest.fn((content: string) => {
            sessionElements.push({
              id: 'user-msg-1',
              type: 'message',
              role: 'user',
              content,
              timestamp: Date.now(),
              isComplete: true,
            });
          }),
          get elements() {
            return sessionElements;
          },
          isLoading: false,
        });

        jest.mocked(mockSessionManager.createSession).mockResolvedValue({
          session: mockSession,
          sessionDetails: {},
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

        await controller.initialize(mockUpdateCallback);

        const callbacks = controller.getCallbacks();
        await callbacks.onSubmit(originalPrompt);

        await streamCompletePromise;
      });

      it('should send redacted prompt to session', () => {
        expect(mockSession.sendMessageStream).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: redactedPrompt }),
        );
      });

      it('should store the redacted prompt in app state elements', () => {
        const lastCall = mockUpdateCallback.mock.calls.at(-1);
        const userMessageElement = lastCall?.[0]?.elements.find(
          (el): el is Message => el.type === 'message' && el.role === 'user',
        );

        expect(userMessageElement).toBeDefined();
        expect(userMessageElement?.content).toBe(redactedPrompt);
        expect(userMessageElement?.content).not.toContain('secret123');
      });
    });

    describe('when agent mode is selected', () => {
      let mockSession: Session;
      let streamCompletePromise: Promise<void>;
      let resolveStreamComplete: () => void;

      beforeEach(async () => {
        streamCompletePromise = new Promise<void>((resolve) => {
          resolveStreamComplete = resolve;
        });

        const sessionElements: ChatElement[] = [];
        mockSession = createFakePartial<Session>({
          sendMessageStream: jest.fn(async function* () {
            yield* [];
            resolveStreamComplete();
          }),
          addUserMessageAndStartLoading: jest.fn((content: string) => {
            sessionElements.push({
              id: 'user-msg-1',
              type: 'message',
              role: 'user',
              content,
              timestamp: Date.now(),
              isComplete: true,
            });
          }),
          get elements() {
            return sessionElements;
          },
          isLoading: false,
        });

        jest.mocked(mockSessionManager.createSession).mockResolvedValue({
          session: mockSession,
          sessionDetails: {},
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

        await controller.initialize(mockUpdateCallback);
      });

      it('should include agentMode in the send prompt action', async () => {
        const callbacks = controller.getCallbacks();
        await callbacks.onSubmit('test prompt');
        await streamCompletePromise;

        expect(mockSession.sendMessageStream).toHaveBeenCalledWith(
          expect.objectContaining({ agentMode: 'build' }),
        );
      });

      it('should include the currently selected agent mode', async () => {
        const callbacks = controller.getCallbacks();
        callbacks.onCycleAgent();
        await callbacks.onSubmit('test prompt');
        await streamCompletePromise;

        expect(mockSession.sendMessageStream).toHaveBeenCalledWith(
          expect.objectContaining({ agentMode: 'plan' }),
        );
      });
    });
  });

  describe('retry status sync', () => {
    const getLatestState = () => mockUpdateCallback.mock.calls.at(-1)?.[0];

    it('syncs retryStatus to AppState when a Retry event is yielded, then clears it', async () => {
      const retry: RetryStatus = {
        attempt: 1,
        maxAttempts: 5,
        backoffMs: 3000,
        startedAt: Date.now(),
      };

      // The fake session models the real session: retryStatus is set while the
      // Retry event is in flight and cleared once a subsequent real event
      // (here, finalization) resolves.
      let currentRetryStatus: RetryStatus | undefined;
      const sessionElements: ChatElement[] = [];
      const retrySession = createFakePartial<Session>({
        sessionId: 'retry-session-id',
        get elements() {
          return sessionElements;
        },
        isLoading: false,
        get retryStatus() {
          return currentRetryStatus;
        },
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        addUserMessageAndStartLoading: jest.fn(),
        sendMessageStream: jest.fn<Session['sendMessageStream']>(async function* () {
          currentRetryStatus = retry;
          yield {
            type: AgentEventType.Retry,
            attempt: 1,
            maxAttempts: 5,
            backoffMs: 3000,
            timestamp: 1000,
          } satisfies RetryAgentEvent;
          // A real event clears the retry status before yielding a ChatElement.
          currentRetryStatus = undefined;
          yield {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Recovered',
            timestamp: 2000,
            isComplete: true,
          } satisfies ChatElement;
        }),
      });

      jest.mocked(mockSessionManager.createSession).mockResolvedValue({
        session: retrySession,
        sessionDetails: {},
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(retrySession);

      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();
      await callbacks.onSubmit('trigger retry');

      // The retry status reached AppState at some point during the stream.
      const sawRetry = mockUpdateCallback.mock.calls.some(
        ([state]) => state.retryStatus?.attempt === 1,
      );
      expect(sawRetry).toBe(true);

      // The final AppState has the retry status cleared.
      expect(getLatestState()?.retryStatus).toBeUndefined();
    });
  });

  describe('initialize', () => {
    describe('initial state', () => {
      beforeEach(() => controller.initialize(mockUpdateCallback));

      it('should set initial state with empty elements', async () => {
        expect(mockUpdateCallback).toHaveBeenCalled();

        const state = mockUpdateCallback.mock.calls[0][0];
        expect(state.elements).toHaveLength(0);
        expect(state.isLoading).toBe(false);
      });

      it('should set default agent mode to build', async () => {
        const state = mockUpdateCallback.mock.calls[0][0];
        expect(state.selectedAgent).toBe('build');
      });

      it('should set available agents', async () => {
        const state = mockUpdateCallback.mock.calls[0][0];
        expect(state.availableAgents).toEqual(['build', 'plan']);
      });
    });

    describe('when session creation fails', () => {
      const sessionError = new Error('Failed to create session');

      beforeEach(async () => {
        jest.mocked(mockSessionManager.createSession).mockRejectedValueOnce(sessionError);
        await controller.initialize(mockUpdateCallback);
        // Wait for lazy initialization to complete
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('should handle the error', () => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'ALCOR initialization failed',
          sessionError,
        );
      });

      it('should exit with error code', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
      });
    });

    describe('when initialization returns a critical error', () => {
      beforeEach(async () => {
        jest.mocked(mockInitService.initialize).mockResolvedValue(
          createFakePartial<InitializationResult>({
            criticalError: 'some error message',
            existingSessionId: 'test-session-id',
            workspaceFolder: '/test/workspace',
            username: '@testuser',
            systemContext: [],
          }),
        );

        await controller.initialize(mockUpdateCallback);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('should exit with error code', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
      });

      it('should not create a session', () => {
        expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      });
    });

    describe('update checking', () => {
      beforeEach(async () => jest.useFakeTimers());
      afterEach(async () => jest.useRealTimers());

      describe('when an update is available', () => {
        const updateInfo: UpdateInfo = {
          currentVersion: '1.0.0',
          latestVersion: '2.0.0',
          installCommand: 'npm install -g @gitlab/duo-cli',
        };
        const updateCheckResult: UpdateCheckResult = {
          type: 'needs-update',
          updateInfo,
        };

        beforeEach(async () => {
          mockRuntimeContext.cliVersion = '1.0.0';
          jest.mocked(mockUpdateChecker.checkForUpdate).mockResolvedValue(updateCheckResult);
          await controller.initialize(mockUpdateCallback);
          await jest.runAllTimersAsync();
        });

        it('should include updateInfo in state', () => {
          const lastCall = mockUpdateCallback.mock.calls.at(-1);
          expect(lastCall?.[0]?.updateCheckResult).toEqual(updateCheckResult);
        });
      });

      describe('when no update is available', () => {
        const updateCheckResult: UpdateCheckResult = {
          type: 'up-to-date',
          updateInfo: {
            currentVersion: '2.0.0',
            latestVersion: '2.0.0',
            installCommand: 'npm install -g @gitlab/duo-cli',
          },
        };

        beforeEach(async () => {
          jest.mocked(mockUpdateChecker.checkForUpdate).mockResolvedValue(updateCheckResult);
          await controller.initialize(mockUpdateCallback);
          await jest.runAllTimersAsync();
        });

        it('should set up-to-date updateCheckResult in state', () => {
          const lastCall = mockUpdateCallback.mock.calls.at(-1);
          expect(lastCall?.[0]?.updateCheckResult).toEqual(updateCheckResult);
        });
      });

      describe('when update check fails with error', () => {
        const updateError = new Error('test');
        const updateCheckResult: UpdateCheckResult = { type: 'error', error: updateError };

        beforeEach(async () => {
          jest.mocked(mockUpdateChecker.checkForUpdate).mockResolvedValue(updateCheckResult);
          await controller.initialize(mockUpdateCallback);
          await jest.runAllTimersAsync();
        });

        it('should set error updateCheckResult in state', () => {
          const lastCall = mockUpdateCallback.mock.calls.at(-1);
          expect(lastCall?.[0]?.updateCheckResult).toEqual(updateCheckResult);
        });
      });
    });

    describe('session change subscription', () => {
      beforeEach(async () => {
        await controller.initialize(mockUpdateCallback);
      });

      it('subscribes to onActiveSessionChanged during initialization', () => {
        expect(mockSessionManager.onActiveSessionChanged).toHaveBeenCalledWith(
          expect.any(Function),
        );
      });

      describe('when the active session changes', () => {
        const buildPendingApprovalTool = (id = 'tool-1'): ToolCall => ({
          id,
          type: 'tool',
          name: 'run_command',
          input: { tool: 'run_command', command: 'ls' },
          state: { type: 'approval_request', content: '', availableScopes: ['once'] },
          timestamp: Date.now(),
        });

        const fireActiveSessionChanged = () => {
          const callback = jest.mocked(mockSessionManager.onActiveSessionChanged).mock
            .calls[0][0] as () => void;
          callback();
        };

        const setActiveSessionElements = (elements: ChatElement[]) => {
          const session = createFakePartial<Session>({
            sessionId: 'rehydrated-session-id',
            elements,
            isLoading: false,
          });
          jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);
        };

        beforeEach(() => {
          // Simulate the real handler tracking which tool it is prompting for, so
          // the "already prompting" guard can be exercised end-to-end.
          let promptedToolId: string | undefined;
          jest
            .mocked(mockToolApprovalHandler.presentApprovalChoices)
            .mockImplementation((_api, toolCalls) => {
              promptedToolId = toolCalls[0]?.id;
            });
          jest
            .mocked(mockToolApprovalHandler.isPromptingFor)
            .mockImplementation((_state, toolId) => promptedToolId === toolId);
        });

        it('re-presents the approval prompt when the last element is a pending approval', () => {
          const toolCall = buildPendingApprovalTool();
          setActiveSessionElements([toolCall]);

          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).toHaveBeenCalledWith(
            expect.objectContaining({
              mutateState: expect.any(Function),
              sendToolApproval: expect.any(Function),
            }),
            [toolCall],
            expect.any(String),
          );
        });

        it('does not re-present the approval prompt when there are no pending approvals', () => {
          setActiveSessionElements([
            {
              id: 'msg-1',
              type: 'message',
              role: 'assistant',
              content: 'hello',
              timestamp: Date.now(),
              isComplete: true,
            },
          ]);

          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).not.toHaveBeenCalled();
        });

        it('does not re-present the approval prompt when the pending approval is not the last element', () => {
          const toolCall = buildPendingApprovalTool();
          setActiveSessionElements([
            toolCall,
            {
              id: 'msg-1',
              type: 'message',
              role: 'assistant',
              content: 'follow-up',
              timestamp: Date.now(),
              isComplete: true,
            },
          ]);

          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).not.toHaveBeenCalled();
        });

        it('does not re-present the approval prompt when the last tool is in a non-approval state', () => {
          setActiveSessionElements([
            {
              id: 'tool-1',
              type: 'tool',
              name: 'run_command',
              input: { tool: 'run_command', command: 'ls' },
              state: { type: 'success', output: '' },
              timestamp: Date.now(),
            },
          ]);

          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).not.toHaveBeenCalled();
        });

        it('does nothing when there is no active session', () => {
          jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(undefined);

          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).not.toHaveBeenCalled();
        });

        it('does not re-prompt if already prompting for the same tool (double-fire safe)', () => {
          // SessionManager fires onActiveSessionChanged twice during resume
          // (once before rehydration, once after). After the first prompt is
          // shown the input state holds a CHOICE for this tool; a second fire
          // must not re-prompt (would clobber any in-progress rejection input).
          const toolCall = buildPendingApprovalTool();
          setActiveSessionElements([toolCall]);

          fireActiveSessionChanged();
          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).toHaveBeenCalledTimes(1);
        });

        it('prompts again if the pending approval is for a different tool', () => {
          // E.g. user switches to a different session via /sessions that also
          // has a pending approval.
          const firstTool = buildPendingApprovalTool('tool-1');
          setActiveSessionElements([firstTool]);
          fireActiveSessionChanged();

          const secondTool = buildPendingApprovalTool('tool-2');
          setActiveSessionElements([secondTool]);
          fireActiveSessionChanged();

          expect(mockToolApprovalHandler.presentApprovalChoices).toHaveBeenCalledTimes(2);
          expect(mockToolApprovalHandler.presentApprovalChoices).toHaveBeenLastCalledWith(
            expect.anything(),
            [secondTool],
            expect.any(String),
          );
        });
      });
    });

    describe('MCP status', () => {
      beforeEach(async () => {
        await controller.initialize(mockUpdateCallback);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('should subscribe McpStatusController during initialization', () => {
        expect(mockMcpStatusController.subscribe).toHaveBeenCalledWith(
          expect.objectContaining({
            mutateState: expect.any(Function),
            showError: expect.any(Function),
            sendPrompt: expect.any(Function),
          }),
        );
      });

      it('should subscribe McpApprovalController during initialization', () => {
        expect(mockMcpApprovalController.subscribe).toHaveBeenCalledWith(
          expect.objectContaining({
            mutateState: expect.any(Function),
          }),
        );
      });

      it('should wait for pending MCP approvals before subscribing status', () => {
        expect(mockMcpApprovalController.waitForPendingApprovals).toHaveBeenCalled();
      });
    });

    describe('prompt history', () => {
      beforeEach(async () => {
        await controller.initialize(mockUpdateCallback);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('loads prompt history with the current working directory during initialization', () => {
        expect(mockPromptHistoryController.load).toHaveBeenCalledWith(mockCliInput.cwd);
      });
    });
  });

  describe('initialization', () => {
    describe('when sending a prompt before initialization completes', () => {
      let callbacks: AppCallbacks;
      let mockSession: Session;
      let initializationComplete = false;
      let streamStarted = false;

      beforeEach(async () => {
        // Mock initialization to take some time
        jest.mocked(mockInitService.initialize).mockImplementation(async () => {
          await new Promise((resolve) => {
            setTimeout(() => {
              initializationComplete = true;
              resolve(undefined);
            }, 100);
          });
          return createFakePartial<InitializationResult>({
            existingSessionId: 'test-session-id',
            workspaceFolder: '/test/workspace',
            username: '@testuser',
            systemContext: [],
          });
        });

        mockSession = createFakePartial<Session>({
          sessionId: 'test-session-id',
          elements: [],
          isLoading: false,
          preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
          sendMessageStream: jest.fn(async function* () {
            streamStarted = true;
            yield* [];
          }),
          addUserMessageAndStartLoading: jest.fn(),
        });

        jest.mocked(mockSessionManager.createSession).mockResolvedValue({
          session: mockSession,
          sessionDetails: {},
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

        await controller.initialize(mockUpdateCallback);
        callbacks = controller.getCallbacks();
      });

      it('should wait for initialization to complete before starting stream', async () => {
        // Submit a prompt immediately after initialization starts
        const submitPromise = callbacks.onSubmit('test prompt');

        // Verify stream hasn't started yet
        expect(streamStarted).toBe(false);
        expect(initializationComplete).toBe(false);

        // Wait for the submit to complete
        await submitPromise;

        // Verify initialization completed before stream started
        expect(initializationComplete).toBe(true);
        expect(streamStarted).toBe(true);
      });
    });
  });

  describe('agent mode cycling', () => {
    describe('when onCycleAgent is called', () => {
      let callbacks: AppCallbacks;

      beforeEach(async () => {
        await controller.initialize(mockUpdateCallback);
        callbacks = controller.getCallbacks();
      });

      it('should cycle from build to plan', () => {
        callbacks.onCycleAgent();

        const lastCall = mockUpdateCallback.mock.calls.at(-1);
        expect(lastCall?.[0]?.selectedAgent).toBe('plan');
      });

      it('should cycle from plan back to build', () => {
        callbacks.onCycleAgent();
        callbacks.onCycleAgent();

        const lastCall = mockUpdateCallback.mock.calls.at(-1);
        expect(lastCall?.[0]?.selectedAgent).toBe('build');
      });
    });
  });

  describe('slash command handling', () => {
    describe('when a slash command contains secrets', () => {
      const originalPrompt = '/new --token=secret123';
      const redactedPrompt = '/new --token=[REDACTED]';

      beforeEach(async () => {
        jest
          .mocked(mockSecretRedactor.redactSecrets)
          .mockImplementation((text) =>
            text === originalPrompt ? redactedPrompt : (text as string),
          );

        jest.mocked(mockSlashCommandService.isCommand).mockImplementation((input) => {
          return input.startsWith('/');
        });

        await controller.initialize(mockUpdateCallback);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('should add redacted prompt to history', async () => {
        const callbacks = controller.getCallbacks();
        await callbacks.onSubmit(originalPrompt);

        expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledWith(originalPrompt, 'user-input');
      });
    });

    describe('when a response is streaming', () => {
      let callbacks: AppCallbacks;
      let resolveStream: () => void;

      beforeEach(async () => {
        const streamGate = new Promise<void>((resolve) => {
          resolveStream = resolve;
        });

        const streamingSession = createFakePartial<Session>({
          sessionId: 'streaming-session-id',
          elements: [],
          isLoading: true,
          addUserMessageAndStartLoading: jest.fn(),
          sendMessageStream: jest.fn(async function* () {
            // Block so the controller stays in the loading state while we
            // attempt to submit a slash command.
            await streamGate;
            yield* [];
          }),
        });

        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(streamingSession);
        jest
          .mocked(mockSlashCommandService.isCommand)
          .mockImplementation((input) => input.startsWith('/'));

        await controller.initialize(mockUpdateCallback);
        await new Promise(process.nextTick);
        callbacks = controller.getCallbacks();

        doNotAwait(callbacks.onSubmit('a regular prompt'));
        await new Promise(process.nextTick);
      });

      afterEach(() => {
        resolveStream();
      });

      it('does not execute slash commands while loading', async () => {
        await callbacks.onSubmit('/help');

        expect(mockSlashCommandService.execute).not.toHaveBeenCalled();
      });
    });

    describe('/new', () => {
      let callbacks: AppCallbacks;
      let initialSession: Session;
      let initialElements: ChatElement[];

      const getLatestState = () => mockUpdateCallback.mock.calls.at(-1)?.[0];

      beforeEach(async () => {
        initialElements = [];
        initialSession = createFakePartial<Session>({
          sessionId: 'initial-session-id',
          get elements() {
            return initialElements;
          },
          isLoading: false,
          preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
          cancelStream: jest.fn(),
          sendMessageStream: jest.fn(async function* () {
            yield* [];
          }),
          addUserMessageAndStartLoading: jest.fn(),
          addError: jest.fn((message: string) => {
            const errorMessage: ErrorMessage = {
              id: `error-${Date.now()}`,
              type: 'error',
              error: message,
              timestamp: Date.now(),
            };
            initialElements.push(errorMessage);
            return errorMessage;
          }),
        });

        jest.mocked(mockSessionManager.createSession).mockResolvedValue({
          session: initialSession,
          sessionDetails: {},
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(initialSession);

        jest.mocked(mockSlashCommandService.isCommand).mockImplementation((input) => {
          return input === '/new';
        });

        await controller.initialize(mockUpdateCallback);
        await new Promise(process.nextTick);
        callbacks = controller.getCallbacks();
      });

      describe('when session creation succeeds', () => {
        let newSession: Session;

        beforeEach(async () => {
          const newSessionElements: ChatElement[] = [];
          newSession = createFakePartial<Session>({
            sessionId: 'new-session-id',
            get elements() {
              return newSessionElements;
            },
            isLoading: false,
            sendMessageStream: jest.fn(async function* () {
              yield* [];
            }),
            addUserMessageAndStartLoading: jest.fn(),
          });

          jest.mocked(mockSessionManager.createSession).mockResolvedValue({
            session: newSession,
            sessionDetails: {},
          });
          jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(newSession);

          await callbacks.onSubmit('/new');
        });

        it('creates a new session via SessionManager', () => {
          expect(mockSessionManager.createSession).toHaveBeenCalled();
        });

        it('clears the elements for the new session', () => {
          const state = getLatestState();
          expect(state?.elements).toEqual([]);
        });

        it('is not loading after session creation', () => {
          const state = getLatestState();
          expect(state?.isLoading).toBe(false);
        });
      });

      describe('when the current session is loading', () => {
        let newSession: Session;
        let loadingSession: Session;

        beforeEach(async () => {
          loadingSession = createFakePartial<Session>({
            ...initialSession,
            isLoading: true,
            cancelStream: jest.fn(),
          });

          jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(loadingSession);

          newSession = createFakePartial<Session>({
            sessionId: 'new-session-id',
            elements: [],
            isLoading: false,
          });

          jest.mocked(mockSessionManager.createSession).mockResolvedValue({
            session: newSession,
            sessionDetails: {},
          });

          // Mock the handler to simulate the real handler's behavior
          const newSessionHandler = createFakePartial<SlashCommandHandler>({
            command: {
              name: '/new',
              description: 'Start a new chat session',
              action: 'new_session',
            },
            execute: jest.fn(async () => {
              const activeSession = mockSessionManager.getActiveSession();
              if (activeSession?.isLoading) {
                activeSession.cancelStream();
              }
              await mockSessionManager.createSession();
            }),
          });

          jest.mocked(mockSlashCommandService.execute).mockImplementation(async (_prompt, api) => {
            await newSessionHandler.execute(api);
          });

          await callbacks.onSubmit('/new');
        });

        it('cancels the current session stream', () => {
          expect(loadingSession.cancelStream).toHaveBeenCalled();
        });
      });

      describe('when session creation fails', () => {
        beforeEach(async () => {
          // Mock createSession to fail
          jest
            .mocked(mockSessionManager.createSession)
            .mockRejectedValueOnce(new Error('connection failed'));

          // Ensure getActiveSession still returns the initial session after failure
          jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(initialSession);

          // Mock the handler to simulate the real handler's error handling behavior
          const failingHandler = createFakePartial<SlashCommandHandler>({
            command: {
              name: '/new',
              description: 'Start a new chat session',
              action: 'new_session',
            },
            execute: jest.fn(async (api: ControllerApi) => {
              try {
                await mockSessionManager.createSession();
              } catch {
                api.showError('Failed to create new session. Please try again.');
              }
            }),
          });

          jest.mocked(mockSlashCommandService.execute).mockImplementation(async (_prompt, api) => {
            await failingHandler.execute(api);
          });

          await callbacks.onSubmit('/new');
          // Wait for async error handling to complete
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });

        it('shows the error in the synced state', () => {
          // Check that addError was called
          expect(initialSession.addError).toHaveBeenCalledWith(
            'Failed to create new session. Please try again.',
          );

          // Check that the error was added to initialElements
          expect(initialElements.length).toBeGreaterThan(0);

          const state = getLatestState();
          const errorElement = state?.elements.find(
            (el): el is ErrorMessage => el.type === 'error',
          );

          expect(errorElement).toBeDefined();
          expect(errorElement?.error).toContain('Failed to create new session');
        });

        it('does not change the active session', () => {
          expect(mockSessionManager.getActiveSession()).toBe(initialSession);
        });
      });
    });
  });

  describe('getCallbacks', () => {
    describe('getCommandComponentRegistry', () => {
      it('delegates to slashCommandService.buildComponentRegistry', () => {
        const mockRegistry = new Map();
        jest.mocked(mockSlashCommandService.buildComponentRegistry).mockReturnValue(mockRegistry);

        const result = controller.getCommandComponentRegistry();

        expect(mockSlashCommandService.buildComponentRegistry).toHaveBeenCalled();
        expect(result).toBe(mockRegistry);
      });
    });

    describe('ControllerApi.getCommands', () => {
      it('delegates to the slash command service', async () => {
        const commands = [
          { name: '/help', description: 'Show help', action: 'help' },
          { name: '/new', description: 'New session', action: 'new_session' },
        ];
        jest.mocked(mockSlashCommandService.getCommands).mockReturnValue(commands);

        await controller.initialize(mockUpdateCallback);
        await new Promise(process.nextTick);

        // Execute /help to invoke #createControllerApi and getCommands
        jest.mocked(mockSlashCommandService.isCommand).mockReturnValue(true);
        jest.mocked(mockSlashCommandService.execute).mockImplementation(async (_prompt, api) => {
          const result = api.getCommands();
          expect(result).toBe(commands);
        });

        const callbacks = controller.getCallbacks();
        await callbacks.onSubmit('/help');
      });
    });

    describe('prompt history for slash commands', () => {
      it('records the raw slash-command input before dispatch (visible to up-arrow while the command is still running)', async () => {
        await controller.initialize(mockUpdateCallback);
        await new Promise(process.nextTick);

        // Snapshot addToHistory calls at the moment execute starts. If
        // history was recorded first, the /compact input is already there.
        let historyRecordedBeforeExecute = false;
        jest.mocked(mockSlashCommandService.isCommand).mockReturnValue(true);
        jest.mocked(mockSlashCommandService.execute).mockImplementation(async () => {
          historyRecordedBeforeExecute = jest
            .mocked(mockPromptHistoryController.addToHistory)
            .mock.calls.some(([prompt]) => prompt === '/compact');
        });

        await controller.getCallbacks().onSubmit('/compact');

        expect(historyRecordedBeforeExecute).toBe(true);
      });

      it('records history even when execute throws (recallable to edit-and-retry after a failed slash command)', async () => {
        // The error path calls #showError which touches session.addError, so
        // the default mock session (which doesn't stub it) needs the method.
        const session = createFakePartial<Session>({
          sessionId: 'test-session-id',
          elements: [],
          isLoading: false,
          preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
          addError: jest.fn<Session['addError']>(),
        });
        jest.mocked(mockSessionManager.createSession).mockResolvedValue({
          session,
          sessionDetails: {},
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);

        await controller.initialize(mockUpdateCallback);
        await new Promise(process.nextTick);

        jest.mocked(mockSlashCommandService.isCommand).mockReturnValue(true);
        jest
          .mocked(mockSlashCommandService.execute)
          .mockRejectedValue(new Error('simulated command failure'));

        await controller.getCallbacks().onSubmit('/compact');

        // Even though execute threw and we went through the error path, the
        // input is in history so the user can up-arrow to edit and retry.
        expect(mockPromptHistoryController.addToHistory).toHaveBeenCalledWith('/compact');
        // The user still sees the "failed to execute" surface — history
        // recording is transparent to that flow.
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'Failed to execute slash command',
          expect.any(Error),
        );
      });
    });
  });

  describe('skill load warnings', () => {
    let mockSession: Session;
    let sessionElements: ChatElement[];

    beforeEach(() => {
      sessionElements = [];
      mockSession = createFakePartial<Session>({
        sessionId: 'test-session-id',
        get elements() {
          return sessionElements;
        },
        isLoading: false,
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        sendMessageStream: jest.fn(async function* () {
          yield* [];
        }),
        addUserMessageAndStartLoading: jest.fn(),
        addInfo: jest.fn((message: string) => {
          const infoMessage = {
            id: `info-${Date.now()}`,
            type: 'info' as const,
            message,
            timestamp: Date.now(),
          };
          sessionElements.push(infoMessage);
          return infoMessage;
        }),
      });

      jest.mocked(mockSessionManager.createSession).mockResolvedValue({
        session: mockSession,
        sessionDetails: {},
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);
    });

    it('surfaces each warning with its path and reason', async () => {
      jest.mocked(mockAgentSkillsResolver.getSkillSlashCommands).mockResolvedValue({
        commands: [],
        warnings: [
          {
            path: '/workspace/.agents/skills/bad-skill/SKILL.md',
            reason: 'has no valid frontmatter',
          },
          { path: '/workspace/.agents/skills/other/SKILL.md', reason: 'is missing frontmatter' },
        ],
      });

      await controller.initialize(mockUpdateCallback);
      await new Promise(process.nextTick);

      expect(mockSession.addInfo).toHaveBeenCalledTimes(2);
      expect(mockSession.addInfo).toHaveBeenCalledWith(
        expect.stringContaining('/workspace/.agents/skills/bad-skill/SKILL.md'),
      );
      expect(mockSession.addInfo).toHaveBeenCalledWith(
        expect.stringContaining('has no valid frontmatter'),
      );
    });

    it('does not call addInfo when there are no warnings', async () => {
      jest
        .mocked(mockAgentSkillsResolver.getSkillSlashCommands)
        .mockResolvedValue({ commands: [], warnings: [] });

      await controller.initialize(mockUpdateCallback);
      await new Promise(process.nextTick);

      expect(mockSession.addInfo).not.toHaveBeenCalled();
    });
  });

  describe('system notifications', () => {
    const errorElement: ErrorMessage = {
      id: 'err-1',
      type: 'error',
      error: 'something failed',
      timestamp: 1000,
    };

    const pendingApprovalTool: ToolCall = {
      id: 'tool-1',
      type: 'tool',
      name: 'run_command',
      input: { tool: 'run_command', command: 'ls' },
      state: { type: 'approval_request', content: '', availableScopes: ['once'] },
      timestamp: 1000,
    };

    const completeMessage: Message = {
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: 'done',
      timestamp: 1000,
      isComplete: true,
    };

    // Wires up the active session so a turn streams the given elements and then ends,
    // which is what drives #notifyTurnEnd.
    const setupSessionStream = (elements: ChatElement[]) => {
      const sessionElements: ChatElement[] = [];
      const session = createFakePartial<Session>({
        sessionId: 'test-session-id',
        get elements() {
          return sessionElements;
        },
        isLoading: false,
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        sendMessageStream: jest.fn(async function* () {
          yield* elements;
        }),
        addUserMessageAndStartLoading: jest.fn(),
      });

      jest.mocked(mockSessionManager.createSession).mockResolvedValue({
        session,
        sessionDetails: {},
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);
    };

    it('notifies with the error event when the turn ends in an error', async () => {
      setupSessionStream([errorElement]);
      await controller.initialize(mockUpdateCallback);

      await controller.getCallbacks().onSubmit('do it');

      expect(mockNotificationService.notify).toHaveBeenCalledWith('error', { focused: true });
    });

    it('notifies with the approval event when the turn ends with a pending approval', async () => {
      setupSessionStream([pendingApprovalTool]);
      await controller.initialize(mockUpdateCallback);

      await controller.getCallbacks().onSubmit('do it');

      expect(mockNotificationService.notify).toHaveBeenCalledWith('approval', { focused: true });
    });

    it('notifies with the response_ready event when the turn ends normally', async () => {
      setupSessionStream([completeMessage]);
      await controller.initialize(mockUpdateCallback);

      await controller.getCallbacks().onSubmit('do it');

      expect(mockNotificationService.notify).toHaveBeenCalledWith('response_ready', {
        focused: true,
      });
    });

    // Regression guard: the controller defaults #terminalFocused to true because DEC mode
    // ?1004 does not emit a focus-in for an already-focused terminal. A turn that ends before
    // any focus event must therefore report focused: true.
    it('reports focused context when no focus event has been received', async () => {
      setupSessionStream([completeMessage]);
      await controller.initialize(mockUpdateCallback);

      await controller.getCallbacks().onSubmit('do it');

      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        'response_ready',
        expect.objectContaining({ focused: true }),
      );
    });

    it('reports unfocused context after a focus-out event', async () => {
      setupSessionStream([completeMessage]);
      await controller.initialize(mockUpdateCallback);

      const callbacks = controller.getCallbacks();
      callbacks.onFocusChange?.(false);
      await callbacks.onSubmit('do it');

      expect(mockNotificationService.notify).toHaveBeenCalledWith('response_ready', {
        focused: false,
      });
    });
  });

  describe('queue-and-send (prompt submitted mid-turn)', () => {
    const getLatestState = (): AppState | undefined => mockUpdateCallback.mock.calls.at(-1)?.[0];

    const assistantMessage: Message = {
      id: 'assistant-1',
      type: 'message',
      role: 'assistant',
      content: 'done',
      timestamp: 1000,
      isComplete: true,
    };

    const pendingApprovalTool: ToolCall = {
      id: 'tool-q1',
      type: 'tool',
      name: 'run_command',
      input: { tool: 'run_command', command: 'ls' },
      state: { type: 'approval_request', content: '', availableScopes: ['once'] },
      timestamp: 1000,
    };

    /**
     * Wires up a session whose first stream blocks on a gate, so a second prompt
     * can be submitted while the turn is still in flight. Later streams complete
     * immediately. Returns helpers to open the gate and inspect sent prompts.
     */
    const setupGatedSession = (firstTurnElements: ChatElement[] = [assistantMessage]) => {
      const sessionElements: ChatElement[] = [];
      const sentPrompts: string[] = [];
      let callCount = 0;
      // The controller syncs AppState.isLoading from session.isLoading, which gates queue-vs-send.
      let loading = false;
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });

      const session = createFakePartial<Session>({
        sessionId: 'queue-session-id',
        get elements() {
          return sessionElements;
        },
        get isLoading() {
          return loading;
        },
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        addUserMessageAndStartLoading: jest.fn(() => {
          loading = true;
        }),
        sendMessageStream: jest.fn<Session['sendMessageStream']>(async function* (action) {
          sentPrompts.push((action as { prompt: string }).prompt);
          callCount += 1;
          try {
            if (callCount === 1) {
              await gate;
              yield* firstTurnElements;
            } else {
              yield* [assistantMessage];
            }
          } finally {
            loading = false;
          }
        }),
      });

      jest.mocked(mockSessionManager.createSession).mockResolvedValue({
        session,
        sessionDetails: {},
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);

      return { session, sentPrompts, openGate };
    };

    const flushMicrotasks = () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

    it('queues a prompt submitted while loading instead of sending it immediately', async () => {
      const { session, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();

      // Arrives while the first turn is still streaming, so it's queued, not sent.
      await callbacks.onSubmit('queued prompt');

      expect(session.sendMessageStream).toHaveBeenCalledTimes(1);
      expect(getLatestState()?.queuedPrompt).toMatchObject({ prompt: 'queued prompt' });

      openGate();
      await firstTurn;
    });

    it('flushes the queued prompt once the turn completes', async () => {
      const { session, sentPrompts, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('queued prompt');

      openGate();
      await firstTurn;
      await flushMicrotasks();

      expect(session.sendMessageStream).toHaveBeenCalledTimes(2);
      expect(sentPrompts).toEqual(['first prompt', 'queued prompt']);
      expect(getLatestState()?.queuedPrompt).toBeUndefined();
    });

    it('overwrites the queued slot when the user submits again (edit-the-draft)', async () => {
      const { sentPrompts, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('first draft');
      await callbacks.onSubmit('revised draft');

      expect(getLatestState()?.queuedPrompt).toMatchObject({ prompt: 'revised draft' });

      openGate();
      await firstTurn;
      await flushMicrotasks();

      expect(sentPrompts).toEqual(['first prompt', 'revised draft']);
    });

    it('holds the queued prompt when the turn ends on a pending tool approval', async () => {
      const { session, openGate } = setupGatedSession([pendingApprovalTool]);
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('queued prompt');

      openGate();
      await firstTurn;
      await flushMicrotasks();

      // The turn paused on an approval, so the queued prompt is NOT flushed yet.
      expect(session.sendMessageStream).toHaveBeenCalledTimes(1);
      expect(getLatestState()?.queuedPrompt).toMatchObject({ prompt: 'queued prompt' });
    });

    it('restores the queued text to the input box when onCancelQueuedPrompt is called', async () => {
      const { session, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('queued prompt');
      expect(getLatestState()?.queuedPrompt).toMatchObject({ prompt: 'queued prompt' });

      callbacks.onCancelQueuedPrompt();

      // The queue is cleared and the draft returns to the input for editing/resubmit.
      const state = getLatestState();
      expect(state?.queuedPrompt).toBeUndefined();
      expect(state?.input).toMatchObject({ inputType: 'text', lines: ['queued prompt'] });

      openGate();
      await firstTurn;
      await flushMicrotasks();

      // Nothing was auto-flushed; the restored text awaits a fresh submission.
      expect(session.sendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('preserves a multi-line queued prompt across the lines array on cancel', async () => {
      const { openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('line one\nline two');

      callbacks.onCancelQueuedPrompt();

      expect(getLatestState()?.input).toMatchObject({
        inputType: 'text',
        lines: ['line one', 'line two'],
        // Cursor lands at end of the last line so appending continues naturally.
        cursorLine: 1,
        cursorColumn: 'line two'.length,
      });

      openGate();
      await firstTurn;
    });

    it('locks the agent mode at queue time so cycling agents before flush is harmless', async () => {
      const { session, sentPrompts, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      // The default selectedAgent is 'build'. Submit + queue under build.
      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('queued under build');

      // Cycle to a different agent before the turn ends.
      callbacks.onCycleAgent();
      const newAgent = getLatestState()?.selectedAgent;
      expect(newAgent).not.toBe('build');

      openGate();
      await firstTurn;
      await flushMicrotasks();

      expect(sentPrompts).toEqual(['first prompt', 'queued under build']);
      // The flushed action carries the locked agentMode, not the current one.
      const flushCall = jest.mocked(session.sendMessageStream).mock.calls.at(-1);
      expect((flushCall?.[0] as { agentMode?: string }).agentMode).toBe('build');
      // The displayed user message also uses the queued agentMode, not the current one.
      const addMsgCall = jest.mocked(session.addUserMessageAndStartLoading).mock.calls.at(-1);
      expect(addMsgCall?.[1]).toBe('build');
    });

    it('restores the queued prompt if flush throws so the user can retry', async () => {
      // Build a gated session inline so we can preserve the first-turn
      // gating behaviour (required for queueing) AND make the second turn
      // (the flushed one) throw. setupGatedSession's implementation
      // replaces the mock in a way that's hard to compose with
      // mockImplementationOnce, so we reproduce it here.
      let loading = false;
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      let callCount = 0;
      const session = createFakePartial<Session>({
        sessionId: 'queue-session-id',
        get elements() {
          return [];
        },
        get isLoading() {
          return loading;
        },
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        addUserMessageAndStartLoading: jest.fn(() => {
          loading = true;
        }),
        // eslint-disable-next-line require-yield
        sendMessageStream: jest.fn<Session['sendMessageStream']>(async function* () {
          callCount += 1;
          try {
            if (callCount === 1) {
              await gate;
              // First turn ends cleanly with no elements.
              return;
            }
            // Second turn (the flushed one) fails — simulates any stream
            // error propagating out of #startStream through the flush.
            throw new Error('flush stream failed');
          } finally {
            loading = false;
          }
        }),
      });

      jest.mocked(mockSessionManager.createSession).mockResolvedValue({
        session,
        sessionDetails: {},
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);

      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('queued prompt');

      openGate();
      // The flush error belongs to the queued submission, not the first turn, so
      // it is swallowed and logged rather than rejecting the first turn's promise.
      await expect(firstTurn).resolves.toBeUndefined();
      await flushMicrotasks();

      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        'Failed to flush queued prompt',
        expect.any(Error),
      );
      // The queued slot is restored so the user can see it and resubmit.
      expect(getLatestState()?.queuedPrompt).toMatchObject({ prompt: 'queued prompt' });
    });

    it('routes a queued slash command through slashCommandService on flush', async () => {
      const { session, openGate } = setupGatedSession();
      jest
        .mocked(mockSlashCommandService.isCommand)
        .mockImplementation((input) => input.startsWith('/'));

      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('/help');

      // Mid-turn submission must not have executed the command yet.
      expect(mockSlashCommandService.execute).not.toHaveBeenCalled();

      openGate();
      await firstTurn;
      await flushMicrotasks();

      // On flush, the queued prompt re-enters #handleSubmitInput which dispatches
      // to the slash-command path — not to sendMessageStream.
      expect(mockSlashCommandService.execute).toHaveBeenCalledTimes(1);
      expect(mockSlashCommandService.execute).toHaveBeenCalledWith('/help', expect.anything());
      expect(session.sendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('drops a whitespace-only mid-turn submission instead of queueing it', async () => {
      const { session, openGate } = setupGatedSession();
      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      const firstTurn = callbacks.onSubmit('first prompt');
      await flushMicrotasks();
      await callbacks.onSubmit('   ');

      expect(getLatestState()?.queuedPrompt).toBeUndefined();

      openGate();
      await firstTurn;
      await flushMicrotasks();

      expect(session.sendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('displays a slash-command prompt (no agentMode) under the current agent', async () => {
      // A slash-command handler re-issues a prompt via ControllerApi.sendPrompt
      // without an agentMode; the displayed message should still carry the
      // active agent badge rather than none.
      const session = createFakePartial<Session>({
        sessionId: 'skill-session-id',
        get elements() {
          return [];
        },
        isLoading: false,
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        addUserMessageAndStartLoading: jest.fn(),

        sendMessageStream: jest.fn<Session['sendMessageStream']>(async function* () {}),
      });
      jest
        .mocked(mockSessionManager.createSession)
        .mockResolvedValue({ session, sessionDetails: {} });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(session);

      jest.mocked(mockSlashCommandService.isCommand).mockImplementation((i) => i === '/skill');
      jest
        .mocked(mockSlashCommandService.execute)
        .mockImplementation(async (_input, api) =>
          api.sendPrompt({ type: UserActionType.SendPrompt, prompt: 'Use the X skill' }),
        );

      await controller.initialize(mockUpdateCallback);
      const callbacks = controller.getCallbacks();

      await callbacks.onSubmit('/skill');
      await flushMicrotasks();

      const addMsgCall = jest.mocked(session.addUserMessageAndStartLoading).mock.calls.at(-1);
      expect(addMsgCall?.[0]).toBe('Use the X skill');
      expect(addMsgCall?.[1]).toBe('build');
    });
  });
});
