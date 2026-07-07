import React from 'react';
import { Text } from 'ink';
import { ConnectionState } from '../../types';
import type { McpPanelServerItem } from '../../types';

interface McpStatusIndicatorProps {
  mcpServers?: McpPanelServerItem[];
}

export const McpStatusIndicator: React.FC<McpStatusIndicatorProps> = React.memo(
  ({ mcpServers }) => {
    if (!mcpServers || mcpServers.length === 0) return null;

    const total = mcpServers.length;
    const connected = mcpServers.filter(
      (s) => s.connectionState === ConnectionState.Connected,
    ).length;
    const errored = mcpServers.filter(
      (s) =>
        s.connectionState === ConnectionState.Failed ||
        s.connectionState === ConnectionState.Disconnected,
    ).length;

    let color: string;
    if (connected === total) {
      color = 'green';
    } else if (errored > 0) {
      color = 'red';
    } else {
      color = 'yellow';
    }

    return (
      <Text dimColor color={color}>
        MCP: {connected}/{total}
      </Text>
    );
  },
);
