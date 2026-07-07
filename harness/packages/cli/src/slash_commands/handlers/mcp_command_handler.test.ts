import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ok, err, okAsync } from 'neverthrow';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type {
  AppState,
  McpPanelInputState,
  McpPanelServerListView,
  McpPanelServerDetailView,
} from '@gitlab-org/tui';
import { CLI_INPUT_TYPES, McpPanelInput, McpPanelView, defaultInputState } from '@gitlab-org/tui';
import type {
  McpConfigWriter,
  McpManager,
  McpServerState,
  McpTool,
  WorkflowUrlOpenerService,
} from '@gitlab-org/ai-configuration';
import { ConnectionState } from '@gitlab-org/ai-configuration';
import type { ParsedCliInput } from '../../parse';
import type { ControllerApi, StateMutation } from '../../commands/tui/controller_api';
import type { RuntimeContext } from '../../runtime_context';
import { SlashCommandAction } from '../slash_command_handler';

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockLaunchExternalEditor = jest.fn();
const mockGetMcpConfigPathCandidates =
  jest.fn<(cwd: string) => { path: string; scope: 'workspace' | 'user' }[]>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,

  // statSync and realpathSync are used transitively
  statSync: jest.fn(),
  realpathSync: jest.fn(),
}));

jest.unstable_mockModule('../../utils/external_editor', () => ({
  launchExternalEditor: mockLaunchExternalEditor,
}));

jest.unstable_mockModule('@gitlab-org/ai-configuration', () => ({
  McpManager: class {},
  WorkflowUrlOpenerService: class {},
  McpConfigWriter: class {},
  ConnectionState,
  getMcpConfigPathCandidates: mockGetMcpConfigPathCandidates,
}));

const { DefaultMcpCommandHandler } = await import('./mcp_command_handler');

const flushPromises = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe('McpCommandHandler', () => {
  let handler: InstanceType<typeof DefaultMcpCommandHandler>;
  let mockApi: ControllerApi;
  let mockMcpManager: McpManager;
  let mockCliInput: ParsedCliInput;
  let mockUrlOpener: WorkflowUrlOpenerService;
  let mockConfigWriter: McpConfigWriter;
  let mockRuntimeContext: RuntimeContext;
  let currentState: AppState;

  const workspaceMcpPath = '/test/workspace/.gitlab/duo/mcp.json';
  const userMcpPath = '/home/user/.config/gitlab-duo/mcp.json';

  beforeEach(() => {
    currentState = createFakePartial<AppState>({ input: defaultInputState });

    mockMcpManager = createFakePartial<McpManager>({
      getToolsForServer: jest.fn<McpManager['getToolsForServer']>().mockResolvedValue([]),
      getServer: jest.fn<McpManager['getServer']>().mockResolvedValue(null),
      reloadAllServers: jest.fn<McpManager['reloadAllServers']>().mockResolvedValue(undefined),
    });

    mockApi = createFakePartial<ControllerApi>({
      ensureInitialized: jest.fn<ControllerApi['ensureInitialized']>().mockResolvedValue(undefined),
      mutateState: jest.fn((mutation: StateMutation) => {
        currentState = mutation(currentState);
        return currentState;
      }),
    });

    mockCliInput = createFakePartial<ParsedCliInput>({
      cwd: '/test/workspace',
    });

    mockUrlOpener = createFakePartial<WorkflowUrlOpenerService>({
      openUrl: jest.fn<WorkflowUrlOpenerService['openUrl']>().mockResolvedValue(undefined),
    });

    mockConfigWriter = createFakePartial<McpConfigWriter>({
      ensureConfigFile: jest
        .fn<McpConfigWriter['ensureConfigFile']>()
        .mockReturnValue(okAsync(undefined)),
    });

    mockRuntimeContext = createFakePartial<RuntimeContext>({
      envInfo: createFakePartial<RuntimeContext['envInfo']>({ isKittyProtocolSupported: false }),
    });

    mockGetMcpConfigPathCandidates.mockReset();
    mockExistsSync.mockReset();
    mockLaunchExternalEditor.mockReset();
    mockLaunchExternalEditor.mockReturnValue(ok(undefined));

    mockGetMcpConfigPathCandidates.mockReturnValue([
      { path: workspaceMcpPath, scope: 'workspace' },
      { path: userMcpPath, scope: 'user' },
    ]);
    mockExistsSync.mockReturnValue(false);

    handler = new DefaultMcpCommandHandler(
      mockMcpManager,
      mockCliInput,
      mockUrlOpener,
      mockConfigWriter,
      mockRuntimeContext,
      new TestLogger(),
    );
  });

  describe('command', () => {
    it('has the correct name', () => {
      expect(handler.command.name).toBe('/mcp');
    });

    it('has the correct action', () => {
      expect(handler.command.action).toBe(SlashCommandAction.Mcp);
    });
  });

  describe('execute', () => {
    describe('when mcpServers are already populated on state', () => {
      beforeEach(async () => {
        currentState = createFakePartial<AppState>({
          input: defaultInputState,
          mcpServers: [
            {
              name: 'server-a',
              connectionState: ConnectionState.Connected,
            },
          ],
        });
        mockExistsSync.mockReturnValue(true);
        await handler.execute(mockApi);
      });

      it('ensures initialization before opening the panel', () => {
        expect(mockApi.ensureInitialized).toHaveBeenCalled();
      });

      it('sets input to MCP_PANEL with servers seeded from state and a server_list panelView', () => {
        const input = currentState.input as McpPanelInputState;

        expect(input.inputType).toBe(CLI_INPUT_TYPES.MCP_PANEL);
        expect(input.selectedIndex).toBe(0);
        expect(input.servers).toEqual([
          {
            name: 'server-a',
            connectionState: ConnectionState.Connected,
          },
        ]);

        const panelView = input.panelView as McpPanelServerListView;
        expect(panelView.view).toBe(McpPanelView.ServerList);
        expect(panelView.configFiles).toEqual([
          {
            path: '.gitlab/duo/mcp.json',
            absolutePath: workspaceMcpPath,
            label: 'project',
            exists: true,
          },
          { path: userMcpPath, absolutePath: userMcpPath, label: 'user', exists: true },
        ]);
      });
    });

    describe('when mcpServers are not yet populated', () => {
      beforeEach(async () => {
        currentState = createFakePartial<AppState>({ input: defaultInputState });
        mockExistsSync.mockReturnValue(true);
        await handler.execute(mockApi);
      });

      it('sets input to MCP_PANEL with an empty servers array and populated config files', () => {
        const input = currentState.input as McpPanelInputState;

        expect(input.inputType).toBe(CLI_INPUT_TYPES.MCP_PANEL);
        expect(input.servers).toEqual([]);

        const panelView = input.panelView as McpPanelServerListView;
        expect(panelView.view).toBe(McpPanelView.ServerList);
        expect(panelView.configFiles).toEqual([
          {
            path: '.gitlab/duo/mcp.json',
            absolutePath: workspaceMcpPath,
            label: 'project',
            exists: true,
          },
          { path: userMcpPath, absolutePath: userMcpPath, label: 'user', exists: true },
        ]);
      });
    });

    describe('when config files do not exist on disk', () => {
      beforeEach(async () => {
        mockExistsSync.mockReturnValue(false);
        await handler.execute(mockApi);
      });

      it('marks config files as not existing', () => {
        const input = currentState.input as McpPanelInputState;
        const panelView = input.panelView as McpPanelServerListView;

        expect(input.servers).toEqual([]);
        expect(panelView.configFiles).toEqual([
          {
            path: '.gitlab/duo/mcp.json',
            absolutePath: workspaceMcpPath,
            label: 'project',
            exists: false,
          },
          { path: userMcpPath, absolutePath: userMcpPath, label: 'user', exists: false },
        ]);
      });
    });

    describe('config file path formatting', () => {
      beforeEach(async () => {
        await handler.execute(mockApi);
      });

      it('uses relative paths for workspace configs and absolute paths for user configs', () => {
        const input = currentState.input as McpPanelInputState;
        const panelView = input.panelView as McpPanelServerListView;

        expect(panelView.configFiles[0].path).toBe('.gitlab/duo/mcp.json');
        expect(panelView.configFiles[0].label).toBe('project');
        expect(panelView.configFiles[1].path).toBe(userMcpPath);
        expect(panelView.configFiles[1].label).toBe('user');
      });
    });
  });

  describe('getComponent', () => {
    it('returns McpPanelInput component', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.component).toBe(McpPanelInput);
    });

    it('returns MCP_PANEL inputType', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.inputType).toBe(CLI_INPUT_TYPES.MCP_PANEL);
    });

    describe('onSelectItem', () => {
      describe('when selecting a server item', () => {
        beforeEach(async () => {
          jest.mocked(mockMcpManager.getToolsForServer).mockResolvedValue([
            createFakePartial<McpTool>({
              originalToolName: 'read_file',
              description: 'Read a file from disk',
            }),
            createFakePartial<McpTool>({
              originalToolName: 'write_file',
              description: 'Write a file to disk',
            }),
          ]);

          jest.mocked(mockMcpManager.getServer).mockResolvedValue(
            createFakePartial<McpServerState>({
              serverInfo: { name: 'MyMCP', version: '1.2.3' },
              configSource: '/home/user/.config/gitlab-duo/mcp.json',
            }),
          );

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onSelectItem({
            type: 'server',
            server: { name: 'my-server', connectionState: ConnectionState.Connected, toolCount: 2 },
          });
          await flushPromises();
        });

        it('opens a server_detail panelView for the selected server', () => {
          const input = currentState.input as McpPanelInputState;
          const panelView = input.panelView as McpPanelServerDetailView;

          expect(panelView.view).toBe(McpPanelView.ServerDetail);
          expect(panelView.server.name).toBe('my-server');
        });

        it('populates the detail view with tools fetched from McpManager', () => {
          const input = currentState.input as McpPanelInputState;
          const panelView = input.panelView as McpPanelServerDetailView;

          expect(panelView.tools).toEqual([
            { name: 'read_file', description: 'Read a file from disk' },
            { name: 'write_file', description: 'Write a file to disk' },
          ]);
        });

        it('populates the detail view with server version and config source', () => {
          const input = currentState.input as McpPanelInputState;
          const panelView = input.panelView as McpPanelServerDetailView;

          expect(panelView.serverVersion).toBe('MyMCP 1.2.3');
          expect(panelView.configSource).toBe('/home/user/.config/gitlab-duo/mcp.json');
        });

        it('does not launch the external editor', () => {
          expect(mockLaunchExternalEditor).not.toHaveBeenCalled();
        });

        it('does not trigger a config reload', () => {
          expect(mockMcpManager.reloadAllServers).not.toHaveBeenCalled();
        });
      });

      describe('when McpManager has no metadata for the selected server', () => {
        beforeEach(async () => {
          jest.mocked(mockMcpManager.getToolsForServer).mockResolvedValue([]);
          jest.mocked(mockMcpManager.getServer).mockResolvedValue(null);

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onSelectItem({
            type: 'server',
            server: { name: 'my-server', connectionState: ConnectionState.Connected, toolCount: 0 },
          });
          await flushPromises();
        });

        it('renders an empty tools list and omits version/config metadata', () => {
          const input = currentState.input as McpPanelInputState;
          const panelView = input.panelView as McpPanelServerDetailView;

          expect(panelView.tools).toEqual([]);
          expect(panelView.serverVersion).toBeUndefined();
          expect(panelView.configSource).toBeUndefined();
        });
      });

      describe('when selecting a config file item', () => {
        beforeEach(async () => {
          const entry = handler.getComponent(mockApi);
          entry.callbacks.onSelectItem({
            type: 'config_file',
            configFile: {
              path: 'relative/config.json',
              absolutePath: '/some/config.json',
              label: 'user',
              exists: true,
            },
          });
          await flushPromises();
        });

        describe('pre-seeding the config file', () => {
          it('pre-seeds the file as unmanaged so the dashboard warns before overwriting it', () => {
            expect(mockConfigWriter.ensureConfigFile).toHaveBeenCalledWith('/some/config.json', {
              managed: false,
            });
          });

          it('pre-seeds using the absolute path so I/O resolves independently of process.cwd()', () => {
            expect(mockConfigWriter.ensureConfigFile).toHaveBeenCalledWith(
              '/some/config.json',
              expect.anything(),
            );
          });

          it('pre-seeds the file before spawning the editor so it opens a populated buffer', () => {
            const writerOrder = jest.mocked(mockConfigWriter.ensureConfigFile).mock
              .invocationCallOrder[0];
            const editorOrder = mockLaunchExternalEditor.mock.invocationCallOrder[0];
            expect(writerOrder).toBeLessThan(editorOrder);
          });
        });

        it('delegates editor spawning to launchExternalEditor', () => {
          expect(mockLaunchExternalEditor).toHaveBeenCalledWith(
            '/some/config.json',
            expect.anything(),
            expect.objectContaining({ suspendTty: expect.any(Function) }),
          );
        });

        it('triggers a config reload so new servers start connecting', () => {
          expect(mockMcpManager.reloadAllServers).toHaveBeenCalledWith('/test/workspace');
        });
      });

      describe('when the editor creates a previously non-existent config file', () => {
        beforeEach(async () => {
          currentState = createFakePartial<AppState>({ mcpServers: [] });
          mockExistsSync.mockReturnValue(false);

          mockLaunchExternalEditor.mockImplementation(() => {
            mockExistsSync.mockReturnValue(true);
            return ok(undefined);
          });

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onSelectItem({
            type: 'config_file',
            configFile: {
              path: 'relative/config.json',
              absolutePath: '/some/config.json',
              label: 'user',
              exists: false,
            },
          });
          await flushPromises();
        });

        it('refreshes the panel with updated exists status', () => {
          const input = currentState.input as McpPanelInputState;
          const panelView = input.panelView as McpPanelServerListView;

          expect(panelView.configFiles.every((c) => c.exists)).toBe(true);
        });
      });

      describe('when the editor cannot be launched', () => {
        const selectConfigFile = async () => {
          const entry = handler.getComponent(mockApi);
          entry.callbacks.onSelectItem({
            type: 'config_file',
            configFile: {
              path: 'relative/config.json',
              absolutePath: '/some/config.json',
              label: 'user',
              exists: true,
            },
          });
          await flushPromises();
        };

        beforeEach(async () => {
          // Open the panel first so the ServerList view exists to attach the
          // error message to.
          await handler.execute(mockApi);
        });

        describe('when the editor is not found on PATH', () => {
          beforeEach(async () => {
            mockLaunchExternalEditor.mockReturnValue(err({ kind: 'not_found', editor: 'code' }));
            await selectConfigFile();
          });

          it('surfaces the failure on the panel', () => {
            const input = currentState.input as McpPanelInputState;
            const panelView = input.panelView as McpPanelServerListView;

            expect(panelView.errorMessage).toContain('code');
          });

          it('does not reload servers since nothing was edited', () => {
            expect(mockMcpManager.reloadAllServers).not.toHaveBeenCalled();
          });
        });

        describe('when the editor fails to spawn', () => {
          beforeEach(async () => {
            mockLaunchExternalEditor.mockReturnValue(
              err({
                kind: 'spawn_failed',
                editor: 'code',
                error: new Error('boom'),
              }),
            );
            await selectConfigFile();
          });

          it('surfaces the failure on the panel', () => {
            const input = currentState.input as McpPanelInputState;
            const panelView = input.panelView as McpPanelServerListView;

            expect(panelView.errorMessage).toContain('code');
          });

          it('does not reload servers since nothing was edited', () => {
            expect(mockMcpManager.reloadAllServers).not.toHaveBeenCalled();
          });
        });

        describe('when a previous attempt failed and the user retries successfully', () => {
          beforeEach(async () => {
            mockLaunchExternalEditor.mockReturnValue(err({ kind: 'not_found', editor: 'code' }));
            await selectConfigFile();

            mockLaunchExternalEditor.mockReturnValue(ok(undefined));
            await selectConfigFile();
          });

          it('clears the stale error message', () => {
            const input = currentState.input as McpPanelInputState;
            const panelView = input.panelView as McpPanelServerListView;

            expect(panelView.errorMessage).toBeUndefined();
          });

          it('reloads servers on the successful attempt', () => {
            expect(mockMcpManager.reloadAllServers).toHaveBeenCalledWith('/test/workspace');
          });
        });
      });
    });

    describe('onAuthenticate callback', () => {
      describe('when server has an authUrl', () => {
        beforeEach(async () => {
          jest.mocked(mockMcpManager.getServer).mockResolvedValue(
            createFakePartial<McpServerState>({
              authUrl: 'https://example.com/oauth',
            }),
          );

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onAuthenticate('my-server');
          await flushPromises();
        });

        it('opens the auth URL', () => {
          expect(mockUrlOpener.openUrl).toHaveBeenCalledWith('https://example.com/oauth');
        });
      });

      describe('when server has no authUrl', () => {
        beforeEach(async () => {
          jest
            .mocked(mockMcpManager.getServer)
            .mockResolvedValue(createFakePartial<McpServerState>({}));

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onAuthenticate('my-server');
          await flushPromises();
        });

        it('does not open a URL', () => {
          expect(mockUrlOpener.openUrl).not.toHaveBeenCalled();
        });
      });

      describe('when getServer fails', () => {
        beforeEach(async () => {
          jest.mocked(mockMcpManager.getServer).mockRejectedValue(new Error('server not found'));

          const entry = handler.getComponent(mockApi);
          entry.callbacks.onAuthenticate('my-server');
          await flushPromises();
        });

        it('does not open a URL', () => {
          expect(mockUrlOpener.openUrl).not.toHaveBeenCalled();
        });
      });
    });

    describe('onBack callback', () => {
      beforeEach(() => {
        currentState = createFakePartial<AppState>({
          mcpServers: [
            {
              name: 'server-a',
              connectionState: ConnectionState.Connected,
              toolCount: 0,
            },
          ],
        });

        const entry = handler.getComponent(mockApi);
        entry.callbacks.onBack();
      });

      it('resets the panel back to the server_list view', () => {
        const input = currentState.input as McpPanelInputState;
        const panelView = input.panelView as McpPanelServerListView;

        expect(panelView.view).toBe(McpPanelView.ServerList);
        expect(input.servers).toHaveLength(1);
      });
    });

    describe('onCancel callback', () => {
      beforeEach(() => {
        currentState = createFakePartial<AppState>({
          input: {
            inputType: CLI_INPUT_TYPES.MCP_PANEL,
            servers: [],
            selectedIndex: 0,
            panelView: { view: McpPanelView.ServerList, configFiles: [] },
          },
        });
        const entry = handler.getComponent(mockApi);
        entry.callbacks.onCancel();
      });

      it('resets input to defaultInputState', () => {
        expect(currentState.input).toEqual(defaultInputState);
      });
    });
  });
});
