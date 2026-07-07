import React from 'react';
import { Box, Text, Newline } from 'ink';

interface ErrorMessageProps {
  error: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color="red">✗ Error:</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="red">{error}</Text>
      </Box>
      <Newline />
    </Box>
  );
};
