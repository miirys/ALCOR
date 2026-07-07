import { asyncDebounce } from './async_debounce';

describe('asyncDebounce', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('should debounce async function calls', async () => {
    const mockFn = jest.fn().mockResolvedValue('result');
    const debouncedFn = asyncDebounce(mockFn, 1000);

    const promise1 = debouncedFn('arg1');
    const promise2 = debouncedFn('arg2');
    const promise3 = debouncedFn('arg3');

    jest.advanceTimersByTime(999);
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.all([promise1, promise2, promise3]);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg3');
  });

  it('should resolve with the correct value', async () => {
    const mockFn = jest.fn().mockResolvedValue('result');
    const debouncedFn = asyncDebounce(mockFn, 1000);

    const promise = debouncedFn('arg');
    jest.runAllTimers();
    const result = await promise;

    expect(result).toBe('result');
  });

  it('should reject when the original function throws', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
    const debouncedFn = asyncDebounce(mockFn, 1000);

    const promise = debouncedFn('arg');
    jest.runAllTimers();

    await expect(promise).rejects.toThrow('Test error');
  });

  describe('with different wait times', () => {
    test.each([
      [500, 499, 1],
      [1000, 999, 1],
      [1500, 1499, 1],
    ])('should debounce for %dms', async (wait, advanceBy, remainingTime) => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncedFn = asyncDebounce(mockFn, wait);

      const promise = debouncedFn('arg');
      jest.advanceTimersByTime(advanceBy);
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(remainingTime);
      await promise;

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg');
    });
  });

  it('should work with functions that take multiple arguments', async () => {
    const mockFn = jest.fn().mockResolvedValue('result');
    const debouncedFn = asyncDebounce(mockFn, 1000);

    const promise = debouncedFn('arg1', 'arg2', 3);
    jest.runAllTimers();
    await promise;

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2', 3);
  });

  it('should maintain the correct "this" context', async () => {
    const obj = {
      value: 'test',
      asyncMethod: jest.fn().mockResolvedValue('result'),
    };

    const debouncedMethod = asyncDebounce(obj.asyncMethod, 1000);

    const promise = debouncedMethod.call(obj, 'arg');
    jest.runAllTimers();
    await promise;

    expect(obj.asyncMethod).toHaveBeenCalledWith('arg');
    expect(obj.asyncMethod.mock.instances[0]).toBe(obj);
  });
});
