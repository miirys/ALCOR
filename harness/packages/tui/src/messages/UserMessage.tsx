import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '../types';
import { getAgentColor, getAgentPrefix, getUserMessageBg } from '../lib/colors';
import { useTheme } from '../lib/theme';

interface UserMessageProps {
  message: MessageType;
  columns?: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message, columns = 80 }) => {
  const theme = useTheme();
  const bg = getUserMessageBg(theme);

  return (
    <Box backgroundColor={bg} width={columns}>
      <Text color={getAgentColor(message.agentMode)} bold>
        {getAgentPrefix(message.agentMode)}
      </Text>
      <Text bold>{message.content}</Text>
    </Box>
  );
};
