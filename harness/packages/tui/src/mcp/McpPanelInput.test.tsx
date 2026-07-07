import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES, McpPanelView } from '../constants';
import type { McpPanelInputState, McpPanelServerItem } from '../types';
import { ConnectionState } from '../types';
import { renderWithProviders } from '../test/render_helper';
import type { McpPanelCallbacks } from './McpPanelInput';
import { McpPanelInput } from './McpPanelInput';

const createServer = (overrides: Partial<McpPanelServerItem> = {}): McpPanelServerItem => ({
  name: 'test-server',
  connectionState: ConnectionState.Connected,
  toolCount: 3,
  ...overrides,
});

const createInputState = (overrides: Partial<McpPanelInputState> = {}): McpPanelInputState => ({
  inputType: CLI_INPUT_TYPES.MCP_PANEL,
  servers: [],
  selectedIndex: 0,
  panelView: { view: McpPanelView.ServerList, configFiles: [] },
  ...overrides,
});

const renderPanel = (input: McpPanelInputState, callbacks: McpPanelCallbacks) =>
  renderWithProviders(<McpPanelInput input={input} callbacks={callbacks} />);

describe('McpPanelInput', () => {
  let callbacks: McpPanelCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<McpPanelCallbacks>({
      onSelectItem: jest.fn(),
      onBack: jest.fn(),
      onCancel: jest.fn(),
    });
  });

  describe('when there are no servers', () => {
    it('renders the empty state message', () => {
      const { lastFrame } = renderPanel(createInputState(), callbacks);
      expect(lastFrame()).toContain('No MCP servers configured');
    });

    it('renders the empty state message and config-files section together', () => {
      const input = createInputState({
        panelView: {
          view: McpPanelView.ServerList,
          configFiles: [
            {
              path: '.gitlab/duo/mcp.json',
              absolutePath: '/ws/.gitlab/duo/mcp.json',
              label: 'project',
              exists: false,
            },
          ],
        },
      });
      const { lastFrame } = renderPanel(input, callbacks);
      const output = lastFrame();
      expect(output).toContain('No MCP servers configured');
      expect(output).toContain('Config Files');
    });

    it('calls onCancel when Escape is pressed', () => {
      const { sendInput } = renderPanel(createInputState(), callbacks);
      sendInput('', { escape: true });
      expect(callbacks.onCancel).toHaveBeenCalled();
    });
  });

  describe('when there are servers', () => {
    const servers = [
      createServer({ name: 'server-a', toolCount: 2 }),
      createServer({ name: 'server-b', connectionState: ConnectionState.Failed, toolCount: 0 }),
    ];

    it('renders server names', () => {
      const input = createInputState({ servers });
      const { lastFrame } = renderPanel(input, callbacks);
      const output = lastFrame();
      expect(output).toContain('server-a');
      expect(output).toContain('server-b');
    });

    it('does not render the empty state message', () => {
      const input = createInputState({ servers });
      const { lastFrame } = renderPanel(input, callbacks);
      expect(lastFrame()).not.toContain('No MCP servers configured');
    });

    it('calls onCancel when Escape is pressed', () => {
      const input = createInputState({ servers });
      const { sendInput } = renderPanel(input, callbacks);
      sendInput('', { escape: true });
      expect(callbacks.onCancel).toHaveBeenCalled();
    });

    it('calls onSelectItem when Enter is pressed on a server', () => {
      const input = createInputState({ servers });
      const { sendInput } = renderPanel(input, callbacks);
      sendInput('', { return: true });
      expect(callbacks.onSelectItem).toHaveBeenCalledWith({
        type: 'server',
        server: servers[0],
      });
    });

    it('navigates down and selects the second server', () => {
      const input = createInputState({ servers });
      const { sendInput, rerender } = renderPanel(input, callbacks);
      sendInput('', { downArrow: true });
      rerender(<McpPanelInput input={input} callbacks={callbacks} />);
      sendInput('', { return: true });
      expect(callbacks.onSelectItem).toHaveBeenCalledWith({
        type: 'server',
        server: servers[1],
      });
    });

    describe('when selectedIndex points past the end of the list', () => {
      it('clamps to the last item rather than selecting nothing', () => {
        const input = createInputState({ servers, selectedIndex: 99 });
        const { sendInput } = renderPanel(input, callbacks);
        sendInput('', { return: true });
        expect(callbacks.onSelectItem).toHaveBeenCalledWith({
          type: 'server',
          server: servers[servers.length - 1],
        });
      });
    });
  });

  describe('when the server list view has an error message', () => {
    it('renders the error message', () => {
      const input = createInputState({
        panelView: {
          view: McpPanelView.ServerList,
          configFiles: [
            {
              path: 'mcp.json',
              absolutePath: '/home/user/mcp.json',
              label: 'user',
              exists: false,
            },
          ],
          errorMessage: 'Editor "code" not found.',
        },
      });
      const { lastFrame } = renderPanel(input, callbacks);
      expect(lastFrame()).toContain('Editor "code" not found.');
    });

    it('omits the error line when no error message is set', () => {
      const { lastFrame } = renderPanel(createInputState(), callbacks);
      expect(lastFrame()).not.toContain('not found');
    });
  });

  describe('when viewing server detail', () => {
    it('calls onBack when Escape is pressed', () => {
      const server = createServer();
      const input = createInputState({
        servers: [server],
        panelView: {
          view: McpPanelView.ServerDetail,
          server,
          tools: [{ name: 'read_file', description: 'Read a file' }],
        },
      });
      const { sendInput } = renderPanel(input, callbacks);
      sendInput('', { escape: true });
      expect(callbacks.onBack).toHaveBeenCalled();
    });
  });
});
