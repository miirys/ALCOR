import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../colors';

/** ALCOR wordmark — monochrome silver, sized to fit the header column. */
export const AlcorLogo: React.FC = () => {
  return (
    // prettier-ignore
    <Box flexDirection="column">
      <Text color={colors.accentDim}>          ✦         </Text>
      <Text color={colors.bright}> ▄▀█ █   █▀▀ █▀█ █▀█</Text>
      <Text color={colors.accent}> █▀█ █▄▄ █▄▄ █▄█ █▀▄</Text>
      <Text color={colors.faint}> 80 UMa             </Text>
    </Box>
  );
};

// Alias kept so existing imports and tests keep working.
export const GitLabLogo = AlcorLogo;
