/** this detects both our AbortError defined bellow and an abort error thrown by node when calling `fetch` */
export function isAbortError(object: unknown): object is Error & { name: 'AbortError' } {
  return object instanceof Error && object.name === 'AbortError';
}

export class AbortError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AbortError';
  }
}
