import { AbortError } from './errors/abort_error';
import { retry } from './retry';

jest.useFakeTimers();

/**
 * this function catches and returns the promise to defuse the Jest automatic reporting of unhandled promises
 * it doesn't affect the result, it only makes sure that jest knows we caught it using the `.catch()` callback
 * https://github.com/jestjs/jest/issues/6028#issuecomment-804348701
 */
function defuse<T>(promise: Promise<T>) {
  promise.catch(() => {});
  return promise;
}

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('should resolve immediately if the factory succeeds on first attempt', async () => {
    const factory = jest.fn().mockResolvedValue('success');

    const retryPromise = retry(factory);

    const result = await retryPromise;

    expect(result).toBe('success');
  });

  it('should retry when the factory fails', async () => {
    const error = new Error('test error');
    const factory = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');
    const onRetry = jest.fn();

    const retryPromise = retry(factory, { onRetry });

    await jest.runAllTimersAsync();
    const result = await retryPromise;

    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalledWith(1, error);
  });

  it('should use exponential backoff between retries', async () => {
    const error = new Error('test error');
    const factory = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    const retryPromise = retry(factory, { backoffBaseMs: 100, backoffExponent: 2 });

    // nothing happens after 99ms
    await jest.advanceTimersByTimeAsync(99);
    expect(factory).toHaveReturnedTimes(1);

    // after 100ms we retry
    await jest.advanceTimersByTimeAsync(1);
    expect(factory).toHaveReturnedTimes(2);

    // now the exponential backoff is 200ms so nothing should happen after 199ms
    await jest.advanceTimersByTimeAsync(199);
    expect(factory).toHaveReturnedTimes(2);

    // after 200ms we retry for the second time
    await jest.advanceTimersByTimeAsync(1);
    expect(factory).toHaveReturnedTimes(3);

    const result = await retryPromise;

    expect(result).toBe('success');
  });

  it('should respect the max number of retries', async () => {
    const error = new Error('test error');
    const factory = jest.fn().mockRejectedValue(error);

    const retryPromise = defuse(retry(factory, { max: 3 }));

    await jest.runAllTimersAsync();

    await expect(retryPromise).rejects.toThrow(error);
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('should not retry if shouldRetry returns false', async () => {
    const error = new Error('test error');
    const factory = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');
    const shouldRetry = jest.fn().mockReturnValue(false);

    const retryPromise = defuse(retry(factory, { shouldRetry }));

    await jest.runAllTimersAsync();

    await expect(retryPromise).rejects.toThrow(error);

    expect(shouldRetry).toHaveBeenCalledWith(error);
  });

  describe('Abort behaviour', () => {
    let abortController: AbortController;

    beforeEach(() => {
      abortController = new AbortController();
    });
    it('should not retry AbortError by default', async () => {
      const error = new AbortError();
      const factory = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

      const retryPromise = defuse(retry(factory));

      await jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow(error);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should abort when signal is aborted before start', async () => {
      const factory = jest.fn().mockResolvedValue('success');

      abortController.abort();

      const retryPromise = defuse(retry(factory, { signal: abortController.signal }));

      await jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow(AbortError);

      expect(factory).not.toHaveBeenCalled();
    });

    it('should abort when signal is aborted during factory execution', async () => {
      const factory = jest.fn().mockImplementation(async () => {
        abortController.abort();
        return 'success';
      });

      const retryPromise = defuse(retry(factory, { signal: abortController.signal }));

      await jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow(AbortError);
    });

    it('should abort during retry waiting period', async () => {
      const error = new Error('test error');

      const factory = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

      const retryPromise = defuse(
        retry(factory, {
          signal: abortController.signal,
        }),
      );

      // First attempt fails
      expect(factory).toHaveBeenCalledTimes(1);

      // pretend that we waited almost the full 1000ms backoff
      await jest.advanceTimersByTimeAsync(999);

      // Abort during wait period
      abortController.abort();

      await jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow(AbortError);
    });

    it('should pass the abort signal to the factory function', async () => {
      const factory = jest.fn().mockResolvedValue('success');

      const retryPromise = retry(factory, { signal: abortController.signal });

      // Run any pending timers (there shouldn't be any since the first attempt succeeds)
      await jest.runAllTimersAsync();

      await retryPromise;

      expect(factory).toHaveBeenCalledWith(abortController.signal);
    });
  });

  it('should increment attempt number correctly', async () => {
    const error = new Error('test error');
    const factory = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');
    const onRetry = jest.fn();

    const retryPromise = retry(factory, { onRetry });

    await jest.runAllTimersAsync();

    expect(onRetry).toHaveBeenNthCalledWith(1, 1, error);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, error);

    await expect(retryPromise).resolves.toBe('success');
  });
});
