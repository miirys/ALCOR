import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  SANDBOX_MISSING_DEPENDENCIES,
  SandboxMissingDependenciesCheckContext,
  SandboxMissingDependency,
} from '@gitlab-org/core';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from '../sandbox_availability_service';
import { SandboxStateCheck, SandboxStateCheckChangedEventData } from './state_check';

export type SandboxMissingDependenciesCheck = SandboxStateCheck<
  typeof SANDBOX_MISSING_DEPENDENCIES
>;

export const SandboxMissingDependenciesCheck = createInterfaceId<SandboxMissingDependenciesCheck>(
  'SandboxMissingDependenciesCheck',
);

@Injectable(SandboxMissingDependenciesCheck, [SandboxAvailabilityService, Logger])
export class DefaultSandboxMissingDependenciesCheck
  implements SandboxMissingDependenciesCheck, Disposable
{
  readonly id = SANDBOX_MISSING_DEPENDENCIES;

  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #status: SandboxAvailabilityStatus;

  constructor(availabilityService: SandboxAvailabilityService, logger: Logger) {
    this.#logger = withPrefix(logger, '[SandboxMissingDependenciesCheck]');
    this.#status = availabilityService.getStatus();
    this.#logger.debug(
      `Initialised with platform=${this.#status.platform}, engaged=${this.engaged}`,
    );

    this.#subscriptions.push(
      availabilityService.onStatusChanged((status) => this.#applyStatus(status)),
    );
  }

  get engaged(): boolean {
    return !this.#status.available && this.#status.reason === 'missing_dependencies';
  }

  get details(): string {
    if (!this.engaged) {
      return 'Process sandbox system dependencies are present.';
    }
    const formatted = this.#missingDependencies
      .map((d) => (d.installHint ? `${d.name} (${d.installHint})` : d.name))
      .join(', ');
    return `Process sandbox is missing required system dependencies: ${formatted}.`;
  }

  // Context is attached on both engaged and healthy states so IDEs can read
  // the detected platform and provider version from `allChecks` regardless of
  // engagement.
  get context(): SandboxMissingDependenciesCheckContext {
    return {
      platform: this.#status.platform,
      missingDependencies: this.#missingDependencies,
      providerVersion: this.#status.available ? this.#status.providerVersion : undefined,
    };
  }

  onChanged(listener: (data: SandboxStateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  dispose(): void {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#subscriptions = [];
  }

  get #missingDependencies(): SandboxMissingDependency[] {
    return this.#status.available ? [] : this.#status.missingDependencies;
  }

  #applyStatus(status: SandboxAvailabilityStatus): void {
    const wasEngaged = this.engaged;
    this.#status = status;
    this.#logger.debug(`Status changed: platform=${status.platform}, engaged=${this.engaged}`);
    if (wasEngaged === this.engaged) return;

    this.#stateEmitter.emit('change', {
      checkId: this.id,
      engaged: this.engaged,
      details: this.details,
    });
  }
}
