import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { McpApprovalInputState, McpApprovalServerItem } from '../types';
import { useKeyHandler } from '../lib/key_handler';

export const mcpApprovalFooterHint = (): string | null =>
  '↑/↓ to navigate • Space to toggle • Enter to confirm • Esc to skip';

export interface McpApprovalCallbacks {
  /** Confirm the current decisions for all listed servers. */
  onConfirm: (servers: McpApprovalServerItem[]) => void;
  /** Skip approval: leave all servers pending, persist nothing. */
  onEscape: () => void;
}

interface McpApprovalInputProps {
  input: McpApprovalInputState;
  callbacks: McpApprovalCallbacks;
}

const toggleDecision = (
  decision: McpApprovalServerItem['decision'],
): McpApprovalServerItem['decision'] => (decision === 'approve' ? 'reject' : 'approve');

const decisionBadge = (
  decision: McpApprovalServerItem['decision'],
): { text: string; color: string } =>
  decision === 'approve'
    ? { text: '[ Approve ]', color: 'green' }
    : { text: '[ Reject ]', color: 'red' };

export const McpApprovalInput: React.FC<McpApprovalInputProps> = ({ input, callbacks }) => {
  // Local copies so navigation and toggling are instant without a controller round-trip.
  const [servers, setServers] = useState<McpApprovalServerItem[]>(input.servers);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Resync if the controller re-emits with a different server set (e.g. a second
  // pending-approval batch) while this component is still mounted.
  useEffect(() => {
    setServers(input.servers);
    setSelectedIndex(0);
  }, [input.servers]);

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape') {
      callbacks.onEscape();
      event.stopPropagation();
      return;
    }

    if (event.name === 'return') {
      callbacks.onConfirm(servers);
      event.stopPropagation();
      return;
    }

    if (event.name === 'space') {
      setServers((current) =>
        current.map((server, index) =>
          index === selectedIndex
            ? { ...server, decision: toggleDecision(server.decision) }
            : server,
        ),
      );
      event.stopPropagation();
      return;
    }

    if (event.name === 'up' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      event.stopPropagation();
      return;
    }

    if (event.name === 'down' && selectedIndex < servers.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">
            ⚠ MCP server approval required
          </Text>
        </Box>

        <Box marginBottom={1} flexDirection="column">
          <Text>New or changed MCP servers from .gitlab/duo/mcp.json require your</Text>
          <Text>approval before connecting.</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {servers.map((server, index) => {
            const isSelected = index === selectedIndex;
            const badge = decisionBadge(server.decision);
            return (
              <Box key={server.name} gap={1}>
                <Text color={isSelected ? 'white' : 'gray'}>{isSelected ? '❯' : ' '}</Text>
                <Box width={30}>
                  <Text bold={isSelected}>{server.name}</Text>
                </Box>
                <Text color={badge.color}>{badge.text}</Text>
              </Box>
            );
          })}
        </Box>

        <Box>
          <Text dimColor>Decisions are saved to {input.storagePath}</Text>
        </Box>
      </Box>
    </Box>
  );
};
