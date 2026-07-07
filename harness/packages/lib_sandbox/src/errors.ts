import type { SandboxAvailabilityStatus } from './sandbox_availability_service';

export type SandboxUnavailableReason = Extract<
  SandboxAvailabilityStatus,
  { available: false }
>['reason'];

export class SandboxUnavailableError extends Error {
  readonly reason: SandboxUnavailableReason;

  constructor(message: string, reason: SandboxUnavailableReason) {
    super(message);
    this.name = 'SandboxUnavailableError';
    this.reason = reason;

    Error.captureStackTrace?.(this, SandboxUnavailableError);
  }
}

export function isSandboxUnavailableError(error: unknown): error is SandboxUnavailableError {
  return error instanceof SandboxUnavailableError;
}
