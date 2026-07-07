import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  type DuoWorkflowEvent,
  type WorkflowRetryEvent,
  DuoWorkflowStatus,
  generateErrorMessageFromStatusCode,
  HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
  PLAN_AGENT_PRIVILEGES,
  WorkflowExecutorError,
  WorkflowRunner,
  WorkflowStatusCode,
} from '@gitlab-lsp/workflow-api';
import { ConfigService } from '@gitlab-org/config';
import type { ProjectService } from '@gitlab-org/core';
import { SystemContextManager } from '@gitlab-org/ai-context';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { SandboxUnavailableError } from '@gitlab-org/sandbox/errors';
import { AgentEventType, type AgentEvent, UserActionType, type UserAction } from '../backend';
import type { ParsedCliInput, ParsedCommand } from '../../parse';
import { GitLabBackend } from './gitlab_backend';
import type { GitLabModelManager } from './gitlab_model_manager';
import type { WorkflowEventMapper } from './workflow_event_mapper';
import type { GitLabParsedOptions } from './gitlab_parsed_options';
import type { RootNamespaceIdService } from './root_namespace_id_service';

function createRunCommand(): ParsedCommand {
  return createFakePartial<ParsedCommand>({ name: 'run', goal: 'test goal' });
}

describe('GitLabBackend', () => {
  describe('rootNamespaceId initialization', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;

    function createBackend(
      rootNamespaceIdService: RootNamespaceIdService,
      projectServiceImpl: ProjectService,
    ): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        command: createRunCommand(),
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>({ gitlabProjectPath: 'gl-demo/project' }),
        projectServiceImpl,
        rootNamespaceIdService,
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

      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;

      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest.fn<() => Promise<string>>().mockResolvedValue('workflow-123'),
        resolveModel: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
      });
    });

    it('resolves the root namespace via RootNamespaceIdService and stores it in config', async () => {
      const fetchedProjectDetails = {
        id: 'gid://gitlab/Project/80878669',
        namespace: {
          id: 'gid://gitlab/Namespace/121204394',
          rootNamespace: { id: 'gid://gitlab/Group/121204394' },
        },
      };
      const projectService = createFakePartial<ProjectService>({
        getProjectFromPathWithNamespace: jest
          .fn<ProjectService['getProjectFromPathWithNamespace']>()
          .mockResolvedValue(fetchedProjectDetails),
      });
      const resolve = jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue('121204394');
      const rootNamespaceIdService = createFakePartial<RootNamespaceIdService>({ resolve });

      const backend = createBackend(rootNamespaceIdService, projectService);

      await backend.initialize();

      expect(resolve).toHaveBeenCalledWith(fetchedProjectDetails);
      expect(mockConfigService.set).toHaveBeenCalledWith('rootNamespaceId', '121204394');
    });

    it('stores the empty string the service returns when no namespace is resolved', async () => {
      const projectService = createFakePartial<ProjectService>({
        getProjectFromPathWithNamespace: jest
          .fn<ProjectService['getProjectFromPathWithNamespace']>()
          .mockRejectedValue(new Error('Network error')),
      });
      const rootNamespaceIdService = createFakePartial<RootNamespaceIdService>({
        resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
      });

      const backend = createBackend(rootNamespaceIdService, projectService);

      await backend.initialize();

      expect(rootNamespaceIdService.resolve).toHaveBeenCalledWith(undefined);
      expect(mockConfigService.set).toHaveBeenCalledWith('rootNamespaceId', '');
    });
  });

  describe('#validateFlowConfigOptions', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;

    function createBackend(backendOpts: Partial<GitLabParsedOptions>): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        command: createRunCommand(),
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>(backendOpts),
        createFakePartial<ProjectService>({
          getProjectFromPathWithNamespace:
            jest.fn<ProjectService['getProjectFromPathWithNamespace']>(),
        }),
        createFakePartial<RootNamespaceIdService>({
          resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
        }),
        createFakePartial<WorkflowEventMapper>({
          mapWorkflowEvent: jest
            .fn<WorkflowEventMapper['mapWorkflowEvent']>()
            .mockResolvedValue([]),
        }),
        createFakePartial<SystemContextManager>({
          getSystemContextItems: async () => [],
        }),
        createFakePartial<McpManagerWorkflowExecutorAdaptor>({}),
        createFakePartial<GitLabModelManager>({
          getModel: jest
            .fn<GitLabModelManager['getModel']>()
            .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
        }),
        createFakePartial<DuoAgentPlatformTracker>({
          trackEvent: jest.fn<DuoAgentPlatformTracker['trackEvent']>(),
        }),
      );
    }

    async function collectEvents(backend: GitLabBackend): Promise<AgentEvent[]> {
      const events: AgentEvent[] = [];
      for await (const event of backend.sendMessageStream(
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      )) {
        events.push(event);
      }
      return events;
    }

    beforeEach(() => {
      mockLogger = new TestLogger();
      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;
      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest
          .fn<WorkflowRunner['preCreateWorkflow']>()
          .mockResolvedValue('workflow-123'),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
        runWorkflow: jest
          .fn<WorkflowRunner['runWorkflow']>()
          .mockReturnValue((async function* () {})()),
      });
    });

    describe('when all three flow config options are provided', () => {
      it('passes them through without warning', async () => {
        const backend = createBackend({
          flowConfigSchemaVersion: '1.0',
          flowConfigId: 'my-flow',
          flowVersion: '2',
        });

        await collectEvents(backend);

        expect(
          mockLogger.warnLogs.some((e) => e.message?.includes('must all be set together')),
        ).toBe(false);
        expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigSchemaVersion: '1.0',
            flowConfigId: 'my-flow',
            flowVersion: '2',
          }),
        );
      });
    });

    describe('when all three flow config options are empty strings', () => {
      it('treats them as missing and does not warn', async () => {
        const backend = createBackend({
          flowConfigSchemaVersion: '',
          flowConfigId: '',
          flowVersion: '',
        });

        await collectEvents(backend);

        expect(
          mockLogger.warnLogs.some((e) => e.message?.includes('must all be set together')),
        ).toBe(false);
        expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigSchemaVersion: undefined,
            flowConfigId: undefined,
            flowVersion: undefined,
          }),
        );
      });
    });

    describe('when only some flow config options are provided', () => {
      it('warns and discards all flow config options', async () => {
        const backend = createBackend({
          flowConfigSchemaVersion: '1.0',
          flowConfigId: 'my-flow',
          flowVersion: undefined,
        });

        await collectEvents(backend);

        expect(
          mockLogger.warnLogs.some((e) => e.message?.includes('must all be set together')),
        ).toBe(true);
        expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigSchemaVersion: undefined,
            flowConfigId: undefined,
            flowVersion: undefined,
          }),
        );
      });
    });

    describe('when a mix of empty strings and real values is provided', () => {
      it('treats empty strings as missing, warns, and discards all', async () => {
        const backend = createBackend({
          flowConfigSchemaVersion: '1.0',
          flowConfigId: '',
          flowVersion: '2',
        });

        await collectEvents(backend);

        expect(
          mockLogger.warnLogs.some((e) => e.message?.includes('must all be set together')),
        ).toBe(true);
        expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigSchemaVersion: undefined,
            flowConfigId: undefined,
            flowVersion: undefined,
          }),
        );
      });
    });

    describe('when no flow config options are provided', () => {
      it('does not warn and passes undefined values', async () => {
        const backend = createBackend({});

        await collectEvents(backend);

        expect(
          mockLogger.warnLogs.some((e) => e.message?.includes('must all be set together')),
        ).toBe(false);
        expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            flowConfigSchemaVersion: undefined,
            flowConfigId: undefined,
            flowVersion: undefined,
          }),
        );
      });
    });

    it('passes workflowDefinition matching the workflow type', async () => {
      const backend = createBackend({ workflowType: 'code_review/v1' });

      await collectEvents(backend);

      expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinition: 'code_review/v1',
          type: 'code_review/v1',
        }),
      );
    });

    it('defaults workflowDefinition to chat when no workflow type is set', async () => {
      const backend = createBackend({});

      await collectEvents(backend);

      expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinition: 'chat',
          type: 'chat',
        }),
      );
    });

    it('passes developer/v2-local as workflowDefinition in --developer mode', async () => {
      const backend = createBackend({ developer: true });

      await collectEvents(backend);

      expect(mockWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinition: 'developer/v2-local',
        }),
      );
    });

    it('runs plan mode on the registry developer flow, signalling mode via a plan_context item', async () => {
      const backend = createBackend({ developer: true });

      const stream = backend.sendMessageStream(
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
          agentMode: 'plan',
        }),
      );
      for await (const event of stream) {
        expect(event).toBeDefined();
      }

      // Under --developer the registry developer flow is the single source of
      // truth; no inline flow-config override is sent. Tool gating comes from
      // agent privileges and the prompt is switched per-turn through the
      // plan_context AI context item (resolved into `plan_enabled`).
      const payload = jest.mocked(mockWorkflowRunner.runWorkflow).mock.calls.at(-1)?.[0];
      expect(payload).toEqual(
        expect.objectContaining({
          flowConfigId: 'developer',
          flowVersion: '2.0.0-local',
          flowConfigSchemaVersion: 'v1',
          flowConfig: undefined,
          workflowDefinition: 'developer/v2-local',
        }),
      );
      const planContext = payload?.additionalContext?.find(
        (item) => item.category === 'plan_context',
      );
      expect(planContext?.content).toEqual(JSON.stringify({ plan_enabled: true }));
    });

    it('signals build mode with plan_enabled=false on the registry developer flow', async () => {
      const backend = createBackend({ developer: true });

      const stream = backend.sendMessageStream(
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
          agentMode: 'build',
        }),
      );
      for await (const event of stream) {
        expect(event).toBeDefined();
      }

      const payload = jest.mocked(mockWorkflowRunner.runWorkflow).mock.calls.at(-1)?.[0];
      expect(payload).toEqual(
        expect.objectContaining({
          flowConfigId: 'developer',
          flowConfig: undefined,
          workflowDefinition: 'developer/v2-local',
        }),
      );
      const planContext = payload?.additionalContext?.find(
        (item) => item.category === 'plan_context',
      );
      expect(planContext?.content).toEqual(JSON.stringify({ plan_enabled: false }));
    });
  });

  describe('sendMessageStream error handling', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;
    let mockWorkflowEventMapper: WorkflowEventMapper;

    function createBackend(): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        command: createFakePartial<ParsedCommand>({ name: 'run', goal: 'test goal' }),
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>({}),
        createFakePartial<ProjectService>({
          getProjectFromPathWithNamespace:
            jest.fn<ProjectService['getProjectFromPathWithNamespace']>(),
        }),
        createFakePartial<RootNamespaceIdService>({
          resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
        }),
        mockWorkflowEventMapper,
        createFakePartial<SystemContextManager>({
          getSystemContextItems: async () => [],
        }),
        createFakePartial<McpManagerWorkflowExecutorAdaptor>({}),
        createFakePartial<GitLabModelManager>({
          getModel: jest
            .fn<GitLabModelManager['getModel']>()
            .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
        }),
        createFakePartial<DuoAgentPlatformTracker>({
          trackEvent: jest.fn<DuoAgentPlatformTracker['trackEvent']>(),
        }),
      );
    }

    async function collectEvents(
      backend: GitLabBackend,
      action: UserAction,
    ): Promise<AgentEvent[]> {
      const events: AgentEvent[] = [];
      for await (const event of backend.sendMessageStream(action)) {
        events.push(event);
      }
      return events;
    }

    beforeEach(() => {
      mockLogger = new TestLogger();
      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;
      mockWorkflowEventMapper = createFakePartial<WorkflowEventMapper>({
        mapWorkflowEvent: jest.fn<WorkflowEventMapper['mapWorkflowEvent']>().mockResolvedValue([]),
      });
      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest
          .fn<WorkflowRunner['preCreateWorkflow']>()
          .mockResolvedValue('workflow-123'),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
        runWorkflow: jest.fn<WorkflowRunner['runWorkflow']>(),
      });
    });

    it('yields the SandboxUnavailableError message verbatim instead of GENERAL_FAILURE', async () => {
      const sandboxMessage =
        'Sandbox is enabled but sandbox provider is not available (missing_dependencies).';
      jest.mocked(mockWorkflowRunner.runWorkflow).mockImplementation(() => {
        throw new SandboxUnavailableError(sandboxMessage, 'missing_dependencies');
      });

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        type: AgentEventType.Error,
        message: sandboxMessage,
      });
      expect(errorEvents[0].message).not.toBe(
        generateErrorMessageFromStatusCode(WorkflowStatusCode.GENERAL_FAILURE),
      );
    });

    it('falls back to GENERAL_FAILURE for unrelated errors', async () => {
      jest.mocked(mockWorkflowRunner.runWorkflow).mockImplementation(() => {
        throw new Error('something else broke');
      });

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe(
        generateErrorMessageFromStatusCode(WorkflowStatusCode.GENERAL_FAILURE),
      );
    });

    it('skips non-checkpoint events without yielding or mapping them', async () => {
      // An out-of-band event that is neither a terminal error nor a real
      // checkpoint (no valid workflowStatus). The `isDuoWorkflowEvent` guard
      // should skip it so it never reaches the mapper.
      const unknownEvent = { kind: 'some-future-signal' } as unknown as DuoWorkflowEvent;
      const checkpointEvent = createFakePartial<DuoWorkflowEvent>({
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: '{}',
      });
      async function* eventStream() {
        yield unknownEvent;
        yield checkpointEvent;
      }
      jest.mocked(mockWorkflowRunner.runWorkflow).mockReturnValue(eventStream());

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      // The unknown event is skipped: no agent event is emitted for it, and it
      // never reaches the mapper (only the real checkpoint does).
      expect(events).toHaveLength(0);
      expect(mockWorkflowEventMapper.mapWorkflowEvent).toHaveBeenCalledTimes(1);
      expect(mockWorkflowEventMapper.mapWorkflowEvent).toHaveBeenCalledWith(
        checkpointEvent,
        expect.anything(),
      );
    });
  });

  describe('sendMessageStream retry events', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;
    let mockWorkflowEventMapper: WorkflowEventMapper;

    function createBackend(): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        command: createFakePartial<ParsedCommand>({ name: 'run', goal: 'test goal' }),
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>({}),
        createFakePartial<ProjectService>({
          getProjectFromPathWithNamespace:
            jest.fn<ProjectService['getProjectFromPathWithNamespace']>(),
        }),
        createFakePartial<RootNamespaceIdService>({
          resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
        }),
        mockWorkflowEventMapper,
        createFakePartial<SystemContextManager>({
          getSystemContextItems: async () => [],
        }),
        createFakePartial<McpManagerWorkflowExecutorAdaptor>({}),
        createFakePartial<GitLabModelManager>({
          getModel: jest
            .fn<GitLabModelManager['getModel']>()
            .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
        }),
        createFakePartial<DuoAgentPlatformTracker>({
          trackEvent: jest.fn<DuoAgentPlatformTracker['trackEvent']>(),
        }),
      );
    }

    async function collectEvents(
      backend: GitLabBackend,
      action: UserAction,
    ): Promise<AgentEvent[]> {
      const events: AgentEvent[] = [];
      for await (const event of backend.sendMessageStream(action)) {
        events.push(event);
      }
      return events;
    }

    beforeEach(() => {
      mockLogger = new TestLogger();
      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;
      mockWorkflowEventMapper = createFakePartial<WorkflowEventMapper>({
        mapWorkflowEvent: jest.fn<WorkflowEventMapper['mapWorkflowEvent']>().mockResolvedValue([
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'mapped',
            timestamp: 1000,
          },
        ]),
      });
      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest
          .fn<WorkflowRunner['preCreateWorkflow']>()
          .mockResolvedValue('workflow-123'),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
        runWorkflow: jest.fn<WorkflowRunner['runWorkflow']>(),
      });
    });

    it('maps a WorkflowRetryEvent to an AgentEventType.Retry without passing it to the event mapper', async () => {
      const retryEvent: WorkflowRetryEvent = {
        kind: 'retry',
        attempt: 2,
        maxAttempts: 5,
        backoffMs: 4000,
      };
      // A normal workflow event interleaved with the retry event.
      const normalEvent = createFakePartial<DuoWorkflowEvent>({
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: 'checkpoint',
        errors: [],
        workflowGoal: 'test-goal',
      });

      async function* workflowStream() {
        yield retryEvent;
        yield normalEvent;
      }
      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workflowStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      const retryEvents = events.filter((e) => e.type === AgentEventType.Retry);
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0]).toEqual(
        expect.objectContaining({
          type: AgentEventType.Retry,
          attempt: 2,
          maxAttempts: 5,
          backoffMs: 4000,
        }),
      );
      expect(typeof (retryEvents[0] as { timestamp: number }).timestamp).toBe('number');

      // The retry event must NOT be forwarded to the workflow event mapper; only
      // the normal event is mapped.
      expect(mockWorkflowEventMapper.mapWorkflowEvent).toHaveBeenCalledTimes(1);
      expect(mockWorkflowEventMapper.mapWorkflowEvent).toHaveBeenCalledWith(
        normalEvent,
        expect.anything(),
      );
      expect(mockWorkflowEventMapper.mapWorkflowEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'retry' }),
        expect.anything(),
      );

      // The mapped normal event is still yielded after the retry event.
      const textEvents = events.filter((e) => e.type === AgentEventType.TextChunk);
      expect(textEvents).toHaveLength(1);
    });

    it('forwards the mapped event after a retry, without an extra clear event', async () => {
      const retryEvent: WorkflowRetryEvent = {
        kind: 'retry',
        attempt: 3,
        maxAttempts: 5,
        backoffMs: 4000,
      };
      const eventA = createFakePartial<DuoWorkflowEvent>({
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: 'checkpoint-a',
        errors: [],
        workflowGoal: 'test-goal',
      });
      const eventB = createFakePartial<DuoWorkflowEvent>({
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: 'checkpoint-b',
        errors: [],
        workflowGoal: 'test-goal',
      });

      // Event A maps to nothing (empty map); event B maps to a TextChunk.
      jest
        .mocked(mockWorkflowEventMapper.mapWorkflowEvent)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-b',
            content: 'from B',
            timestamp: 2000,
          },
        ]);

      async function* workflowStream() {
        yield retryEvent;
        yield eventA;
        yield eventB;
      }
      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workflowStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      // Sequence: Retry, then the TextChunk from B. The retry indicator is
      // cleared by the session when any non-retry event arrives, so the backend
      // emits no dedicated clear event.
      expect(events.map((e) => e.type)).toEqual([AgentEventType.Retry, AgentEventType.TextChunk]);

      const textEvents = events.filter((e) => e.type === AgentEventType.TextChunk);
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0]).toEqual(expect.objectContaining({ content: 'from B' }));
    });

    it('emits the error event directly after a retry', async () => {
      const retryEvent: WorkflowRetryEvent = {
        kind: 'retry',
        attempt: 3,
        maxAttempts: 5,
        backoffMs: 4000,
      };
      const errorEvent = new WorkflowExecutorError(
        'workflow exploded',
        WorkflowStatusCode.GENERAL_FAILURE,
      );

      async function* workflowStream() {
        yield retryEvent;
        yield errorEvent;
      }
      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workflowStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      // The error follows the retry directly (the session clears the indicator
      // on receipt of the error).
      expect(events.map((e) => e.type)).toEqual([AgentEventType.Retry, AgentEventType.Error]);

      // The error is not forwarded to the mapper.
      expect(mockWorkflowEventMapper.mapWorkflowEvent).not.toHaveBeenCalled();
    });

    it('emits no retry events when there was no retry', async () => {
      const normalEvent = createFakePartial<DuoWorkflowEvent>({
        workflowStatus: DuoWorkflowStatus.RUNNING,
        checkpoint: 'checkpoint',
        errors: [],
        workflowGoal: 'test-goal',
      });

      async function* workflowStream() {
        yield normalEvent;
      }
      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workflowStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      expect(events.filter((e) => e.type === AgentEventType.Retry)).toHaveLength(0);
    });

    it('emits only the retry event when the stream ends while a retry is pending', async () => {
      // The stream's final event is the retry event itself. The session clears
      // the indicator when the turn finalizes, so the backend emits no extra
      // clear event.
      const retryEvent: WorkflowRetryEvent = {
        kind: 'retry',
        attempt: 5,
        maxAttempts: 5,
        backoffMs: 8000,
      };

      async function* workflowStream() {
        yield retryEvent;
      }
      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workflowStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const events = await collectEvents(
        createBackend(),
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        }),
      );

      expect(events.map((e) => e.type)).toEqual([AgentEventType.Retry]);
    });
  });

  describe('agent mode privilege switching', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;
    let mockUpdateAgentPrivileges: jest.MockedFunction<WorkflowRunner['updateAgentPrivileges']>;

    function createBackend(dangerouslySkipPermissions = true, developer = false): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        // Interactive (non-run) command so mode switching applies per turn.
        command: createFakePartial<ParsedCommand>({ name: 'tui' }),
        dangerouslySkipPermissions,
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>({ developer }),
        createFakePartial<ProjectService>({
          getProjectFromPathWithNamespace:
            jest.fn<ProjectService['getProjectFromPathWithNamespace']>(),
        }),
        createFakePartial<RootNamespaceIdService>({
          resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
        }),
        createFakePartial<WorkflowEventMapper>({
          mapWorkflowEvent: jest
            .fn<WorkflowEventMapper['mapWorkflowEvent']>()
            .mockResolvedValue([]),
        }),
        createFakePartial<SystemContextManager>({
          getSystemContextItems: async () => [],
        }),
        createFakePartial<McpManagerWorkflowExecutorAdaptor>({}),
        createFakePartial<GitLabModelManager>({
          initialize: jest.fn<GitLabModelManager['initialize']>().mockResolvedValue(undefined),
          resolveModel: jest.fn<GitLabModelManager['resolveModel']>().mockResolvedValue(undefined),
          getModel: jest
            .fn<GitLabModelManager['getModel']>()
            .mockReturnValue({ modelRef: 'test-model', modelName: 'test-model' }),
        }),
        createFakePartial<DuoAgentPlatformTracker>({
          trackEvent: jest.fn<DuoAgentPlatformTracker['trackEvent']>(),
        }),
      );
    }

    async function drain(backend: GitLabBackend, action: UserAction): Promise<AgentEvent[]> {
      const events: AgentEvent[] = [];
      for await (const event of backend.sendMessageStream(action)) {
        events.push(event);
      }
      return events;
    }

    beforeEach(() => {
      mockLogger = new TestLogger();
      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;
      mockUpdateAgentPrivileges = jest
        .fn<WorkflowRunner['updateAgentPrivileges']>()
        .mockResolvedValue([]);
      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest
          .fn<WorkflowRunner['preCreateWorkflow']>()
          .mockResolvedValue('workflow-123'),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
        runWorkflow: jest
          .fn<WorkflowRunner['runWorkflow']>()
          .mockReturnValue((async function* () {})()),
        updateAgentPrivileges: mockUpdateAgentPrivileges,
      });
    });

    it('updates privileges in place when switching to plan on an existing workflow', async () => {
      const backend = createBackend();

      // Turn 1: build (no agentMode) creates the workflow with full privileges.
      await drain(
        backend,
        createFakePartial<UserAction>({ type: UserActionType.SendPrompt, prompt: 'hi' }),
      );
      // Turn 2: switch to plan.
      await drain(
        backend,
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'plan it',
          agentMode: 'plan',
        }),
      );

      expect(mockUpdateAgentPrivileges).toHaveBeenCalledTimes(1);
      expect(mockUpdateAgentPrivileges).toHaveBeenCalledWith(
        'workflow-123',
        PLAN_AGENT_PRIVILEGES,
        PLAN_AGENT_PRIVILEGES,
      );

      // The workflow is reused, not recreated.
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(1);
      const runCalls = jest.mocked(mockWorkflowRunner.runWorkflow).mock.calls;
      expect(runCalls).toHaveLength(2);
      expect(runCalls[0][0].existingWorkflowId).toBe('workflow-123');
      expect(runCalls[1][0].existingWorkflowId).toBe('workflow-123');
    });

    it('aborts the turn under --developer when the mutation reports errors', async () => {
      // Under --developer the mutation is guaranteed available, so a reported
      // error is a real failure and must abort the turn.
      mockUpdateAgentPrivileges.mockResolvedValue(['workflow not found']);
      const backend = createBackend(true, true);

      await drain(
        backend,
        createFakePartial<UserAction>({ type: UserActionType.SendPrompt, prompt: 'hi' }),
      );
      const events = await drain(
        backend,
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'plan it',
          agentMode: 'plan',
        }),
      );

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toContain('workflow not found');
      // The turn aborts before running the workflow a second time.
      expect(jest.mocked(mockWorkflowRunner.runWorkflow).mock.calls).toHaveLength(1);
    });

    it('degrades gracefully (no --developer) when the mutation fails', async () => {
      // In the standard (non-developer) mode the mode switch may run on older
      // instances without the mutation, so a failed privilege update must degrade
      // to prompt/toolset enforcement instead of aborting the turn.
      mockUpdateAgentPrivileges.mockResolvedValue(['workflow not found']);
      const backend = createBackend();

      await drain(
        backend,
        createFakePartial<UserAction>({ type: UserActionType.SendPrompt, prompt: 'hi' }),
      );
      const events = await drain(
        backend,
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'plan it',
          agentMode: 'plan',
        }),
      );

      expect(events.filter((e) => e.type === AgentEventType.Error)).toHaveLength(0);
      // The turn still runs the workflow despite the failed privilege update.
      expect(jest.mocked(mockWorkflowRunner.runWorkflow).mock.calls).toHaveLength(2);
    });

    it('sets a privilege baseline when resuming a stored session', async () => {
      const backend = createBackend();

      await backend.initialize('resumed-workflow-456');

      expect(mockUpdateAgentPrivileges).toHaveBeenCalledTimes(1);
      expect(mockUpdateAgentPrivileges).toHaveBeenCalledWith(
        'resumed-workflow-456',
        HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
        HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
      );
    });

    it('does not pre-approve privileges when permissions are not skipped', async () => {
      // Without --dangerously-skip-permissions the create path leaves the
      // pre-approved set empty, so updating privileges must not silently
      // pre-approve every tool (which would bypass per-tool approval prompts).
      const backend = createBackend(false);

      await drain(
        backend,
        createFakePartial<UserAction>({ type: UserActionType.SendPrompt, prompt: 'hi' }),
      );
      await drain(
        backend,
        createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'plan it',
          agentMode: 'plan',
        }),
      );

      expect(mockUpdateAgentPrivileges).toHaveBeenCalledWith(
        'workflow-123',
        PLAN_AGENT_PRIVILEGES,
        [],
      );
    });

    it('does not reject the session when the initial privilege update fails', async () => {
      mockUpdateAgentPrivileges.mockResolvedValue(['boom']);
      const backend = createBackend();

      const result = await backend.initialize('resumed-workflow-456');

      expect(result.sessionId).toBe('resumed-workflow-456');
      expect(result.sessionRejectionReason).toBeUndefined();
    });
  });

  describe('workflow ID reset after terminal workflow states', () => {
    let mockLogger: TestLogger;
    let mockWorkflowRunner: WorkflowRunner;
    let mockConfigService: ConfigService;
    let mockWorkflowEventMapper: WorkflowEventMapper;

    function createBackend(): GitLabBackend {
      const mockCliInput = createFakePartial<ParsedCliInput>({
        cwd: '/test',
        command: createFakePartial<ParsedCommand>({ name: 'run', goal: 'test goal' }),
      });

      return new GitLabBackend(
        mockLogger,
        mockWorkflowRunner,
        mockConfigService,
        mockCliInput,
        createFakePartial<GitLabParsedOptions>({}),
        createFakePartial<ProjectService>({
          getProjectFromPathWithNamespace:
            jest.fn<ProjectService['getProjectFromPathWithNamespace']>(),
        }),
        createFakePartial<RootNamespaceIdService>({
          resolve: jest.fn<RootNamespaceIdService['resolve']>().mockResolvedValue(''),
        }),
        mockWorkflowEventMapper,
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

    async function collectEvents(
      backend: GitLabBackend,
      action: UserAction,
    ): Promise<AgentEvent[]> {
      const events: AgentEvent[] = [];
      for await (const event of backend.sendMessageStream(action)) {
        events.push(event);
      }
      return events;
    }

    beforeEach(() => {
      mockLogger = new TestLogger();
      mockConfigService = {
        get: jest.fn<() => string | undefined>().mockReturnValue(undefined),
        set: jest.fn(),
      } as Partial<ConfigService> as ConfigService;
      mockWorkflowEventMapper = createFakePartial<WorkflowEventMapper>({
        mapWorkflowEvent: jest.fn<WorkflowEventMapper['mapWorkflowEvent']>().mockResolvedValue([]),
      });
      mockWorkflowRunner = createFakePartial<WorkflowRunner>({
        preCreateWorkflow: jest
          .fn<WorkflowRunner['preCreateWorkflow']>()
          .mockResolvedValue('new-workflow-id'),
        getServerCapabilities: jest
          .fn<WorkflowRunner['getServerCapabilities']>()
          .mockReturnValue(null),
        runWorkflow: jest.fn<WorkflowRunner['runWorkflow']>(),
      });
    });

    it.each([
      ['FAILED', DuoWorkflowStatus.FAILED],
      ['STOPPED', DuoWorkflowStatus.STOPPED],
      ['FINISHED', DuoWorkflowStatus.FINISHED],
    ])('%s causes the next message to start a fresh workflow', async (_label, terminatedStatus) => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      async function* stalledStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: terminatedStatus,
          checkpoint: '{}',
          errors: [],
        });
      }
      async function* emptyStream() {
        // yields nothing — simulates a fresh workflow with no checkpoints yet
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(stalledStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'stale-workflow-id' });
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['INPUT_REQUIRED', DuoWorkflowStatus.INPUT_REQUIRED],
      ['PLAN_APPROVAL', DuoWorkflowStatus.PLAN_APPROVAL],
      ['TOOL_APPROVAL', DuoWorkflowStatus.TOOL_APPROVAL],
    ])(
      '%s preserves the workflow ID so the next message continues on the same workflow',
      async (_label, pauseStatus) => {
        const backend = createBackend();
        await backend.initialize('active-workflow-id');

        async function* pausedStream() {
          yield createFakePartial<DuoWorkflowEvent>({
            workflowStatus: pauseStatus,
            checkpoint: '{}',
            errors: [],
          });
        }
        async function* emptyStream() {
          // yields nothing
        }

        jest
          .mocked(mockWorkflowRunner.runWorkflow)
          .mockReturnValueOnce(pausedStream() as ReturnType<WorkflowRunner['runWorkflow']>)
          .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

        const prompt = createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        });

        await collectEvents(backend, prompt);
        await collectEvents(backend, prompt);

        const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'active-workflow-id' });
        expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'active-workflow-id' });
        expect(mockWorkflowRunner.preCreateWorkflow).not.toHaveBeenCalled();
      },
    );

    const RESUMED_SESSION_MESSAGE =
      'Previous session has ended and cannot be resumed. Your next message will start a fresh conversation.';

    it.each([
      ['a terminal checkpoint (FAILED)', DuoWorkflowStatus.FAILED],
      ['a terminal checkpoint (STOPPED)', DuoWorkflowStatus.STOPPED],
      ['a terminal checkpoint (FINISHED)', DuoWorkflowStatus.FINISHED],
    ])(
      'shows a friendly message (not the raw server error) when a resumed session ends with %s',
      async (_label, terminatedStatus) => {
        const backend = createBackend();
        await backend.initialize('stale-workflow-id');

        async function* stalledStream() {
          yield createFakePartial<DuoWorkflowEvent>({
            workflowStatus: terminatedStatus,
            checkpoint: '{}',
            errors: ['Stalled workflow can not be executed. Please create a new workflow.'],
          });
        }

        jest
          .mocked(mockWorkflowRunner.runWorkflow)
          .mockReturnValue(stalledStream() as ReturnType<WorkflowRunner['runWorkflow']>);

        const prompt = createFakePartial<UserAction>({
          type: UserActionType.SendPrompt,
          prompt: 'hello',
        });

        const events = await collectEvents(backend, prompt);

        const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
        expect(errorEvents).toHaveLength(1);
        expect(errorEvents[0].message).toBe(RESUMED_SESSION_MESSAGE);
        expect(mockWorkflowEventMapper.mapWorkflowEvent).not.toHaveBeenCalled();
      },
    );

    it('shows a friendly message when a resumed session ends with a WorkflowExecutorError', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      async function* errorStream() {
        yield new WorkflowExecutorError(
          'Stalled workflow can not be executed',
          WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR,
        );
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(errorStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const events = await collectEvents(backend, prompt);

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe(RESUMED_SESSION_MESSAGE);
    });

    it('shows the raw server error (not the friendly message) when a fresh session encounters a WorkflowExecutorError', async () => {
      const backend = createBackend();
      // No initialize() call — fresh session, #workflowId starts undefined

      const rawErrorMessage = 'Connection dropped unexpectedly';
      async function* errorStream() {
        yield new WorkflowExecutorError(
          rawErrorMessage,
          WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
        );
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(errorStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const events = await collectEvents(backend, prompt);

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe(rawErrorMessage);
    });

    it('does not show the friendly message when a resumed session does real work before reaching FINISHED', async () => {
      const backend = createBackend();
      await backend.initialize('active-workflow-id');

      async function* workingStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.RUNNING,
          checkpoint: '{}',
          errors: [],
        });
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.FINISHED,
          checkpoint: '{}',
          errors: [],
        });
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValue(workingStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const events = await collectEvents(backend, prompt);

      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(0);
      expect(mockWorkflowEventMapper.mapWorkflowEvent).toHaveBeenCalledTimes(2);
    });

    it('a non-transient WorkflowExecutorError causes the next message to start a fresh workflow', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      async function* errorStream() {
        yield new WorkflowExecutorError(
          'Stalled workflow can not be executed',
          WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR,
        );
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(errorStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'stale-workflow-id' });
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(1);
    });

    it('preserves the workflow ID when a non-resumed session encounters a transient WorkflowExecutorError', async () => {
      const backend = createBackend();
      // initialize() without a session ID pre-creates the workflow and stores it in #workflowId
      await backend.initialize();

      async function* droppedStream() {
        yield new WorkflowExecutorError(
          'Connection dropped',
          WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
        );
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(droppedStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls).toHaveLength(2);
      // The same workflow ID is reused — the transient error did not force a fresh workflow
      expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(1);
    });

    it('preserves the workflow ID when a non-resumed session encounters a generic exception', async () => {
      const backend = createBackend();
      // initialize() without a session ID pre-creates the workflow and stores it in #workflowId
      await backend.initialize();

      async function* throwingStream() {
        throw new Error('Unexpected runtime error');
        // eslint-disable-next-line no-unreachable
        yield createFakePartial<DuoWorkflowEvent>({});
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(throwingStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls).toHaveLength(2);
      // The same workflow ID is reused — a generic exception does not force a fresh workflow
      expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'new-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(1);
    });

    it('shows the raw transient error (not the friendly message) when a resumed session hits a transient WorkflowExecutorError', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      const transientMessage = 'Connection dropped';
      async function* droppedStream() {
        yield new WorkflowExecutorError(
          transientMessage,
          WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
        );
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(droppedStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const events = await collectEvents(backend, prompt);
      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      // A transient error leaves the workflow alive, so the next message reuses it.
      // The "session ended" message would contradict that — show the real error.
      expect(errorEvents[0].message).toBe(transientMessage);
      expect(errorEvents[0].message).not.toBe(RESUMED_SESSION_MESSAGE);

      await collectEvents(backend, prompt);
      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'stale-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).not.toHaveBeenCalled();
    });

    it('still shows the friendly message on the retry when a resumed session hits a transient error before the terminal checkpoint', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      async function* droppedStream() {
        yield new WorkflowExecutorError(
          'Connection dropped',
          WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
        );
      }
      async function* stalledStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.FAILED,
          checkpoint: '{}',
          errors: ['Stalled workflow can not be executed. Please create a new workflow.'],
        });
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(droppedStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValueOnce(stalledStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const firstEvents = await collectEvents(backend, prompt);
      expect(firstEvents.filter((e) => e.type === AgentEventType.Error)[0].message).toBe(
        'Connection dropped',
      );

      // The transient error did not resolve the resume probe, so the retry that
      // receives the real terminal checkpoint must still surface the friendly
      // message rather than silently mapping the empty checkpoint to nothing.
      const retryEvents = await collectEvents(backend, prompt);
      const retryErrors = retryEvents.filter((e) => e.type === AgentEventType.Error);
      expect(retryErrors).toHaveLength(1);
      expect(retryErrors[0].message).toBe(RESUMED_SESSION_MESSAGE);
      expect(mockWorkflowEventMapper.mapWorkflowEvent).not.toHaveBeenCalled();
    });

    it('still shows the friendly message on the retry when a resumed session hits SandboxUnavailableError before the terminal checkpoint', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      async function* stalledStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.FAILED,
          checkpoint: '{}',
          errors: ['Stalled workflow can not be executed. Please create a new workflow.'],
        });
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockImplementationOnce(() => {
          throw new SandboxUnavailableError('Sandbox unavailable', 'missing_dependencies');
        })
        .mockReturnValueOnce(stalledStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);

      const retryEvents = await collectEvents(backend, prompt);
      const retryErrors = retryEvents.filter((e) => e.type === AgentEventType.Error);
      expect(retryErrors).toHaveLength(1);
      expect(retryErrors[0].message).toBe(RESUMED_SESSION_MESSAGE);
    });

    it('shows the sandbox error (not the friendly message) and keeps the workflow when a resumed session hits SandboxUnavailableError', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');

      const sandboxMessage =
        'Sandbox is enabled but sandbox provider is not available (missing_dependencies).';
      jest.mocked(mockWorkflowRunner.runWorkflow).mockImplementation(() => {
        throw new SandboxUnavailableError(sandboxMessage, 'missing_dependencies');
      });

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      const events = await collectEvents(backend, prompt);
      const errorEvents = events.filter((e) => e.type === AgentEventType.Error);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe(sandboxMessage);
      expect(errorEvents[0].message).not.toBe(RESUMED_SESSION_MESSAGE);

      // The workflow is not terminated by an environment error, so the next
      // message must still reuse it rather than starting a fresh conversation.
      await collectEvents(backend, prompt);
      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'stale-workflow-id' });
      expect(mockWorkflowRunner.preCreateWorkflow).not.toHaveBeenCalled();
    });

    it('starts a fresh workflow on the next message after a non-resumed session reaches FINISHED', async () => {
      const backend = createBackend();
      jest
        .mocked(mockWorkflowRunner.preCreateWorkflow)
        .mockResolvedValueOnce('workflow-1')
        .mockResolvedValueOnce('workflow-2');
      await backend.initialize();

      async function* finishingStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.RUNNING,
          checkpoint: '{}',
          errors: [],
        });
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.FINISHED,
          checkpoint: '{}',
          errors: [],
        });
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(finishingStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      const { calls } = jest.mocked(mockWorkflowRunner.runWorkflow).mock;
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toMatchObject({ existingWorkflowId: 'workflow-1' });
      expect(calls[1][0]).toMatchObject({ existingWorkflowId: 'workflow-2' });
      expect(mockWorkflowRunner.preCreateWorkflow).toHaveBeenCalledTimes(2);
    });

    it('getSessionId reflects the fresh workflow after a resumed dead session is recovered', async () => {
      const backend = createBackend();
      await backend.initialize('stale-workflow-id');
      expect(backend.getSessionId()).toBe('stale-workflow-id');

      async function* stalledStream() {
        yield createFakePartial<DuoWorkflowEvent>({
          workflowStatus: DuoWorkflowStatus.FAILED,
          checkpoint: '{}',
          errors: [],
        });
      }
      async function* emptyStream() {
        // yields nothing
      }

      jest
        .mocked(mockWorkflowRunner.runWorkflow)
        .mockReturnValueOnce(stalledStream() as ReturnType<WorkflowRunner['runWorkflow']>)
        .mockReturnValue(emptyStream() as ReturnType<WorkflowRunner['runWorkflow']>);

      const prompt = createFakePartial<UserAction>({
        type: UserActionType.SendPrompt,
        prompt: 'hello',
      });

      await collectEvents(backend, prompt);
      await collectEvents(backend, prompt);

      expect(backend.getSessionId()).toBe('new-workflow-id');
    });
  });
});
