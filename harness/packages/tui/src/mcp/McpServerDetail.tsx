import React from 'react';
import { Box, Text } from 'ink';
import { ConnectionState } from '../types';
import type { McpPanelServerDetailView } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { getConnectionStateDisplay } from './connection_state_display';
import type { McpPanelCallbacks } from './McpPanelInput';

interface McpServerDetailProps {
  panelView: McpPanelServerDetailView;
  callbacks: McpPanelCallbacks;
}

export const McpServerDetail: React.FC<McpServerDetailProps> = ({ panelView, callbacks }) => {
  const { server, tools, serverVersion, configSource } = panelView;
  const display = getConnectionStateDisplay(server.connectionState);
  const needsAuth = server.connectionState === ConnectionState.Authenticating && server.authUrl;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (needsAuth && event.name === 'return') {
      callbacks.onAuthenticate(server.name);
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box gap={1}>
        <Text bold>←</Text>
        <Text bold>{server.name}</Text>
        <Text color={display.color}>
          ({display.icon} {server.connectionState})
        </Text>
      </Box>

      {serverVersion && <Text dimColor>Version: {serverVersion}</Text>}
      {configSource && <Text dimColor>Config: {configSource}</Text>}

      {needsAuth && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>
            This server requires OAuth authentication.
          </Text>
          <Text>Press Enter to open the authorization page in your browser.</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold>Tools ({tools.length}):</Text>
        {tools.map((tool) => (
          <Box key={tool.name} flexDirection="column" paddingLeft={1}>
            <Box gap={1}>
              <Text>•</Text>
              <Text bold>{tool.name}</Text>
            </Box>
            {tool.description && (
              <Box paddingLeft={3}>
                <Text dimColor>{tool.description}</Text>
              </Box>
            )}
          </Box>
        ))}
        {tools.length === 0 && !needsAuth && <Text dimColor> No tools available</Text>}
      </Box>
    </Box>
  );
};
