import React from 'react';
import { Box } from 'ink';

interface StatusBarProps {
  children: React.ReactNode;
}

export const StatusBar: React.FC<StatusBarProps> = ({ children }) => {
  return (
    <Box justifyContent="space-between" gap={2}>
      {children}
    </Box>
  );
};
