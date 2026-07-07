import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  SANDBOX_UNSUPPORTED_PLATFORM,
  SandboxPlatform,
  SandboxUnsupportedPlatformCheckContext,
} from '@gitlab-org/core';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from '../sandbox_availability_service';
import { SandboxStateCheck, SandboxStateCheckChangedEventData } from './state_check';

export type SandboxUnsupportedPlatformCheck = SandboxStateCheck<
  typeof SANDBOX_UNSUPPORTED_PLATFORM
>;

export const SandboxUnsupportedPlatformCheck = createInterfaceId<SandboxUnsupportedPlatformCheck>(
  'SandboxUnsupportedPlatformCheck',
);

// Platforms that cannot run the sandbox runtime. Kept in sync with
// SandboxAvailabilityService's `reason: 'unsupported_platform'` branch.
const UNSUPPORTED_PLATFORMS: ReadonlySet<SandboxPlatform> = new Set(['windows', 'unsupported']);

@Injectable(SandboxUnsupportedPlatformCheck, [SandboxAvailabilityService, Logger])
export class DefaultSandboxUnsupportedPlatformCheck
  implements SandboxUnsupportedPlatformCheck, Disposable
{
  readonly id = SANDBOX_UNSUPPORTED_PLATFORM;

  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #platform: SandboxPlatform;

  constructor(availabilityService: SandboxAvailabilityService, logger: Logger) {
    this.#logger = withPrefix(logger, '[SandboxUnsupportedPlatformCheck]');
    this.#platform = availabilityService.getStatus().platform;
    this.#logger.debug(`Initialised with platform=${this.#platform}, engaged=${this.engaged}`);

    this.#subscriptions.push(
      availabilityService.onStatusChanged((status) => this.#applyStatus(status)),
    );
  }

  get engaged(): boolean {
    return UNSUPPORTED_PLATFORMS.has(this.#platform);
  }

  get details(): string {
    return this.engaged
      ? `Process sandboxing is not supported on ${this.#platform}.`
      : `Process sandboxing is supported on ${this.#platform}.`;
  }

  get context(): SandboxUnsupportedPlatformCheckContext | undefined {
    if (this.#platform !== 'windows' && this.#platform !== 'unsupported') return undefined;
    return { platform: this.#platform };
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

  #applyStatus(status: SandboxAvailabilityStatus): void {
    if (status.platform === this.#platform) return;

    const wasEngaged = this.engaged;
    this.#platform = status.platform;
    this.#logger.debug(`Platform changed: ${this.#platform}, engaged=${this.engaged}`);
    if (wasEngaged === this.engaged) return;

    this.#stateEmitter.emit('change', {
      checkId: this.id,
      engaged: this.engaged,
      details: this.details,
    });
  }
}
