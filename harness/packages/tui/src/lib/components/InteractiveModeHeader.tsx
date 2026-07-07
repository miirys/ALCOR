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
    <Text bold>User: </Text>
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
        <Text bold>GitLab Duo access: ...</Text>
      </Text>
    );
  }

  if (accessStatus.status === 'available') {
    return (
      <Text>
        <Text bold>GitLab Duo access: </Text>
        <Text color="green">✓ Available</Text>
      </Text>
    );
  }

  // unavailable
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>GitLab Duo access: </Text>
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
      const markdown = `**Project:** [${gitlabRemoteUrl.toString()}](${gitlabRemoteUrl.toString()})`;
      return <Markdown markdown={markdown} />;
    }
    case 'error': {
      return <Text color="red">{`${gitlabRemoteInfo.errorMessage}`}</Text>;
    }
    default:
      return <Markdown markdown="**Project:** ..." />;
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
            <Text bold>cwd: </Text>
            <Text>{cwd}</Text>
          </Text>
        )}
        <Newline />
        {isInitializing && <InitializingDots />}
      </Box>
    </AppHeader>
  );
};
