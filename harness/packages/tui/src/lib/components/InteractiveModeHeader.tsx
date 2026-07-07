import React from 'react';
import { Box, Newline, Text } from 'ink';
import type { GitLabRemoteInfo, AgenticChatAccessStatus } from '../../types';
import { AppHeader } from './AppHeader';
import { Markdown } from './Markdown';
import { Spinner } from './Spinner';

export interface InteractiveModeHeaderProps {
  username?: string;
  credentialSource?: string;
  gitlabRemoteInfo: GitLabRemoteInfo;
  cwd?: string;
  agenticChatAccess?: AgenticChatAccessStatus;
  columns: number;
}

const InitializingDots: React.FC = () => {
  return (
    <Box>
      <Text color="gray">Initializing </Text>
      <Spinner spinner="line" />
    </Box>
  );
};

const UserStatus: React.FC<{ username?: string; credentialSource?: string }> = ({
  username,
  credentialSource,
}) => (
  <Text>
    <Text dimColor>User </Text>
    {username || '...'}
    {username && credentialSource && <Text color="gray"> ({credentialSource})</Text>}
  </Text>
);

const DuoAccessStatus: React.FC<{ accessStatus?: AgenticChatAccessStatus }> = ({
  accessStatus,
}) => {
  if (!accessStatus || accessStatus.status === 'checking') {
    return (
      <Text>
        <Text dimColor>Duo access </Text>...
      </Text>
    );
  }

  if (accessStatus.status === 'available') {
    return (
      <Text>
        <Text dimColor>Duo access </Text>
        <Text color="green">✓ Available</Text>
      </Text>
    );
  }

  // unavailable
  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>Duo access </Text>
        <Text color="red">✗ Unavailable</Text>
      </Text>
      {accessStatus.reason && (
        <Box marginLeft={2}>
          <Text color="yellow">{accessStatus.reason}</Text>
        </Box>
      )}
    </Box>
  );
};

const ProjectStatus: React.FC<{ gitlabRemoteInfo: GitLabRemoteInfo }> = ({ gitlabRemoteInfo }) => {
  switch (gitlabRemoteInfo.status) {
    case 'connected': {
      const gitlabRemoteUrl = new URL(
        gitlabRemoteInfo.gitlabPath,
        `https://${gitlabRemoteInfo.gitlabHost}`,
      );
      return (
        <Text>
          <Text dimColor>Project </Text>
          <Markdown markdown={`[${gitlabRemoteUrl.toString()}](${gitlabRemoteUrl.toString()})`} />
        </Text>
      );
    }
    case 'error': {
      return <Text dimColor>{`${gitlabRemoteInfo.errorMessage}`}</Text>;
    }
    default:
      return (
        <Text>
          <Text dimColor>Project </Text>...
        </Text>
      );
  }
};

export const InteractiveModeHeader: React.FC<InteractiveModeHeaderProps> = ({
  username,
  credentialSource,
  gitlabRemoteInfo,
  cwd,
  agenticChatAccess,
  columns,
}) => {
  const isInitializing =
    !username ||
    gitlabRemoteInfo.status === 'not-checked' ||
    !agenticChatAccess ||
    agenticChatAccess.status === 'checking';

  return (
    <AppHeader columns={columns}>
      <Box flexDirection="column">
        <UserStatus username={username} credentialSource={credentialSource} />
        <DuoAccessStatus accessStatus={agenticChatAccess} />
        <ProjectStatus gitlabRemoteInfo={gitlabRemoteInfo} />
        {cwd && (
          <Text>
            <Text dimColor>cwd </Text>
            <Text>{cwd}</Text>
          </Text>
        )}
        <Newline />
        {isInitializing && <InitializingDots />}
      </Box>
    </AppHeader>
  );
};
