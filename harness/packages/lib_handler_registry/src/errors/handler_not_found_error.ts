export class HandlerNotFoundError extends Error {
  readonly type = 'HandlerNotFoundError';

  constructor(key: string) {
    const message = `Handler not found for key ${key}`;
    super(message);
  }
}
