import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type {
  McpPanelConfigFileItem,
  McpPanelListItem,
  McpPanelServerItem,
  McpPanelServerListView,
} from '../types';
import { ConnectionState } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { getConnectionStateDisplay } from './connection_state_display';
import type { McpPanelCallbacks } from './McpPanelInput';

const ServerRow: React.FC<{ server: McpPanelServerItem; isSelected: boolean }> = ({
  server,
  isSelected,
}) => {
  const display = getConnectionStateDisplay(server.connectionState);
  const needsAuth = server.connectionState === ConnectionState.Authenticating && server.authUrl;

  return (
    <Box gap={1} paddingLeft={1}>
      <Text>{isSelected ? '▸' : ' '}</Text>
      <Text color={display.color}>{display.icon}</Text>
      <Text bold={isSelected}>{server.name}</Text>
      <Text dimColor>{server.connectionState}</Text>
      {needsAuth && <Text color="yellow">(press Enter to authenticate)</Text>}
      {server.toolCount !== undefined && server.toolCount > 0 && (
        <Text dimColor>
          ({server.toolCount} {server.toolCount === 1 ? 'tool' : 'tools'})
        </Text>
      )}
    </Box>
  );
};

const ConfigFileRow: React.FC<{ configFile: McpPanelConfigFileItem; isSelected: boolean }> = ({
  configFile,
  isSelected,
}) => {
  const action = configFile.exists ? 'Open' : 'Create';

  return (
    <Box paddingLeft={1}>
      <Text>{isSelected ? '▸' : ' '}</Text>
      <Text color="cyan" bold={isSelected} dimColor={!configFile.exists}>
        {' '}
        {action}: {configFile.path} ({configFile.label})
      </Text>
    </Box>
  );
};

interface McpServerListProps {
  panelView: McpPanelServerListView;
  servers: McpPanelServerItem[];
  selectedIndex: number;
  callbacks: McpPanelCallbacks;
}

export const McpServerList: React.FC<McpServerListProps> = ({
  panelView,
  servers,
  selectedIndex: initialSelectedIndex,
  callbacks,
}) => {
  const items: McpPanelListItem[] = [
    ...servers.map((server): McpPanelListItem => ({ type: 'server', server })),
    ...panelView.configFiles.map(
      (configFile): McpPanelListItem => ({ type: 'config_file', configFile }),
    ),
  ];
  const [rawSelectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const maxIndex = items.length - 1;
  const selectedIndex = Math.min(rawSelectedIndex, Math.max(maxIndex, 0));

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'return' && items.length > 0) {
      event.stopPropagation();
      const item = items[selectedIndex];
      if (
        item.type === 'server' &&
        item.server.connectionState === ConnectionState.Authenticating &&
        item.server.authUrl
      ) {
        callbacks.onAuthenticate(item.server.name);
      } else {
        callbacks.onSelectItem(item);
      }
      return;
    }

    if (event.name === 'up') {
      event.stopPropagation();
      if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
      return;
    }

    if (event.name === 'down') {
      event.stopPropagation();
      if (selectedIndex < maxIndex) setSelectedIndex(selectedIndex + 1);
    }
  });

  const firstConfigIndex = items.findIndex((item) => item.type === 'config_file');

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>MCP Servers</Text>
      {servers.length === 0 && <Text dimColor>No MCP servers configured</Text>}
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        const showConfigSeparator = idx === firstConfigIndex;

        return (
          <React.Fragment key={item.type === 'server' ? item.server.name : item.configFile.path}>
            {showConfigSeparator && (
              <Box marginTop={1}>
                <Text dimColor>─── Config Files ───</Text>
              </Box>
            )}
            {item.type === 'server' ? (
              <ServerRow server={item.server} isSelected={isSelected} />
            ) : (
              <ConfigFileRow configFile={item.configFile} isSelected={isSelected} />
            )}
          </React.Fragment>
        );
      })}
      {panelView.errorMessage && (
        <Box marginTop={1}>
          <Text color="red">{panelView.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
};
