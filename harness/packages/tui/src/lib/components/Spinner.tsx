import React, { useState } from 'react';
import { Box, Text } from 'ink';
import spinners, { SpinnerName } from 'cli-spinners';
import interpolate from 'color-interpolate';
import { colors } from '../colors';
import { useInterval } from '../hooks/use_interval';

// Monochrome silver shimmer — dim → bright → dim.
const colorFrames = [colors.accentDim, colors.fg, colors.bright, colors.fg, colors.accentDim];

const colormap = interpolate(colorFrames);

const CHANGE_INTERVAL_MS = 250;

interface SpinnerProps {
  changeColors?: boolean;
  spinner?: SpinnerName;
  text?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  changeColors,
  spinner: spinnerName = 'dotsCircle',
  text,
}) => {
  const spinner = spinners[spinnerName];
  const [frame, setFrame] = useState(0);
  const [colorFrame, setColor] = useState(0);
  const color = changeColors ? colormap(colorFrame) : undefined;

  useInterval(() => {
    setFrame((previousFrame) => (previousFrame + 1) % spinner.frames.length);
  }, CHANGE_INTERVAL_MS);

  useInterval(() => {
    setColor((previousColor) => {
      return ((previousColor * 100 + 5) % 100) / 100;
    });
  }, CHANGE_INTERVAL_MS);

  return (
    <Box>
      <Text color={color}>{spinner.frames[frame]}</Text>
      {text && <Text color={color}>{` ${text}`}</Text>}
    </Box>
  );
};
