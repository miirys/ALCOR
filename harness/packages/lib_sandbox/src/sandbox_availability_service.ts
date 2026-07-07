import { createInterfaceId } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { SandboxPlatform, SandboxMissingDependency as MissingDependency } from '@gitlab-org/core';

export type { SandboxPlatform } from '@gitlab-org/core';

// Re-exported under the historical name for in-package callers; external
// consumers should import SandboxMissingDependency from @gitlab-org/core.
export type { MissingDependency };

export type SandboxAvailabilityStatus =
  | {
      available: true;
      platform: SandboxPlatform;
      provider: string;
      providerVersion: string | undefined;
    }
  | {
      available: false;
      platform: SandboxPlatform;
      reason: 'unsupported_platform' | 'missing_dependencies' | 'detection_failed';
      missingDependencies: MissingDependency[];
    };

export interface SandboxAvailabilityService {
  getStatus(): SandboxAvailabilityStatus;
  refresh(): Promise<void>;
  // Fires after refresh() if the status changed. Listeners receive the new
  // status so they can recompute derived state (e.g. feature state checks).
  onStatusChanged(listener: (status: SandboxAvailabilityStatus) => void): Disposable;
}

export const SandboxAvailabilityService = createInterfaceId<SandboxAvailabilityService>(
  'SandboxAvailabilityService',
);
