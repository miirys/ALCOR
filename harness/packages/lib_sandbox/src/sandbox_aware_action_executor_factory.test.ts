import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService } from '@gitlab-org/config';
import { DirectActionExecutor } from '@gitlab-org/workflow-executor';
import { WorkflowActionHandler } from '@gitlab-org/workflow-executor/node';
import type { SandboxViolations } from '@gitlab-org/workflow-executor/violations';
import {
  SandboxAvailabilityService,
  type SandboxAvailabilityStatus,
} from './sandbox_availability_service';
import { WorkerProcessManager } from './worker_process_manager';
import { SandboxAwareActionExecutorFactory } from './sandbox_aware_action_executor_factory';
import { SandboxedActionExecutor } from './sandboxed_action_executor';
import { SandboxUnavailableError } from './errors';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {},
}));

describe('SandboxAwareActionExecutorFactory', () => {
  let logger: TestLogger;
  let mockHandlers: WorkflowActionHandler[];
  let mockSandboxAvailability: SandboxAvailabilityService;
  let mockWorkerManager: WorkerProcessManager;
  let mockConfigService: ConfigService;
  let mockSandboxViolations: SandboxViolations;

  beforeEach(() => {
    logger = new TestLogger();
    mockHandlers = [];
    mockSandboxAvailability = createFakePartial<SandboxAvailabilityService>({
      getStatus: jest.fn(),
    });
    mockWorkerManager = createFakePartial<WorkerProcessManager>({
      ensureRunning: jest.fn(),
      shutdown: jest.fn(),
      dispose: jest.fn(),
    });
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(),
    });
    mockSandboxViolations = createFakePartial<SandboxViolations>({
      getSince: jest.fn().mockReturnValue([]),
    });
  });

  function createFactory(): SandboxAwareActionExecutorFactory {
    return new SandboxAwareActionExecutorFactory(
      logger,
      mockHandlers,
      mockSandboxAvailability,
      mockWorkerManager,
      mockConfigService,
      mockSandboxViolations,
    );
  }

  it('returns DirectActionExecutor when sandbox is not enabled', () => {
    const executor = createFactory().createExecutor();

    expect(executor).toBeInstanceOf(DirectActionExecutor);
    expect(mockConfigService.get).toHaveBeenCalledWith('duo.sandbox.enabled');
  });

  it('returns DirectActionExecutor when sandbox is explicitly disabled', () => {
    (mockConfigService.get as jest.Mock).mockReturnValue(false);

    const executor = createFactory().createExecutor();

    expect(executor).toBeInstanceOf(DirectActionExecutor);
  });

  it('throws SandboxUnavailableError when sandbox is enabled but unavailable', () => {
    (mockConfigService.get as jest.Mock).mockReturnValue(true);
    jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue(
      createFakePartial<SandboxAvailabilityStatus>({
        available: false,
        reason: 'missing_dependencies',
        missingDependencies: [],
      }),
    );

    const factory = createFactory();

    expect(() => factory.createExecutor()).toThrow(SandboxUnavailableError);
    expect(() => factory.createExecutor()).toThrow(
      'Sandbox is enabled but sandbox provider is not available (missing_dependencies).',
    );
  });

  it.each(['unsupported_platform', 'detection_failed'] as const)(
    'propagates reason "%s" on the thrown SandboxUnavailableError',
    (reason) => {
      (mockConfigService.get as jest.Mock).mockReturnValue(true);
      jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue(
        createFakePartial<SandboxAvailabilityStatus>({
          available: false,
          reason,
          missingDependencies: [],
        }),
      );

      const factory = createFactory();

      try {
        factory.createExecutor();
        throw new Error('expected createExecutor to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(SandboxUnavailableError);
        expect((error as SandboxUnavailableError).reason).toBe(reason);
        expect((error as SandboxUnavailableError).message).toContain(reason);
      }
    },
  );

  it('returns SandboxedActionExecutor when sandbox is enabled and available', () => {
    (mockConfigService.get as jest.Mock).mockReturnValue(true);
    jest.mocked(mockSandboxAvailability.getStatus).mockReturnValue(
      createFakePartial<SandboxAvailabilityStatus>({
        available: true,
        platform: 'macos',
        provider: 'anthropic-sandbox-runtime',
        providerVersion: '0.0.39',
      }),
    );

    const executor = createFactory().createExecutor();

    expect(executor).toBeInstanceOf(SandboxedActionExecutor);
  });
});
