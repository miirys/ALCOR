import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { createQuotaExceededError } from '@gitlab-lsp/workflow-api/test_utils';
import { ConfigService } from '@gitlab-org/config';
import type { ProjectService } from '@gitlab-org/core';
import { SystemContextManager } from '@gitlab-org/ai-context';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import {
  AgenticChatForbiddenError,
  DuoCliDisabledError,
  NoDuoNamespaceError,
} from '@gitlab-org/workflow-executor';
import { DUO_NO_NAMESPACE_DETECTED_MESSAGE } from '@gitlab-org/core';
import { DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import type { ParsedCliInput, ParsedCommand } from '../../parse';
import { GitLabBackend } from './gitlab_backend';
import type { GitLabModelManager } from './gitlab_model_manager';
import type { WorkflowEventMapper } from './workflow_event_mapper';
import type { GitLabParsedOptions } from './gitlab_parsed_options';
import type { RootNamespaceIdService } from './root_namespace_id_service';

function createTUICommand(): ParsedCommand {
  return { name: 'tui' } as ParsedCommand;
}

function createRunCommand(): ParsedCommand {
  return createFakePartial<ParsedCommand>({
    name: 'run',
    goal: 'test goal',
  });
}

describe('GitLabBackend - Access Error Routing', () => {
  let mockLogger: TestLogger;
  let mockWorkflowRunner: WorkflowRunner;
  let mockConfigService: ConfigService;
  let mockPreCreateWorkflow: jest.MockedFunction<WorkflowRunner['preCreateWorkflow']>;

  // Factory to create backend with specific command config
  function createBackend(
    command: ParsedCommand,
    dangerouslySkipPermissions = false,
  ): GitLabBackend {
    const mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: '/test',
      command,
      dangerouslySkipPermissions,
    });

    const mockBackendOpts = createFakePartial<GitLabParsedOptions>({
      gitlabProjectPath: command.name === 'run' ? 'gitlab-org/gitlab' : undefined,
    });

    return new GitLabBackend(
      mockLogger,
      mockWorkflowRunner,
      mockConfigService,
      mockCliInput,
      mockBackendOpts,
      createFakePartial<ProjectService>({
        getProjectFromPathWithNamespace: jest
          .fn<ProjectService['getProjectFromPathWithNamespace']>()
          .mockResolvedValue({
            id: 'gid://gitlab/Project/1',
            namespace: {
              id: 'gid://gitlab/Namespace/1',
              rootNamespace: { id: 'gid://gitlab/Group/1' },
            },
          }),
      }),
      createFakePartial<RootNamespaceIdService>({
        resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
      }),
      createFakePartial<WorkflowEventMapper>({}),
      createFakePartial<SystemContextManager>({
        getSystemContextItems: async () => [],
      }),
      createFakePartial<McpManagerWorkflowExecutorAdaptor>({}),
      createFakePartial<GitLabModelManager>({
        initialize: jest.fn<GitLabModelManager['initialize']>().mockResolvedValue(undefined),
        getModel: jest
          .fn<GitLabModelManager['getModel']>()
          .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
        setModel: jest.fn<GitLabModelManager['setModel']>(),
        resolveModel: jest.fn<GitLabModelManager['resolveModel']>().mockResolvedValue(undefined),
      }),
      createFakePartial<DuoAgentPlatformTracker>({
        trackEvent: jest.fn<DuoAgentPlatformTracker['trackEvent']>(),
      }),
    );
  }

  beforeEach(() => {
    mockLogger = new TestLogger();

    const mockGet = jest.fn<() => string | undefined>().mockReturnValue('gitlab-org/gitlab');
    const mockSet = jest.fn();
    mockConfigService = {
      get: mockGet,
      set: mockSet,
    } as Partial<ConfigService> as ConfigService;

    mockPreCreateWorkflow = jest.fn<() => Promise<string>>().mockResolvedValue('workflow-123');
    mockWorkflowRunner = createFakePartial<WorkflowRunner>({
      preCreateWorkflow: mockPreCreateWorkflow,
      resolveModel: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
      getServerCapabilities: jest
        .fn<WorkflowRunner['getServerCapabilities']>()
        .mockReturnValue(null),
    });
  });

  describe('Access denial handling by mode', () => {
    it.each([
      { mode: 'TUI', commandFn: createTUICommand, expectThrow: false },
      { mode: 'run', commandFn: createRunCommand, expectThrow: true },
    ])(
      'should handle AgenticChatForbiddenError in $mode mode',
      async ({ commandFn, expectThrow }) => {
        const forbiddenError = new AgenticChatForbiddenError('Project does not have access');
        mockPreCreateWorkflow.mockRejectedValue(forbiddenError);
        const backend = createBackend(commandFn());

        if (expectThrow) {
          await expect(backend.initialize()).rejects.toThrow('Project does not have access');
        } else {
          const result = await backend.initialize();
          expect(result.sessionRejectionReason).toBe('Project does not have access');
          expect(result.sessionId).toBe('');
        }
      },
    );
  });

  describe('No Duo namespace handling by mode', () => {
    it.each([
      { mode: 'TUI', commandFn: createTUICommand, expectThrow: false },
      { mode: 'run', commandFn: createRunCommand, expectThrow: true },
    ])('should handle NoDuoNamespaceError in $mode mode', async ({ commandFn, expectThrow }) => {
      mockPreCreateWorkflow.mockRejectedValue(
        new NoDuoNamespaceError(DUO_NO_NAMESPACE_DETECTED_MESSAGE),
      );
      const backend = createBackend(commandFn());

      if (expectThrow) {
        await expect(backend.initialize()).rejects.toThrow(
          'Could not determine a GitLab Duo namespace',
        );
      } else {
        const result = await backend.initialize();
        expect(result.sessionRejectionReason).toBe(DUO_NO_NAMESPACE_DETECTED_MESSAGE);
        expect(result.sessionId).toBe('');
      }
    });
  });

  describe('Non-forbidden error handling by mode', () => {
    it('should return sessionRejectionReason for generic errors in TUI mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(new Error('Network request failed'));
      const backend = createBackend(createTUICommand());

      const result = await backend.initialize();
      expect(result.sessionId).toBe('');
      expect(result.sessionRejectionReason).toContain('Failed to verify Agentic Chat access');
      expect(result.sessionRejectionReason).toContain('Network request failed');
    });

    it('should rethrow generic errors in run mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(new Error('Network request failed'));
      const backend = createBackend(createRunCommand());

      await expect(backend.initialize()).rejects.toThrow('Failed to initialize workflow');
    });
  });

  describe('Usage quota exceeded handling by mode', () => {
    it('should return sessionRejectionReason for quota exceeded error in TUI mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(createQuotaExceededError());
      const backend = createBackend(createTUICommand());

      const result = await backend.initialize();
      expect(result.sessionId).toBe('');
      expect(result.sessionRejectionReason).toBe(
        'No credits remain for this billing period. Contact your administrator for more credits.',
      );
    });

    it('should rethrow quota exceeded error in run mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(createQuotaExceededError());
      const backend = createBackend(createRunCommand());

      await expect(backend.initialize()).rejects.toThrow('Failed to initialize workflow');
    });
  });

  describe('Duo CLI disabled handling by mode', () => {
    it('should return sessionRejectionReason for DuoCliDisabledError in TUI mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(
        new DuoCliDisabledError('403 Forbidden - Duo CLI has been disabled by your administrator'),
      );
      const backend = createBackend(createTUICommand());

      const result = await backend.initialize();
      expect(result.sessionId).toBe('');
      expect(result.sessionRejectionReason).toContain(
        'GitLab Duo CLI has not been enabled by your administrator',
      );
      expect(result.sessionRejectionReason).toContain('Admin area > GitLab Duo > Configuration');
    });

    it('should rethrow DuoCliDisabledError in run mode', async () => {
      mockPreCreateWorkflow.mockRejectedValue(
        new DuoCliDisabledError('403 Forbidden - Duo CLI has been disabled by your administrator'),
      );
      const backend = createBackend(createRunCommand());

      await expect(backend.initialize()).rejects.toThrow(
        'Failed to initialize workflow: GitLab Duo CLI has not been enabled by your administrator',
      );
    });
  });

  describe('Successful workflow creation', () => {
    it('should return the workflow ID and no sessionDetails when access is granted', async () => {
      const backend = createBackend(createTUICommand());

      const result = await backend.initialize();

      expect(result.sessionId).toBe('workflow-123');
      expect(result.sessionRejectionReason).toBeUndefined();
      expect(mockPreCreateWorkflow).toHaveBeenCalled();
    });
  });

  describe('Resuming an existing session', () => {
    it('should skip workflow creation and return the existing session ID', async () => {
      const backend = createBackend(createTUICommand());

      const result = await backend.initialize('existing-session-id');

      expect(result.sessionId).toBe('existing-session-id');
      expect(result.sessionRejectionReason).toBeUndefined();
      expect(mockPreCreateWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('requiresDuoCliEnabled option', () => {
    it('passes requiresDuoCliEnabled: false for run command', async () => {
      const backend = createBackend(createRunCommand());

      await backend.initialize();

      expect(mockPreCreateWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
        expect.anything(),
        expect.objectContaining({ requiresDuoCliEnabled: false }),
      );
    });

    it('passes requiresDuoCliEnabled: true when dangerouslySkipPermissions is set', async () => {
      const backend = createBackend(createTUICommand(), true);

      await backend.initialize();

      expect(mockPreCreateWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
        expect.anything(),
        expect.objectContaining({ requiresDuoCliEnabled: true }),
      );
    });

    it('passes requiresDuoCliEnabled: true for normal TUI command', async () => {
      const backend = createBackend(createTUICommand());

      await backend.initialize();

      expect(mockPreCreateWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
        expect.anything(),
        expect.objectContaining({ requiresDuoCliEnabled: true }),
      );
    });
  });
});
