export class SanitizedError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.originalError = originalError;
  }
}
