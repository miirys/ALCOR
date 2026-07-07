import { calculateExponentialBackoff, delay } from './backoff';

describe('backoff utilities', () => {
  describe('delay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves after the specified duration', async () => {
      let resolved = false;
      const promise = delay(1000).then(() => {
        resolved = true;
        return undefined;
      });

      await jest.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      await promise;
      expect(resolved).toBe(true);
    });

    it('resolves immediately when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      await delay(1000, controller.signal);

      // No timer should have been scheduled (nothing to clear from this call).
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('resolves early and clears the timer when aborted during the wait', async () => {
      const controller = new AbortController();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      let resolved = false;
      const promise = delay(5000, controller.signal).then(() => {
        resolved = true;
        return undefined;
      });

      await jest.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      controller.abort();
      await promise;

      expect(resolved).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('calculateExponentialBackoff', () => {
    it('calculates exponential backoff correctly', () => {
      // First attempt should be base delay
      const delay1 = calculateExponentialBackoff(1, 1000, 2);
      expect(delay1).toBe(1000);

      // Second attempt should be base * 2^(2-1) = 1000 * 2 = 2000
      const delay2 = calculateExponentialBackoff(2, 1000, 2);
      expect(delay2).toBe(2000);

      // Third attempt should be base * 2^(3-1) = 1000 * 4 = 4000
      const delay3 = calculateExponentialBackoff(3, 1000, 2);
      expect(delay3).toBe(4000);
    });

    it('uses default parameters correctly', () => {
      const delay1 = calculateExponentialBackoff(1);
      const delay2 = calculateExponentialBackoff(2);
      const delay3 = calculateExponentialBackoff(3);

      // Should use defaults: baseMs=1000, exponent=2
      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });
  });
});
