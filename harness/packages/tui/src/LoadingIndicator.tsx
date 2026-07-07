import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInterval } from './lib/hooks/use_interval';
import { colors } from './lib/colors';

/**
 * ALCOR thinking animation: a star that pulses while trailing dots cycle,
 * so the indicator visibly animates even in monochrome terminals.
 */
export const THINKING_FRAMES = [
  '✦ Thinking ·',
  '✧ Thinking ··',
  '✶ Thinking ···',
  '✧ Thinking ··',
] as const;

const FRAME_INTERVAL_MS = 300;

export const LoadingIndicator: React.FC = () => {
  const [frame, setFrame] = useState(0);

  useInterval(() => {
    setFrame((previous) => (previous + 1) % THINKING_FRAMES.length);
  }, FRAME_INTERVAL_MS);

  return (
    <Box>
      <Text color={colors.accentDim}>{THINKING_FRAMES[frame]}</Text>
    </Box>
  );
};
