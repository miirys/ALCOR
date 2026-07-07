import { withTimeout } from './with_timeout';

describe('withTimeout', () => {
  it('resolves when the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects when the promise rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('rejects when the timeout elapses before the promise settles', async () => {
    jest.useFakeTimers();

    const hanging = new Promise(() => {});
    const result = withTimeout(hanging, 5000);

    jest.advanceTimersByTime(5000);

    await expect(result).rejects.toThrow('Timed out after 5000ms');

    jest.useRealTimers();
  });

  it('cleans up the timer when the promise resolves first', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    await withTimeout(Promise.resolve('ok'), 1000);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
