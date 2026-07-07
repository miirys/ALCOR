import { Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from './sandbox_availability_service';

// Browser / non-desktop fallback. The sandbox runtime is not available in any
// non-Node environment, so report 'unsupported_platform' without attempting
// dependency detection (which would pull in provider-specific Node modules).
@Injectable(SandboxAvailabilityService, [Logger])
export class EmptySandboxAvailabilityService implements SandboxAvailabilityService {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[SandboxAvailability]');
  }

  getStatus(): SandboxAvailabilityStatus {
    return {
      available: false,
      platform: 'unsupported',
      reason: 'unsupported_platform',
      missingDependencies: [],
    };
  }

  async refresh(): Promise<void> {
    this.#logger.debug('refresh() called on empty sandbox availability service; no-op');
  }

  // Empty service has a fixed status, so onStatusChanged never fires.
  onStatusChanged(): Disposable {
    return { dispose: () => {} };
  }
}
