import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { AppState } from '@gitlab-org/tui';
import { CLI_INPUT_TYPES, McpPanelView, defaultInputState } from '@gitlab-org/tui';
import { McpManager, ConnectionState } from '@gitlab-org/ai-configuration';
import type { McpServerState, McpTool } from '@gitlab-org/ai-configuration';
import type { ControllerApi, StateMutation } from './controller_api';
import { DefaultMcpStatusController } from './mcp_status_controller';

const flushPromises = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe('DefaultMcpStatusController', () => {
  let controller: DefaultMcpStatusController;
  let mockMcpManager: McpManager;
  let mockApi: ControllerApi;
  let currentState: AppState;

  beforeEach(() => {
    currentState = createFakePartial<AppState>({ input: defaultInputState });

    mockMcpManager = createFakePartial<McpManager>({
      getServers: jest.fn<McpManager['getServers']>().mockResolvedValue([]),
      getToolsForServer: jest.fn<McpManager['getToolsForServer']>().mockResolvedValue([]),
      on: jest.fn(),
      off: jest.fn(),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn((mutation: StateMutation) => {
        currentState = mutation(currentState);
        return currentState;
      }),
      showError: jest.fn(),
    });

    controller = new DefaultMcpStatusController(new TestLogger(), mockMcpManager);
  });

  describe('subscribe', () => {
    describe('when servers are in mixed states', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
          createFakePartial<McpServerState>({
            name: 'server-b',
            connectionState: ConnectionState.Failed,
            error: 'connection refused',
          }),
          createFakePartial<McpServerState>({
            name: 'server-c',
            connectionState: ConnectionState.Connecting,
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('sets mcpServers with correct items', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            error: undefined,
            authUrl: undefined,
          },
          {
            name: 'server-b',
            connectionState: ConnectionState.Failed,
            error: 'connection refused',
            authUrl: undefined,
          },
          {
            name: 'server-c',
            connectionState: ConnectionState.Connecting,
            error: undefined,
            authUrl: undefined,
          },
        ]);
      });

      it('subscribes to server:state-changed events', () => {
        expect(mockMcpManager.on).toHaveBeenCalledWith(
          'server:state-changed',
          expect.any(Function),
        );
      });

      it('subscribes to tools:updated events', () => {
        expect(mockMcpManager.on).toHaveBeenCalledWith('tools:updated', expect.any(Function));
      });
    });

    describe('when no servers exist', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([]);

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('sets mcpServers to empty array', () => {
        expect(currentState.mcpServers).toEqual([]);
      });
    });

    describe('when a server:state-changed event fires', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connecting,
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'server:state-changed');
        const handler = onCall![1] as (serverName: string, state: McpServerState) => void;
        handler(
          'server-a',
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
        );
      });

      it('updates mcpServers with the event payload', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            error: undefined,
          },
        ]);
      });
    });

    describe('when server:state-changed fires for an unknown server', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([]);
        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'server:state-changed');
        const handler = onCall![1] as (serverName: string, state: McpServerState) => void;
        handler(
          'server-new',
          createFakePartial<McpServerState>({
            name: 'server-new',
            connectionState: ConnectionState.Connecting,
          }),
        );
      });

      it('inserts the new server', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-new',
            connectionState: ConnectionState.Connecting,
            error: undefined,
            authUrl: undefined,
          },
        ]);
      });
    });

    describe('when a server is in authenticating state with authUrl', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'oauth-server',
            connectionState: ConnectionState.Authenticating,
            authUrl: 'https://auth.example.com',
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('includes the authUrl in mcpServers state', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'oauth-server',
            connectionState: ConnectionState.Authenticating,
            error: undefined,
            authUrl: 'https://auth.example.com',
          },
        ]);
      });
    });

    describe('when called multiple times', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([]);

        controller.subscribe(mockApi);
        await flushPromises();

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('unsubscribes the previous handler before registering a new one', () => {
        const firstHandler = jest.mocked(mockMcpManager.on).mock.calls[0][1];

        expect(mockMcpManager.off).toHaveBeenCalledWith('server:state-changed', firstHandler);
      });

      it('registers two listeners per subscribe call', () => {
        // 2 subscribe() calls × 2 listeners each (state-changed + tools:updated) = 4
        expect(mockMcpManager.on).toHaveBeenCalledTimes(4);
      });
    });

    describe('when getServers fails', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockRejectedValue(new Error('MCP unavailable'));

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('does not call mutateState', () => {
        expect(mockApi.mutateState).not.toHaveBeenCalled();
      });
    });
  });

  describe('when server:state-changed fires', () => {
    describe('when the MCP panel is open', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connecting,
          }),
        ]);

        currentState = createFakePartial<AppState>({
          input: {
            inputType: CLI_INPUT_TYPES.MCP_PANEL,
            servers: [],
            selectedIndex: 0,
            panelView: {
              view: McpPanelView.ServerList,
              configFiles: [],
            },
          },
        });

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('updates both state.mcpServers and state.input.servers in a single write', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connecting,
            error: undefined,
            authUrl: undefined,
          },
        ]);
        expect(currentState.input).toEqual({
          inputType: CLI_INPUT_TYPES.MCP_PANEL,
          servers: [
            {
              name: 'server-a',
              connectionState: ConnectionState.Connecting,
              error: undefined,
              authUrl: undefined,
            },
          ],
          selectedIndex: 0,
          panelView: {
            view: McpPanelView.ServerList,
            configFiles: [],
          },
        });
        expect(mockApi.mutateState).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the MCP panel is closed', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
        ]);

        currentState = createFakePartial<AppState>({
          input: defaultInputState,
        });

        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('updates state.mcpServers but leaves input untouched', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            error: undefined,
            authUrl: undefined,
          },
        ]);
        expect(currentState.input).toEqual(defaultInputState);
      });
    });
  });

  describe('when tools:updated fires', () => {
    describe('for a known server', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'tools:updated');
        const handler = onCall![1] as (serverName: string, tools: McpTool[]) => void;
        handler('server-a', [
          createFakePartial<McpTool>({ name: 'tool-1' }),
          createFakePartial<McpTool>({ name: 'tool-2' }),
          createFakePartial<McpTool>({ name: 'tool-3' }),
        ]);
      });

      it('patches the tool count for that server', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            toolCount: 3,
            error: undefined,
          },
        ]);
      });

      it('does not call getServers again', () => {
        expect(mockMcpManager.getServers).toHaveBeenCalledTimes(1);
      });

      it('does not call getToolsForServer', () => {
        expect(mockMcpManager.getToolsForServer).not.toHaveBeenCalled();
      });
    });

    describe('for an unknown server', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'tools:updated');
        const handler = onCall![1] as (serverName: string, tools: McpTool[]) => void;
        handler('server-zzz', [createFakePartial<McpTool>({ name: 'tool-1' })]);
      });

      it('leaves state.mcpServers unchanged', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            error: undefined,
          },
        ]);
      });
    });

    describe('when the MCP panel is open', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          }),
        ]);

        currentState = createFakePartial<AppState>({
          input: { inputType: CLI_INPUT_TYPES.MCP_PANEL, servers: [] },
        });

        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'tools:updated');
        const handler = onCall![1] as (serverName: string, tools: McpTool[]) => void;
        handler('server-a', [createFakePartial<McpTool>({ name: 'tool-1' })]);
      });

      it('updates both state.mcpServers and state.input.servers', () => {
        const expected = [
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
            toolCount: 1,
            error: undefined,
          },
        ];
        expect(currentState.mcpServers).toEqual(expected);
        expect(currentState.input).toEqual({
          inputType: CLI_INPUT_TYPES.MCP_PANEL,
          servers: expected,
        });
      });
    });

    describe('when a server is no longer Connected and receives a stale tool update event', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([
          createFakePartial<McpServerState>({
            name: 'server-a',
            connectionState: ConnectionState.Disconnected,
          }),
        ]);

        controller.subscribe(mockApi);
        await flushPromises();

        const onCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'tools:updated');
        const handler = onCall![1] as (serverName: string, tools: McpTool[]) => void;
        handler('server-a', [
          createFakePartial<McpTool>({ name: 'tool-1' }),
          createFakePartial<McpTool>({ name: 'tool-2' }),
        ]);
      });

      it('ignores the tool update event and does not mutate state', () => {
        expect(currentState.mcpServers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Disconnected,
            error: undefined,
          },
        ]);
      });
    });
  });

  describe('when server:state-changed fires after tools:updated', () => {
    beforeEach(async () => {
      jest.mocked(mockMcpManager.getServers).mockResolvedValue([
        createFakePartial<McpServerState>({
          name: 'server-a',
          connectionState: ConnectionState.Connected,
        }),
      ]);

      controller.subscribe(mockApi);
      await flushPromises();

      const toolsOnCall = jest
        .mocked(mockMcpManager.on)
        .mock.calls.find(([event]) => event === 'tools:updated');
      const toolsHandler = toolsOnCall![1] as (serverName: string, tools: McpTool[]) => void;
      toolsHandler('server-a', [
        createFakePartial<McpTool>({ name: 'tool-1' }),
        createFakePartial<McpTool>({ name: 'tool-2' }),
      ]);

      const stateOnCall = jest
        .mocked(mockMcpManager.on)
        .mock.calls.find(([event]) => event === 'server:state-changed');
      const stateHandler = stateOnCall![1] as (serverName: string, state: McpServerState) => void;
      stateHandler(
        'server-a',
        createFakePartial<McpServerState>({
          name: 'server-a',
          connectionState: ConnectionState.Connected,
        }),
      );
    });

    it('preserves the existing tool count for servers that stay Connected', () => {
      expect(currentState.mcpServers).toEqual([
        {
          name: 'server-a',
          connectionState: ConnectionState.Connected,
          toolCount: 2,
          error: undefined,
        },
      ]);
    });
  });

  describe('when a server transitions away from Connected', () => {
    beforeEach(async () => {
      jest.mocked(mockMcpManager.getServers).mockResolvedValue([
        createFakePartial<McpServerState>({
          name: 'server-a',
          connectionState: ConnectionState.Connected,
        }),
      ]);

      controller.subscribe(mockApi);
      await flushPromises();

      const toolsOnCall = jest
        .mocked(mockMcpManager.on)
        .mock.calls.find(([event]) => event === 'tools:updated');
      const toolsHandler = toolsOnCall![1] as (serverName: string, tools: McpTool[]) => void;
      toolsHandler('server-a', [createFakePartial<McpTool>({ name: 'tool-1' })]);

      const stateOnCall = jest
        .mocked(mockMcpManager.on)
        .mock.calls.find(([event]) => event === 'server:state-changed');
      const stateHandler = stateOnCall![1] as (serverName: string, state: McpServerState) => void;
      stateHandler(
        'server-a',
        createFakePartial<McpServerState>({
          name: 'server-a',
          connectionState: ConnectionState.Failed,
          error: 'lost connection',
        }),
      );
    });

    it('clears the tool count', () => {
      expect(currentState.mcpServers).toEqual([
        {
          name: 'server-a',
          connectionState: ConnectionState.Failed,
          error: 'lost connection',
        },
      ]);
    });
  });

  describe('dispose', () => {
    describe('when subscribed', () => {
      beforeEach(async () => {
        jest.mocked(mockMcpManager.getServers).mockResolvedValue([]);
        controller.subscribe(mockApi);
        await flushPromises();
      });

      it('unsubscribes from server:state-changed events', () => {
        controller.dispose();

        expect(mockMcpManager.off).toHaveBeenCalledWith(
          'server:state-changed',
          expect.any(Function),
        );
      });

      it('unsubscribes from tools:updated events', () => {
        controller.dispose();

        expect(mockMcpManager.off).toHaveBeenCalledWith('tools:updated', expect.any(Function));
      });

      it('passes the same handler references to off as were passed to on', () => {
        controller.dispose();

        const stateOnCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'server:state-changed');
        const stateOffCall = jest
          .mocked(mockMcpManager.off)
          .mock.calls.find(([event]) => event === 'server:state-changed');
        expect(stateOffCall![1]).toBe(stateOnCall![1]);

        const toolsOnCall = jest
          .mocked(mockMcpManager.on)
          .mock.calls.find(([event]) => event === 'tools:updated');
        const toolsOffCall = jest
          .mocked(mockMcpManager.off)
          .mock.calls.find(([event]) => event === 'tools:updated');
        expect(toolsOffCall![1]).toBe(toolsOnCall![1]);
      });
    });

    describe('when not subscribed', () => {
      it('does not call off', () => {
        controller.dispose();

        expect(mockMcpManager.off).not.toHaveBeenCalled();
      });
    });
  });
});
