export {};

declare global {
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R> {
      toEventuallyMatchOutput(pattern: RegExp, timeout?: number): Promise<void>;
    }
  }
}
