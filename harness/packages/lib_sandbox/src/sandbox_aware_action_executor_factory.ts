import { collection, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import {
  ActionExecutor,
  ActionExecutorFactory,
  DirectActionExecutor,
} from '@gitlab-org/workflow-executor';
import { WorkflowActionHandler } from '@gitlab-org/workflow-executor/node';
import { SandboxViolations } from '@gitlab-org/workflow-executor/violations';
import { SandboxUnavailableError } from './errors';
import { SandboxAvailabilityService } from './sandbox_availability_service';
import { SandboxedActionExecutor } from './sandboxed_action_executor';
import { WorkerProcessManager } from './worker_process_manager';

@Injectable(ActionExecutorFactory, [
  Logger,
  collection(WorkflowActionHandler),
  SandboxAvailabilityService,
  WorkerProcessManager,
  ConfigService,
  SandboxViolations,
])
export class SandboxAwareActionExecutorFactory implements ActionExecutorFactory {
  #logger: Logger;

  #directExecutor: DirectActionExecutor;

  #sandboxAvailability: SandboxAvailabilityService;

  #workerManager: WorkerProcessManager;

  #configService: ConfigService;

  #sandboxViolations: SandboxViolations;

  constructor(
    logger: Logger,
    handlers: WorkflowActionHandler[],
    sandboxAvailability: SandboxAvailabilityService,
    workerManager: WorkerProcessManager,
    configService: ConfigService,
    sandboxViolations: SandboxViolations,
  ) {
    this.#logger = withPrefix(logger, '[ActionExecutorFactory]');
    this.#directExecutor = new DirectActionExecutor(handlers, logger);
    this.#sandboxAvailability = sandboxAvailability;
    this.#workerManager = workerManager;
    this.#configService = configService;
    this.#sandboxViolations = sandboxViolations;
  }

  createExecutor(): ActionExecutor {
    const sandboxEnabled = this.#configService.get('duo.sandbox.enabled') ?? false;

    if (!sandboxEnabled) {
      this.#logger.debug('Returning DirectActionExecutor (sandbox not enabled)');
      return this.#directExecutor;
    }

    const status = this.#sandboxAvailability.getStatus();

    if (!status.available) {
      throw new SandboxUnavailableError(
        `Sandbox is enabled but sandbox provider is not available (${status.reason}).`,
        status.reason,
      );
    }

    this.#logger.debug('Creating SandboxedActionExecutor');
    return new SandboxedActionExecutor(this.#workerManager, this.#sandboxViolations, this.#logger);
  }
}
