import { render } from 'ink-testing-library';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { RetryStatus } from '../../types';
import { RetryStatusIndicator } from './RetryStatusIndicator';

const NOW = 1_000_000;

describe('RetryStatusIndicator', () => {
  let dateNowSpy: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    jest.useFakeTimers();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('when retryStatus has a comfortable remaining time', () => {
    it('renders the countdown label with the ceil-ed seconds', () => {
      // remainingMs = backoffMs - (Date.now() - startedAt) = 4800 - 0 = 4800 → ceil(4.8) = 5
      const retryStatus: RetryStatus = {
        attempt: 2,
        maxAttempts: 5,
        backoffMs: 4800,
        startedAt: NOW,
      };

      const { lastFrame } = render(<RetryStatusIndicator retryStatus={retryStatus} />);

      expect(lastFrame()).toContain('Error, retrying 2/5 in 5s...');
    });
  });

  describe('when one second or less remains (but time is not up)', () => {
    it('still shows "in 1s" rather than skipping straight to no countdown', () => {
      const retryStatus: RetryStatus = {
        attempt: 2,
        maxAttempts: 5,
        backoffMs: 4800,
        startedAt: NOW,
      };

      const component = <RetryStatusIndicator retryStatus={retryStatus} />;
      const { lastFrame, rerender } = render(component);

      // remaining = 4800 - 4000 = 800ms → ceil(0.8) = 1 → "in 1s"
      dateNowSpy.mockReturnValue(NOW + 4000);
      jest.advanceTimersByTime(250);
      rerender(component);

      expect(lastFrame()).toContain('Error, retrying 2/5 in 1s...');
    });
  });

  describe('when the backoff has fully elapsed', () => {
    it('drops the countdown segment but keeps the "Error, retrying N/M" prefix', () => {
      const retryStatus: RetryStatus = {
        attempt: 2,
        maxAttempts: 5,
        backoffMs: 4800,
        startedAt: NOW,
      };

      const component = <RetryStatusIndicator retryStatus={retryStatus} />;
      const { lastFrame, rerender } = render(component);

      expect(lastFrame()).toContain('Error, retrying 2/5 in 5s...');

      // Advance wall-clock past the full backoff (remaining = 4800 - 5000 = -200 ≤ 0).
      dateNowSpy.mockReturnValue(NOW + 5000);
      jest.advanceTimersByTime(250);
      rerender(component);

      expect(lastFrame()).toContain('Error, retrying 2/5...');
      expect(lastFrame()).not.toContain(' in ');
    });
  });

  describe('interval teardown', () => {
    it('clears the interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const retryStatus: RetryStatus = {
        attempt: 1,
        maxAttempts: 3,
        backoffMs: 3000,
        startedAt: NOW,
      };

      const { unmount } = render(<RetryStatusIndicator retryStatus={retryStatus} />);

      const callsBefore = clearIntervalSpy.mock.calls.length;
      unmount();
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(callsBefore);

      clearIntervalSpy.mockRestore();
    });

    it('clears the interval when the retryStatus prop changes (new backoff)', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const retryStatus: RetryStatus = {
        attempt: 1,
        maxAttempts: 3,
        backoffMs: 3000,
        startedAt: NOW,
      };

      const { lastFrame, rerender } = render(<RetryStatusIndicator retryStatus={retryStatus} />);
      expect(lastFrame()).toContain('Error, retrying 1/3');

      const callsBefore = clearIntervalSpy.mock.calls.length;
      // A subsequent retry replaces the status object → effect cleanup tears down
      // the previous interval before a fresh one starts.
      rerender(
        <RetryStatusIndicator
          retryStatus={{ attempt: 2, maxAttempts: 3, backoffMs: 3000, startedAt: NOW }}
        />,
      );

      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(lastFrame()).toContain('Error, retrying 2/3');

      clearIntervalSpy.mockRestore();
    });
  });
});
