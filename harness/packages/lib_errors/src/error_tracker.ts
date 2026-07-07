import { createInterfaceId, Injectable } from '@gitlab/needle';
import { SanitizedError } from './sanitized_error';

export interface ErrorTracker {
  trackError(e: SanitizedError, additionalData?: Record<string, unknown>): void;
  dispose?(): Promise<void>;
}
export const ErrorTracker = createInterfaceId<ErrorTracker>('ErrorTracker');

@Injectable(ErrorTracker, [])
export class NoopSentryTracker implements ErrorTracker {
  trackError() {}
}
