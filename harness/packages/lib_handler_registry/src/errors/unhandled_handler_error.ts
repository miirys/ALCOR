export class UnhandledHandlerError extends Error {
  readonly type = 'UnhandledHandlerError';

  originalError: Error;

  constructor(handlerId: string, originalError: Error) {
    super(`Unhandled error in handler '${handlerId}': ${originalError.message}`);
    this.name = 'UnhandledHandlerError';
    this.originalError = originalError;
    this.stack = originalError.stack;
  }
}
