import React from 'react';
import { Box, Text } from 'ink';
import { formatTimeAgo } from '@gitlab-org/core';
import type { SessionListItem } from '../types';
import { colors } from '../lib/colors';

interface SessionItemProps {
  item: SessionListItem;
  isSelected: boolean;
}

/** ALCOR menu row: `▌ ● title` with a dim metadata line beneath. */
export const SessionItem: React.FC<SessionItemProps> = ({ item, isSelected }) => {
  return (
    <Box flexDirection="column">
      <Box gap={1} justifyContent="space-between">
        <Text wrap="truncate">
          <Text color={isSelected ? colors.accent : colors.faint}>{isSelected ? '▌ ' : '  '}</Text>
          <Text color={isSelected ? colors.accentDim : colors.faint}>● </Text>
          <Text color={isSelected ? colors.bright : colors.fg} bold={isSelected}>
            {item.title.replaceAll(/[\r\n]+/g, ' ')}
          </Text>
        </Text>
        <Box flexShrink={0}>
          <Text dimColor>
            {formatTimeAgo(item.lastActivity)} · #{item.id}
          </Text>
        </Box>
      </Box>
      {item.lastMessagePreview ? (
        <Box paddingLeft={4}>
          <Text dimColor italic wrap="truncate">
            {item.lastMessagePreview}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};
