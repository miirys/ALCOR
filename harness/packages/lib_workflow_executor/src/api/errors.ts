/* eslint-disable max-classes-per-file */
import { classifyDuoAccessError } from '@gitlab-org/core';

export class AgenticChatForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgenticChatForbiddenError';
  }
}

export function isAgenticChatForbiddenError(error: unknown): error is AgenticChatForbiddenError {
  return error instanceof AgenticChatForbiddenError;
}

export class NoDuoNamespaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoDuoNamespaceError';
  }
}

export function isNoDuoNamespaceError(error: unknown): error is NoDuoNamespaceError {
  return error instanceof NoDuoNamespaceError;
}

// Does nothing when the failure is not a Duo access problem, so callers fall through to their
// existing handling.
export function throwIfDuoAccessError(status: number | undefined, body: string | undefined): void {
  const duoError = classifyDuoAccessError(status, body);
  if (!duoError) {
    return;
  }
  if (duoError.kind === 'no_namespace') {
    throw new NoDuoNamespaceError(duoError.message);
  }
  throw new AgenticChatForbiddenError(duoError.message);
}

export class DuoCliDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuoCliDisabledError';
  }
}

export function isDuoCliDisabledError(error: unknown): error is DuoCliDisabledError {
  return error instanceof DuoCliDisabledError;
}
