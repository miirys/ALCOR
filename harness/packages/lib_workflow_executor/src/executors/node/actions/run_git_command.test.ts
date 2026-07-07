import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { createFakePartial } from '@gitlab-org/test-utils';
import { validateGitCommand } from '@gitlab-org/repositories/node';
import { parseGitLabRemote } from '@gitlab-org/repositories';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { getMockWorkflowToken } from '../../test_utils';
import { WorkflowAction } from '../clients/types';
import {
  RunGitCommandActionHandler,
  RunGitCommandAction,
  RunGitCommandFormatter,
} from './run_git_command';
import { WorkflowActionContext } from './index';

jest.mock('@gitlab-org/repositories/node', () => ({
  ...jest.requireActual('@gitlab-org/repositories/node'),
  validateGitCommand: jest.fn(),
}));

jest.mock('@gitlab-org/repositories', () => ({
  ...jest.requireActual('@gitlab-org/repositories'),
  parseGitLabRemote: jest.fn(),
}));

describe('RunGitCommandActionHandler', () => {
  let runGitCommandHandler: RunGitCommandActionHandler;
  let mockLogger: TestLogger;
  let mockConfigService: ConfigService;
  let mockSecretRedactor: SecretRedactor;
  let workflowActionContext: WorkflowActionContext;

  let buildGitArgsSpy: jest.SpyInstance;
  let runGitCommandSpy: jest.SpyInstance;
  let mockValidateGitCommand: jest.MockedFunction<typeof validateGitCommand>;
  let mockParseGitLabRemote: jest.MockedFunction<typeof parseGitLabRemote>;

  const workspaceFolderPath = '/path/to/folder';
  const command = 'status';
  const args = '--short';
  const repositoryUrl = 'https://example.gitlab.com/my-group/my-project.git';
  let defaultAction: RunGitCommandAction;
  let abortController: AbortController;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });
    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn((input: string) => input),
    });
    runGitCommandHandler = new RunGitCommandActionHandler(
      mockLogger,
      mockConfigService,
      mockSecretRedactor,
    );
    const handlerPrototype = Object.getPrototypeOf(runGitCommandHandler);

    buildGitArgsSpy = jest
      .spyOn(handlerPrototype, 'buildGitArgs')
      .mockResolvedValue(['git', 'status', '--short']);

    runGitCommandSpy = jest
      .spyOn(handlerPrototype, 'runGitCommand')
      .mockResolvedValue({ output: 'mocked command output', exitCode: 0 });

    abortController = new AbortController();

    // Mock validateGitCommand to return valid by default
    mockValidateGitCommand = validateGitCommand as jest.MockedFunction<typeof validateGitCommand>;
    mockValidateGitCommand.mockReturnValue({
      isValid: true,
      args: ['--short'],
    });

    mockParseGitLabRemote = parseGitLabRemote as jest.MockedFunction<typeof parseGitLabRemote>;
    mockParseGitLabRemote.mockReturnValue(undefined);

    const mockWorkflowToken = getMockWorkflowToken();
    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      workflowToken: mockWorkflowToken,
      workflowId: 'abc-123',
      abortSignal: abortController.signal,
    });

    defaultAction = createFakePartial<RunGitCommandAction>({
      runGitCommand: { command, arguments: args, repository_url: repositoryUrl },
    });
  });

  describe('canHandle', () => {
    it('returns true for runGitCommand actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runGitCommand: { command, arguments: args, repository_url: repositoryUrl },
      });

      expect(runGitCommandHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(runGitCommandHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    it('validates git command before execution', async () => {
      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(mockValidateGitCommand).toHaveBeenCalledWith(command, args);
    });

    it('uses validated args when building git arguments', async () => {
      const validatedArgs = ['--porcelain', '--short'];
      mockValidateGitCommand.mockReturnValue({
        isValid: true,
        args: validatedArgs,
      });

      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(buildGitArgsSpy).toHaveBeenCalledWith(
        command,
        validatedArgs,
        repositoryUrl,
        workspaceFolderPath,
      );
    });

    it('handles empty validated args array', async () => {
      mockValidateGitCommand.mockReturnValue({
        isValid: true,
        args: [],
      });

      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(buildGitArgsSpy).toHaveBeenCalledWith(command, [], repositoryUrl, workspaceFolderPath);
    });

    it('returns error when git command validation fails', async () => {
      const validationError = 'Command not allowed';
      mockValidateGitCommand.mockReturnValue({
        isValid: false,
        error: validationError,
      });

      const result = await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(result).toEqual({
        error: validationError,
        response: '',
      });
      expect(buildGitArgsSpy).not.toHaveBeenCalled();
      expect(runGitCommandSpy).not.toHaveBeenCalled();
    });

    it('builds the correct git arguments', async () => {
      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(buildGitArgsSpy).toHaveBeenCalledWith(
        command,
        ['--short'],
        repositoryUrl,
        workspaceFolderPath,
      );
    });

    it('runs the git command with correct parameters', async () => {
      const mockGitArgs = ['git', 'status', '--short'];
      buildGitArgsSpy.mockResolvedValue(mockGitArgs);

      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(runGitCommandSpy).toHaveBeenCalledWith(
        mockGitArgs,
        workspaceFolderPath,
        workflowActionContext.workflowToken.gitlab_rails.token,
        abortController.signal,
      );
    });

    it('returns response with exit code prefix on success', async () => {
      runGitCommandSpy.mockResolvedValue({ output: 'all good', exitCode: 0 });

      const result = await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(result).toEqual({
        response: 'Exit code: 0\nall good',
        error: '',
      });
    });

    it('returns response with exit code prefix when command exits with non-zero code', async () => {
      runGitCommandSpy.mockResolvedValue({ output: 'error: fatal stuff', exitCode: 128 });

      const result = await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(result).toEqual({
        response: 'Exit code: 128\nerror: fatal stuff',
        error: '',
      });
    });

    it('returns error object when command execution fails', async () => {
      const errMessage = 'Git command failed';
      const error = new Error(errMessage);
      runGitCommandSpy.mockRejectedValue(error);

      const result = await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(result).toMatchObject({
        error: errMessage,
        response: '',
      });
    });

    describe('session URL trailer', () => {
      const commitAction = createFakePartial<RunGitCommandAction>({
        runGitCommand: { command: 'commit', arguments: '-m "msg"', repository_url: repositoryUrl },
      });

      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
          if (key === 'duo.sessionTrackingEnabled') return true;
          if (key === 'baseUrl') return 'https://gitlab.example.com';
          return undefined;
        });
        mockValidateGitCommand.mockReturnValue({ isValid: true, args: ['-m', 'msg'] });
        mockParseGitLabRemote.mockReturnValue(
          createFakePartial<ReturnType<typeof parseGitLabRemote>>({
            namespaceWithPath: 'group/project',
          }),
        );
      });

      it('appends --trailer to commit args when all conditions are met', async () => {
        await runGitCommandHandler.execute(commitAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs.filter((a: string) => a === '--trailer')).toHaveLength(2);
        expect(calledArgs).toContain('Co-authored-by: GitLab Duo <duo@gitlab.com>');
        expect(calledArgs).toContain(
          'Duo-Session: https://gitlab.example.com/group/project/-/automate/agent-sessions/abc-123',
        );
      });

      it('uses workflowToken.gitlab_rails.base_url as fallback when configService baseUrl is unset', async () => {
        (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
          if (key === 'duo.sessionTrackingEnabled') return true;
          return undefined;
        });

        await runGitCommandHandler.execute(commitAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs.filter((a: string) => a === '--trailer')).toHaveLength(2);
        expect(calledArgs).toContain('Co-authored-by: GitLab Duo <duo@gitlab.com>');
        expect(calledArgs).toContain(
          'Duo-Session: https://gitlab.example.com/group/project/-/automate/agent-sessions/abc-123',
        );
      });

      it('does not append --trailer to non-commit commands', async () => {
        await runGitCommandHandler.execute(defaultAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs).not.toContain('--trailer');
      });

      it('does not append --trailer when sessionTrackingEnabled is false', async () => {
        (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
          if (key === 'duo.sessionTrackingEnabled') return false;
          return undefined;
        });

        await runGitCommandHandler.execute(commitAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs).not.toContain('--trailer');
      });

      it('does not append --trailer when project path cannot be parsed from repository URL', async () => {
        mockParseGitLabRemote.mockReturnValue(undefined);

        await runGitCommandHandler.execute(commitAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs).not.toContain('--trailer');
      });

      it('does not append --trailer when workflowId is missing', async () => {
        const contextWithoutWorkflowId = createFakePartial<WorkflowActionContext>({
          ...workflowActionContext,
          workflowId: '',
        });

        await runGitCommandHandler.execute(commitAction, contextWithoutWorkflowId);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs).not.toContain('--trailer');
      });

      it('does not append --trailer when performing an amend', async () => {
        const amendAction = createFakePartial<RunGitCommandAction>({
          runGitCommand: {
            command: 'commit',
            arguments: '--amend --no-edit',
            repository_url: repositoryUrl,
          },
        });
        mockValidateGitCommand.mockReturnValue({ isValid: true, args: ['--amend', '--no-edit'] });

        await runGitCommandHandler.execute(amendAction, workflowActionContext);

        const [, calledArgs] = buildGitArgsSpy.mock.calls[0];
        expect(calledArgs).not.toContain('--trailer');
      });
    });

    it('handles validation with undefined arguments', async () => {
      const actionWithUndefinedArgs = createFakePartial<RunGitCommandAction>({
        runGitCommand: { command, repository_url: repositoryUrl },
      });

      await runGitCommandHandler.execute(actionWithUndefinedArgs, workflowActionContext);

      expect(mockValidateGitCommand).toHaveBeenCalledWith(command, undefined);
    });

    it('logs validation errors appropriately', async () => {
      const validationError = 'Command validation failed';
      jest.spyOn(mockLogger, 'error');
      mockValidateGitCommand.mockReturnValue({
        isValid: false,
        error: validationError,
      });

      await runGitCommandHandler.execute(defaultAction, workflowActionContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Git command execution error'),
        expect.any(Error),
      );
    });
  });
});

describe('RunGitCommandFormatter', () => {
  let formatter: RunGitCommandFormatter;

  beforeEach(() => {
    formatter = new RunGitCommandFormatter();
  });

  it('maps command alone to the run_git_command display', () => {
    expect(formatter.format({ command: 'status' })).toEqual({
      tool: 'run_git_command',
      command: 'status',
    });
  });

  it('includes commandArgs when args are present', () => {
    expect(formatter.format({ command: 'log', args: '--oneline -5' })).toEqual({
      tool: 'run_git_command',
      command: 'log',
      commandArgs: '--oneline -5',
    });
  });

  it.each([
    ['command missing', {}],
    ['command a number', { command: 42 }],
    ['args a number', { command: 'log', args: 42 }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
