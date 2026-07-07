import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import type { RetryStatus } from '../../types';

interface RetryStatusIndicatorProps {
  retryStatus: RetryStatus;
}

const computeRemainingMs = (retryStatus: RetryStatus): number =>
  retryStatus.backoffMs - (Date.now() - retryStatus.startedAt);

/**
 * Status-bar indicator shown while the workflow executor is backing off before
 * a retry. Displays a live countdown ("Error, retrying 3/5 in 4s...") counting
 * down to "in 1s", then drops the countdown segment once the backoff elapses
 * ("Error, retrying 3/5..."). The countdown is driven by a self-contained interval
 * that is torn down on unmount. This component is only mounted while a retry is
 * pending (the caller conditionally renders it), so `retryStatus` is always set.
 */
export const RetryStatusIndicator: React.FC<RetryStatusIndicatorProps> = ({ retryStatus }) => {
  const [remainingMs, setRemainingMs] = useState<number>(() => computeRemainingMs(retryStatus));

  useEffect(() => {
    setRemainingMs(computeRemainingMs(retryStatus));

    const interval = setInterval(() => {
      const next = computeRemainingMs(retryStatus);
      setRemainingMs(next);
      if (next <= 0) {
        clearInterval(interval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [retryStatus]);

  const { attempt, maxAttempts } = retryStatus;
  // Show the countdown until the backoff actually elapses
  const countdown = remainingMs > 0 ? ` in ${Math.ceil(remainingMs / 1000)}s` : '';
  const label = `Error, retrying ${attempt}/${maxAttempts}${countdown}...`;

  return <Text color="red">{label}</Text>;
};
