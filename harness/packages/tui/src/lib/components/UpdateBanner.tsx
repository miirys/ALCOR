import React from 'react';
import { Box, Text } from 'ink';
import type { UpdateInfo } from '../../types';

export interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  columns: number;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ updateInfo, columns }) => {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
      width={columns}
    >
      <Text bold color="yellow">
        Update available
      </Text>
      <Box>
        <Text dimColor>{updateInfo.currentVersion}</Text>
        <Text> → </Text>
        <Text color="green">{updateInfo.latestVersion}</Text>
      </Box>
      <Text color="cyan">{updateInfo.installCommand}</Text>
    </Box>
  );
};
