import React from 'react';
import { Box, Text } from 'ink';
import { formatTimeAgo } from '@gitlab-org/core';
import type { SessionListItem } from '../types';

interface SessionItemProps {
  item: SessionListItem;
  isSelected: boolean;
}

export const SessionItem: React.FC<SessionItemProps> = ({ item, isSelected }) => {
  return (
    <Box
      flexDirection="column"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderStyle="bold"
      borderColor={isSelected ? 'white' : 'blackBright'}
      paddingLeft={1}
    >
      <Box gap={1} justifyContent="space-between">
        <Text bold={isSelected} wrap="truncate">
          {item.title.replaceAll(/[\r\n]+/g, ' ')}
        </Text>
        <Box flexShrink={0}>
          <Text dimColor={!isSelected} bold={isSelected}>
            {formatTimeAgo(item.lastActivity)} · #{item.id}
          </Text>
        </Box>
      </Box>
      {item.lastMessagePreview ? (
        <Text dimColor italic wrap="truncate">
          {item.lastMessagePreview}
        </Text>
      ) : null}
    </Box>
  );
};
