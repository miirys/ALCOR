import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { asyncGeneratorFromArray, createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { ErrorHandler } from '@gitlab-org/errors';
import type { ChatElement } from '@gitlab-org/tui';
import type { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { AgentEventType, UserActionType } from '../../backend/backend';
import type { ParsedCliInput } from '../../parse';
import type { CliInitializationService } from '../../cli_initialization_service';
import type { ExitHandler } from '../../utils/exit';
import type { Session, SessionManager } from '../../sessions';
import { TerminalProgressService } from '../../utils/terminal_progress_service';
import type { NotificationService } from '../../utils/notification_service';
import type { SlashCommandService } from '../../slash_commands';
import { RunController } from './run_controller';
import { RunResultWriter } from './run_result_writer';
import { runResultSchema } from './run_result_schema';

describe('RunController', () => {
  let controller: RunController;
  let mockLogger: TestLogger;
  let mockErrorHandler: ErrorHandler;
  let mockSecretRedactor: SecretRedactor;
  let mockInitService: CliInitializationService;
  let mockCliInput: ParsedCliInput;
  let mockExitHandler: ExitHandler;
  let mockSessionManager: SessionManager;
  let mockSession: Session;
  let mockTerminalProgress: TerminalProgressService;
  let mockSlashCommandService: SlashCommandService;
  let mockAgentSkillsResolver: AgentSkillsResolver;
  let mockNotificationService: NotificationService;

  const createController = () =>
    new RunController(
      mockLogger,
      mockErrorHandler,
      mockSecretRedactor,
      mockInitService,
      mockCliInput,
      mockExitHandler,
      mockSessionManager,
      mockTerminalProgress,
      mockSlashCommandService,
      mockAgentSkillsResolver,
      mockNotificationService,
      new RunResultWriter(mockLogger),
    );

  beforeEach(() => {
    mockExitHandler = createFakePartial<ExitHandler>({
      exit: jest.fn<ExitHandler['exit']>().mockResolvedValue(undefined as never),
    });
    mockLogger = new TestLogger();

    mockErrorHandler = createFakePartial<ErrorHandler>({
      handleError: jest.fn(),
    });

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn<SecretRedactor['redactSecrets']>().mockImplementation((text) => text),
    });

    mockSession = createFakePartial<Session>({
      preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
      sendMessageStream: jest.fn<Session['sendMessageStream']>(),
      elements: [],
    });

    mockSessionManager = createFakePartial<SessionManager>({
      createSession: jest
        .fn<SessionManager['createSession']>()
        .mockResolvedValue({ session: mockSession, sessionDetails: {} }),
      getActiveSession: jest.fn<SessionManager['getActiveSession']>().mockReturnValue(mockSession),
    });

    mockInitService = createFakePartial<CliInitializationService>({
      initialize: jest.fn<CliInitializationService['initialize']>().mockResolvedValue({
        existingSessionId: 'test-session-id',
        systemContext: [],
        username: '@testuser',
        workspaceFolder: '/test/workspace',
      }),
    });

    mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: '/test/cwd',
      command: { name: 'run', goal: 'test goal' },
    });

    mockTerminalProgress = createFakePartial<TerminalProgressService>({
      trackStream: jest
        .fn<TerminalProgressService['trackStream']>()
        .mockImplementation(async function* (stream) {
          yield* stream;
        }),
    });

    mockSlashCommandService = createFakePartial<SlashCommandService>({
      isCommand: jest.fn<SlashCommandService['isCommand']>().mockReturnValue(false),
      isDynamicCommand: jest.fn<SlashCommandService['isDynamicCommand']>().mockReturnValue(false),
      getCommands: jest.fn<SlashCommandService['getCommands']>().mockReturnValue([]),
      execute: jest.fn<SlashCommandService['execute']>().mockResolvedValue(undefined),
      registerDynamicCommands: jest.fn<SlashCommandService['registerDynamicCommands']>(),
      removeDynamicCommands: jest.fn<SlashCommandService['removeDynamicCommands']>(),
    });

    mockAgentSkillsResolver = createFakePartial<AgentSkillsResolver>({
      getSkillSlashCommands: jest
        .fn<AgentSkillsResolver['getSkillSlashCommands']>()
        .mockResolvedValue({ commands: [], warnings: [] }),
    });

    mockNotificationService = createFakePartial<NotificationService>({
      notify: jest.fn(),
    });

    controller = createController();
  });

  describe('initialize', () => {
    describe('when initialization succeeds', () => {
      beforeEach(() => controller.initialize());

      it('should initialize via init service', () => {
        expect(mockInitService.initialize).toHaveBeenCalled();
      });

      it('should create a session via session manager', () => {
        expect(mockSessionManager.createSession).toHaveBeenCalledWith(
          'test-session-id',
          expect.any(Object),
        );
      });

      it('should skip session history rehydration', () => {
        expect(mockSessionManager.createSession).toHaveBeenCalledWith('test-session-id', {
          skipHistoryRehydration: true,
        });
      });

      it('should preinitialize the session', () => {
        expect(mockSession.preinitialize).toHaveBeenCalled();
      });
    });

    describe('when initialization returns a critical error', () => {
      beforeEach(() => {
        jest.mocked(mockInitService.initialize).mockResolvedValue({
          criticalError: 'some error message',
          existingSessionId: undefined,
          systemContext: [],
          username: '@testuser',
          workspaceFolder: '/test/workspace',
        });
        return controller.initialize();
      });

      it('should log the error and exit without creating a session', () => {
        const logs = (mockLogger as TestLogger).errorLogs.map((log) => log.message ?? '');
        expect(logs.some((log) => log.includes('some error message'))).toBe(true);
        expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
        expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      });
    });

    describe('when session preinitialize fails', () => {
      beforeEach(() => {
        jest.mocked(mockSession.preinitialize).mockRejectedValue(new Error('Preinit failed'));
        return controller.initialize();
      });

      it('should not exit (preinitialize is non-critical)', () => {
        expect(mockExitHandler.exit).not.toHaveBeenCalled();
      });
    });

    describe('when initialization fails', () => {
      const initError = new Error('Backend unavailable');

      beforeEach(() => {
        jest.mocked(mockInitService.initialize).mockRejectedValue(initError);
        return controller.initialize();
      });

      it('should handle the error', () => {
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          'GitLab Duo CLI initialization failed',
          initError,
        );
      });

      it('should exit with code 1', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('skill load warnings', () => {
    const skillWarningLogs = () =>
      mockLogger.warnLogs
        .map((log) => log.message ?? '')
        .filter((msg) => msg.includes('Skill file skipped'));

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

      await controller.initialize();

      expect(skillWarningLogs()).toEqual([
        expect.stringContaining('/workspace/.agents/skills/bad-skill/SKILL.md'),
        expect.stringContaining('/workspace/.agents/skills/other/SKILL.md'),
      ]);
      expect(skillWarningLogs()[0]).toContain('has no valid frontmatter');
    });

    it('logs nothing when there are no warnings', async () => {
      jest
        .mocked(mockAgentSkillsResolver.getSkillSlashCommands)
        .mockResolvedValue({ commands: [], warnings: [] });

      await controller.initialize();

      expect(skillWarningLogs()).toHaveLength(0);
    });
  });

  describe('execute', () => {
    describe('when not initialized', () => {
      beforeEach(() => {
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(undefined);
      });

      it('should throw an error', async () => {
        await expect(controller.execute()).rejects.toThrow(
          'Controller not initialized. Call initialize() first.',
        );
      });
    });

    describe('when command is not `run`', () => {
      beforeEach(async () => {
        mockCliInput = createFakePartial<ParsedCliInput>({
          cwd: '/test/cwd',
          command: { name: 'tui' },
        });
        controller = createController();
        await controller.initialize();
      });

      it('should throw an error', async () => {
        await expect(controller.execute()).rejects.toThrow(
          'Controller not initialized. Call initialize() first.',
        );
      });
    });

    describe('when initialized with `run` command', () => {
      beforeEach(() => controller.initialize());

      it('should open the stream with the goal as the initial prompt', async () => {
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
        await controller.execute();

        expect(mockSession.sendMessageStream).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: 'test goal' }),
        );
      });

      describe('when goal contains secrets', () => {
        const originalGoal = 'deploy with API_KEY=secret123';
        const redactedGoal = 'deploy with API_KEY=[REDACTED]';

        beforeEach(async () => {
          mockCliInput.command = { name: 'run', goal: originalGoal, outputFormat: 'text' };

          jest
            .mocked(mockSecretRedactor.redactSecrets)
            .mockImplementation((text) =>
              text === originalGoal ? redactedGoal : (text as string),
            );

          jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
          await controller.execute();
        });

        it('should send redacted goal to session', () => {
          expect(mockSession.sendMessageStream).toHaveBeenCalledWith(
            expect.objectContaining({ prompt: redactedGoal }),
          );
        });
      });

      describe('when stream ends with an error event', () => {
        beforeEach(async () => {
          const elements: ChatElement[] = [
            { id: 'err1', type: 'error', error: 'Something went wrong', timestamp: 1000 },
          ];
          jest
            .mocked(mockSession.sendMessageStream)
            .mockReturnValue(asyncGeneratorFromArray(elements));
          await controller.execute();
        });

        it('should exit with code 1', () => {
          expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
        });

        it('should notify with the error event and unfocused context', () => {
          expect(mockNotificationService.notify).toHaveBeenCalledWith('error', { focused: false });
        });
      });

      describe('when stream throws an error', () => {
        const streamError = new Error('Connection lost');

        beforeEach(() => {
          // eslint-disable-next-line require-yield
          async function* throwingStream(): AsyncGenerator<ChatElement> {
            throw streamError;
          }
          jest.mocked(mockSession.sendMessageStream).mockReturnValue(throwingStream());
        });

        it('should propagate the error', async () => {
          await expect(controller.execute()).rejects.toThrow('Connection lost');
        });

        it('should not notify when the stream throws before completing', async () => {
          await expect(controller.execute()).rejects.toThrow('Connection lost');
          expect(mockNotificationService.notify).not.toHaveBeenCalled();
        });
      });

      describe('when stream completes without errors', () => {
        beforeEach(async () => {
          jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
          await controller.execute();
        });

        it('should exit with code 0', () => {
          expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
        });

        it('should notify with the response_ready event and unfocused context', () => {
          expect(mockNotificationService.notify).toHaveBeenCalledWith('response_ready', {
            focused: false,
          });
        });
      });
    });

    describe('when initialized with approval=approved', () => {
      beforeEach(async () => {
        mockCliInput = createFakePartial<ParsedCliInput>({
          cwd: '/test/cwd',
          command: {
            name: 'run',
            goal: 'do it',
            approval: 'approved',
            existingSessionId: 'sess-1',
          },
        });
        controller = createController();
        await controller.initialize();
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
        await controller.execute();
      });

      it('should send a SendToolApproval action with approved=true and scope=once', () => {
        expect(mockSession.sendMessageStream).toHaveBeenCalledWith({
          type: UserActionType.SendToolApproval,
          toolId: '',
          toolName: '',
          approved: true,
          scope: 'once',
        });
      });
    });

    describe('when initialized with approval=rejected', () => {
      beforeEach(async () => {
        mockCliInput = createFakePartial<ParsedCliInput>({
          cwd: '/test/cwd',
          command: {
            name: 'run',
            goal: 'do it',
            approval: 'rejected',
            rejectionReason: 'bad plan',
            existingSessionId: 'sess-1',
          },
        });
        controller = createController();
        await controller.initialize();
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
        await controller.execute();
      });

      it('should send a SendToolApproval action with approved=false and rejectionReason', () => {
        expect(mockSession.sendMessageStream).toHaveBeenCalledWith({
          type: UserActionType.SendToolApproval,
          toolId: '',
          toolName: '',
          approved: false,
          rejectionReason: 'bad plan',
        });
      });
    });

    describe('when initialized with approval=rejected without rejectionReason', () => {
      beforeEach(async () => {
        mockCliInput = createFakePartial<ParsedCliInput>({
          cwd: '/test/cwd',
          command: {
            name: 'run',
            goal: 'do it',
            approval: 'rejected',
            existingSessionId: 'sess-1',
          },
        });
        controller = createController();
        await controller.initialize();
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray([]));
        await controller.execute();
      });

      it('should send a SendToolApproval action with approved=false and no rejectionReason', () => {
        expect(mockSession.sendMessageStream).toHaveBeenCalledWith({
          type: UserActionType.SendToolApproval,
          toolId: '',
          toolName: '',
          approved: false,
        });
      });
    });
  });

  describe('ChatElement handling', () => {
    beforeEach(() => controller.initialize());

    describe('when receiving ToolCall elements', () => {
      describe('with loading state', () => {
        beforeEach(async () => {
          const elements: ChatElement[] = [
            {
              id: 'tool1',
              type: 'tool',
              name: 'read_file',
              input: { tool: 'read_file', filepath: '/test/file.txt' },
              state: { type: 'loading' },
              timestamp: 1000,
            },
          ];
          jest
            .mocked(mockSession.sendMessageStream)
            .mockReturnValue(asyncGeneratorFromArray(elements));
          await controller.execute();
        });

        it('should log the tool name', () => {
          const logs = (mockLogger as TestLogger).infoLogs.map((log) => log.message ?? '');
          expect(logs.some((log) => log.includes('read_file'))).toBe(true);
        });
      });

      describe('with success state', () => {
        beforeEach(async () => {
          const elements: ChatElement[] = [
            {
              id: 'tool-abc-123',
              type: 'tool',
              name: 'read_file',
              input: { tool: 'read_file', filepath: '/test/file.txt' },
              state: { type: 'success', output: 'file contents' },
              timestamp: 1000,
            },
          ];
          jest
            .mocked(mockSession.sendMessageStream)
            .mockReturnValue(asyncGeneratorFromArray(elements));
          await controller.execute();
        });

        it('should log the tool completion', () => {
          const logs = (mockLogger as TestLogger).infoLogs.map((log) => log.message ?? '');
          expect(logs.some((log) => log.includes('tool-abc-123'))).toBe(true);
        });
      });

      describe('with error state', () => {
        beforeEach(async () => {
          const elements: ChatElement[] = [
            {
              id: 'tool1',
              type: 'tool',
              name: 'read_file',
              input: { tool: 'read_file', filepath: '/test/file.txt' },
              state: { type: 'error', error: 'File not found' },
              timestamp: 1000,
            },
          ];
          jest
            .mocked(mockSession.sendMessageStream)
            .mockReturnValue(asyncGeneratorFromArray(elements));
          await controller.execute();
        });

        it('should log the tool error', () => {
          const logs = (mockLogger as TestLogger).errorLogs.map((log) => log.message ?? '');
          expect(logs.some((log) => log.includes('File not found'))).toBe(true);
        });

        it('should exit successfully (tool errors are not fatal)', () => {
          expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
        });
      });

      describe('with approval_request state', () => {
        beforeEach(async () => {
          const elements: ChatElement[] = [
            {
              id: 'tool1',
              type: 'tool',
              name: 'create_file_with_contents',
              input: {
                tool: 'create_file_with_contents',
                filepath: '/test/new.txt',
                content: 'data',
              },
              state: {
                type: 'approval_request',
                content: 'Awaiting approval',
                availableScopes: ['once'],
              },
              timestamp: 1000,
            },
          ];
          jest
            .mocked(mockSession.sendMessageStream)
            .mockReturnValue(asyncGeneratorFromArray(elements));
          await controller.execute();
        });

        it('should exit successfully (approval events are no-op in run mode)', () => {
          expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
        });
      });
    });

    describe('when receiving a Retry event', () => {
      const getInfoLogs = () => (mockLogger as TestLogger).infoLogs.map((log) => log.message ?? '');

      let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;

      beforeEach(async () => {
        stdoutSpy = jest
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);
        mockSession = createFakePartial<Session>({
          sendMessageStream: jest.fn<Session['sendMessageStream']>(),
          elements: [
            {
              id: 'msg1',
              type: 'message',
              role: 'assistant',
              content: 'Recovered',
              timestamp: 2000,
              isComplete: true,
            },
          ],
        });
        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);
        controller = createController();
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 1,
              maxAttempts: 5,
              backoffMs: 3000,
              timestamp: 1000,
            },
            {
              id: 'msg1',
              type: 'message',
              role: 'assistant',
              content: 'Recovered',
              timestamp: 2000,
              isComplete: true,
            },
          ]),
        );
        await controller.execute();
      });

      afterEach(() => stdoutSpy.mockRestore());

      it('ignores the retry event (it is never logged)', () => {
        const logs = getInfoLogs();
        expect(logs.some((log) => log.includes('RETRY'))).toBe(false);
      });

      it('still emits the recovered response to stdout', () => {
        expect(stdoutSpy).toHaveBeenCalledWith('Recovered\n');
      });

      it('exits with code 0 (retry does not become the final element)', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
      });
    });

    describe('when receiving ErrorMessage elements', () => {
      beforeEach(async () => {
        const elements: ChatElement[] = [
          { id: 'err1', type: 'error', error: 'Something went wrong', timestamp: 1000 },
        ];
        jest
          .mocked(mockSession.sendMessageStream)
          .mockReturnValue(asyncGeneratorFromArray(elements));
        await controller.execute();
      });

      it('should log the error message', () => {
        const logs = (mockLogger as TestLogger).errorLogs.map((log) => log.message ?? '');
        expect(logs.some((log) => log.includes('Something went wrong'))).toBe(true);
      });
    });
  });

  describe('json output mode', () => {
    let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;

    const setupJsonRun = (elements: ChatElement[]) => {
      mockSession = createFakePartial<Session>({
        preinitialize: jest.fn<Session['preinitialize']>().mockResolvedValue(undefined),
        sendMessageStream: jest.fn<Session['sendMessageStream']>(),
        sessionId: 'json-session-id',
        elements,
      });
      mockSessionManager = createFakePartial<SessionManager>({
        createSession: jest
          .fn<SessionManager['createSession']>()
          .mockResolvedValue({ session: mockSession, sessionDetails: {} }),
        getActiveSession: jest
          .fn<SessionManager['getActiveSession']>()
          .mockReturnValue(mockSession),
      });
      mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test/cwd',
        command: { name: 'run', goal: 'test goal', outputFormat: 'json' },
      });
      jest.mocked(mockSession.sendMessageStream).mockReturnValue(asyncGeneratorFromArray(elements));
      controller = createController();
    };

    const parseStdoutDocument = () => {
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const written = stdoutSpy.mock.calls[0][0] as string;
      return JSON.parse(written);
    };

    beforeEach(() => {
      stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((() => true) as typeof process.stdout.write);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
    });

    describe('on a successful run', () => {
      beforeEach(async () => {
        setupJsonRun([
          {
            id: 'msg1',
            type: 'message',
            role: 'assistant',
            content: 'All done',
            timestamp: 1000,
            isComplete: true,
          },
        ]);
        await controller.initialize();
        await controller.execute();
      });

      it('writes exactly one JSON document to stdout', () => {
        expect(stdoutSpy).toHaveBeenCalledTimes(1);
      });

      it('writes a schema-valid document with success status and exit code 0', () => {
        const document = parseStdoutDocument();
        expect(() => runResultSchema.parse(document)).not.toThrow();
        expect(document.sessionId).toBe('json-session-id');
        expect(document.status).toBe('success');
        expect(document.exitCode).toBe(0);
        expect(document.response).toBe('All done');
        expect(document.elements).toHaveLength(1);
        expect(document.error).toBeUndefined();
      });

      it('exits with code 0', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
      });

      it('suppresses the per-message result log line', () => {
        const logs = (mockLogger as TestLogger).infoLogs.map((log) => log.message ?? '');
        expect(logs.some((log) => log.includes('All done'))).toBe(false);
      });
    });

    describe('on a failed run', () => {
      beforeEach(async () => {
        setupJsonRun([
          { id: 'err1', type: 'error', error: 'Something went wrong', timestamp: 1000 },
        ]);
        await controller.initialize();
        await controller.execute();
      });

      it('writes a schema-valid document with error status and exit code 1', () => {
        const document = parseStdoutDocument();
        expect(() => runResultSchema.parse(document)).not.toThrow();
        expect(document.status).toBe('error');
        expect(document.exitCode).toBe(1);
        expect(document.error).toBe('Something went wrong');
        expect(document.response).toBe('');
      });

      it('exits with code 1', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(1);
      });
    });

    describe('when the stream throws a hard failure', () => {
      const streamError = new Error('Connection lost');

      beforeEach(() => {
        // eslint-disable-next-line require-yield
        async function* throwingStream(): AsyncGenerator<ChatElement> {
          throw streamError;
        }
        setupJsonRun([]);
        jest.mocked(mockSession.sendMessageStream).mockReturnValue(throwingStream());
      });

      it('still emits exactly one error document before propagating the error', async () => {
        await expect(controller.execute()).rejects.toThrow('Connection lost');

        const document = parseStdoutDocument();
        expect(document.status).toBe('error');
        expect(document.exitCode).toBe(1);
        expect(document.error).toBe('Connection lost');
      });
    });

    describe('when the assembled document fails schema validation', () => {
      beforeEach(async () => {
        // A tool element with an invalid state fails strict validation and is
        // NOT caught by the unknown-element passthrough (tool is a known type),
        // so the writer's runResultSchema.parse throws.
        setupJsonRun([
          {
            id: 'bad-tool',
            type: 'tool',
            name: 'read_file',
            input: { tool: 'read_file', filepath: 'f.ts' },
            state: { type: 'pending' },
            timestamp: 1000,
          } as unknown as ChatElement,
        ]);
        await controller.initialize();
        await controller.execute();
      });

      it('writes nothing to stdout', () => {
        expect(stdoutSpy).not.toHaveBeenCalled();
      });

      it('still exits cleanly via the exit handler with the run exit code', () => {
        expect(mockExitHandler.exit).toHaveBeenCalledWith(0);
      });

      it('logs the emit failure instead of throwing', () => {
        const errors = (mockLogger as TestLogger).errorLogs.map((log) => log.message ?? '');
        expect(errors.some((log) => log.includes('Failed to emit JSON result document'))).toBe(
          true,
        );
      });
    });
  });

  describe('text output mode', () => {
    let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;

    beforeEach(async () => {
      stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((() => true) as typeof process.stdout.write);
      mockCliInput.command = { name: 'run', goal: 'test goal', outputFormat: 'text' };
      mockSession = createFakePartial<Session>({
        sendMessageStream: jest.fn<Session['sendMessageStream']>(),
        elements: [
          {
            id: 'msg1',
            type: 'message',
            role: 'assistant',
            content: 'Hello World',
            timestamp: 1000,
            isComplete: true,
          },
        ],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);
      controller = createController();
      jest
        .mocked(mockSession.sendMessageStream)
        .mockReturnValue(asyncGeneratorFromArray([...mockSession.elements]));
      await controller.execute();
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
    });

    it('emits the response as plain text to stdout', () => {
      expect(stdoutSpy).toHaveBeenCalledWith('Hello World\n');
    });

    it('does not write a JSON result document to stdout', () => {
      const written = stdoutSpy.mock.calls.map((call) => call[0]).join('');
      expect(written).not.toContain('schemaVersion');
    });
  });
});
