import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors } from '../colors';

export const WelcomeMessage: React.FC = () => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  return (
    <Box
      borderStyle="round"
      borderColor={colors.faint}
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
      width={Math.min(columns, 120)}
    >
      <Text bold color={colors.accent}>
        ✦ ALCOR
      </Text>
      <Text color={colors.dim}>
        Get help with code, planning, security, project management, and more. Ask a question or hand
        ALCOR a task — type / for commands, Tab to switch modes.
      </Text>
    </Box>
  );
};
