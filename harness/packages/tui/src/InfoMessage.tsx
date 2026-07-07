import React from 'react';
import { Box, Text, Newline } from 'ink';

interface InfoMessageProps {
  message: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ message }) => {
  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text dimColor>◇ {message}</Text>
      </Box>
      <Newline />
    </Box>
  );
};
