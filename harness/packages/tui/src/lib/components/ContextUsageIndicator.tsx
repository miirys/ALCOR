import React from 'react';
import { Text } from 'ink';
import type { ContextUsage } from '../../types';

interface ContextUsageIndicatorProps {
  contextUsage?: ContextUsage;
}

/** Only surface the context-window percentage once it reaches this level. */
const VISIBILITY_THRESHOLD_PERCENT = 50;

/**
 * Status-bar indicator showing how much of the agent's context window is in
 * use ("73% context used"). Absolute token counts are never shown.
 */
export const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = React.memo(
  ({ contextUsage }) => {
    if (!contextUsage) return null;

    const { totalTokens, maxTokens } = contextUsage;
    if (!Number.isFinite(totalTokens) || !Number.isFinite(maxTokens) || maxTokens <= 0) {
      return null;
    }

    const percent = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
    if (percent < VISIBILITY_THRESHOLD_PERCENT) return null;

    // Neutral while comfortable; amber then red as the window fills.
    let color: string | undefined;
    if (percent >= 90) color = 'red';
    else if (percent >= 75) color = 'yellow';

    return (
      <Text dimColor={!color} color={color}>
        CTX {percent}%
      </Text>
    );
  },
);
