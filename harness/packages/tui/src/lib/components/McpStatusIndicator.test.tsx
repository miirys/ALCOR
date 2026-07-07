import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { ConnectionState } from '../../types';
import type { McpPanelServerItem } from '../../types';
import { McpStatusIndicator } from './McpStatusIndicator';

const server = (connectionState: ConnectionState): McpPanelServerItem => ({
  name: `server-${connectionState}`,
  connectionState,
});

describe('McpStatusIndicator', () => {
  describe('when mcpServers is undefined', () => {
    it('renders nothing', () => {
      const { lastFrame } = render(<McpStatusIndicator />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('when there are no servers', () => {
    it('renders nothing', () => {
      const { lastFrame } = render(<McpStatusIndicator mcpServers={[]} />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('when all servers are connected', () => {
    it('displays the MCP status text', () => {
      const mcpServers = [
        server(ConnectionState.Connected),
        server(ConnectionState.Connected),
        server(ConnectionState.Connected),
      ];
      const { lastFrame } = render(<McpStatusIndicator mcpServers={mcpServers} />);

      expect(lastFrame()).toContain('MCP: 3/3');
    });
  });

  describe('when some servers are still connecting with no errors', () => {
    it('displays the MCP status text', () => {
      const mcpServers = [server(ConnectionState.Connecting), server(ConnectionState.Connecting)];
      const { lastFrame } = render(<McpStatusIndicator mcpServers={mcpServers} />);

      expect(lastFrame()).toContain('MCP: 0/2');
    });
  });

  describe('when some servers are connected and others are connecting', () => {
    it('displays the MCP status text', () => {
      const mcpServers = [
        server(ConnectionState.Connected),
        server(ConnectionState.Connecting),
        server(ConnectionState.Authenticating),
      ];
      const { lastFrame } = render(<McpStatusIndicator mcpServers={mcpServers} />);

      expect(lastFrame()).toContain('MCP: 1/3');
    });
  });

  describe('when any server has errored', () => {
    it('displays the MCP status text', () => {
      const mcpServers = [
        server(ConnectionState.Connected),
        server(ConnectionState.Connected),
        server(ConnectionState.Failed),
      ];
      const { lastFrame } = render(<McpStatusIndicator mcpServers={mcpServers} />);

      expect(lastFrame()).toContain('MCP: 2/3');
    });
  });

  describe('when all servers have failed', () => {
    it('displays the MCP status text', () => {
      const mcpServers = [
        server(ConnectionState.Failed),
        server(ConnectionState.Failed),
        server(ConnectionState.Disconnected),
        server(ConnectionState.Failed),
      ];
      const { lastFrame } = render(<McpStatusIndicator mcpServers={mcpServers} />);

      expect(lastFrame()).toContain('MCP: 0/4');
    });
  });
});
