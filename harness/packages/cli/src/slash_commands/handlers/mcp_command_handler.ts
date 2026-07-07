import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import type { Result } from 'neverthrow';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  McpPanelInput,
  mcpPanelFooterHint,
  McpPanelView,
  withSuspendedTty,
  type McpPanelCallbacks,
  type McpPanelConfigFileItem,
  type McpPanelListItem,
  type McpPanelServerItem,
  type McpPanelToolItem,
} from '@gitlab-org/tui';
import {
  McpConfigWriter,
  McpManager,
  WorkflowUrlOpenerService,
  getMcpConfigPathCandidates,
  type ServerName,
} from '@gitlab-org/ai-configuration';
import { launchExternalEditor, type LaunchEditorError } from '../../utils/external_editor';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { ParsedCliInput } from '../../parse';
import { RuntimeContext } from '../../runtime_context';
import {
  SlashCommandHandler,
  SlashCommandAction,
  type CommandComponentEntry,
} from '../slash_command_handler';

@Implements(SlashCommandHandler)
@Service({
  dependencies: [
    McpManager,
    ParsedCliInput,
    WorkflowUrlOpenerService,
    McpConfigWriter,
    RuntimeContext,
    Logger,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultMcpCommandHandler implements SlashCommandHandler<McpPanelCallbacks> {
  #mcpManager: McpManager;

  #cliInput: ParsedCliInput;

  #urlOpener: WorkflowUrlOpenerService;

  #configWriter: McpConfigWriter;

  #runtimeContext: RuntimeContext;

  #logger: Logger;

  command = {
    name: '/mcp',
    description: 'View MCP servers and their status',
    action: SlashCommandAction.Mcp,
  } as const;

  constructor(
    mcpManager: McpManager,
    cliInput: ParsedCliInput,
    urlOpener: WorkflowUrlOpenerService,
    configWriter: McpConfigWriter,
    runtimeContext: RuntimeContext,
    logger: Logger,
  ) {
    this.#mcpManager = mcpManager;
    this.#cliInput = cliInput;
    this.#urlOpener = urlOpener;
    this.#configWriter = configWriter;
    this.#runtimeContext = runtimeContext;
    this.#logger = withPrefix(logger, '[McpCommandHandler]');
  }

  async execute(api: ControllerApi): Promise<void> {
    await api.ensureInitialized();
    this.#openMcpPanel(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<McpPanelCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.MCP_PANEL,
      component: McpPanelInput,
      footerHint: mcpPanelFooterHint,
      callbacks: {
        onSelectItem: (item: McpPanelListItem) => this.#handleSelectItem(api, item),
        onAuthenticate: (serverName: string) => this.#openAuthUrl(serverName as ServerName),
        onBack: () => this.#openMcpPanel(api),
        onCancel: () => this.#closeMcpPanel(api),
      },
    };
  }

  #openAuthUrl(serverName: ServerName): void {
    this.#mcpManager
      .getServer(serverName)
      .then((serverState) => {
        if (serverState?.authUrl) {
          this.#logger.info(`Opening OAuth URL for ${String(serverName)}`);
          return this.#urlOpener.openUrl(serverState.authUrl);
        }
        this.#logger.warn(`No auth URL available for ${String(serverName)}`);
        return undefined;
      })
      .catch((error) => {
        this.#logger.warn(`Failed to open auth URL for ${String(serverName)}`, error);
      });
  }

  #openMcpPanel(api: ControllerApi): void {
    const configFiles = this.#getConfigFiles();

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.MCP_PANEL,
        servers: state.mcpServers ?? [],
        selectedIndex: 0,
        panelView: {
          view: McpPanelView.ServerList,
          configFiles,
        },
      },
    }));
  }

  #closeMcpPanel(api: ControllerApi): void {
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  async #handleSelectItem(api: ControllerApi, item: McpPanelListItem): Promise<void> {
    if (item.type === 'server') {
      this.#openServerDetail(api, item.server);
      return;
    }

    if (item.type === 'config_file') {
      // Clear any error from a previous attempt so a retry starts clean.
      this.#setServerListError(api, undefined);

      const launched = await this.#openConfigFile(item.configFile.absolutePath);

      // The editor never ran (no $EDITOR on PATH, or spawn failed), so
      // nothing was edited - surface the failure on the panel and skip the
      // reload. showError/showInfo render into the chat log behind the
      // panel, so the message must live on the panel view itself.
      if (launched.isErr()) {
        this.#setServerListError(api, this.#editorErrorMessage(launched.error));
        return;
      }

      try {
        // re-fetch config file status etc in case user created a new mcp config file
        this.#openMcpPanel(api);

        // reload MCP servers in case user edited MCP config
        await this.#mcpManager.reloadAllServers(this.#cliInput.cwd);
      } catch (error) {
        this.#logger.warn('Failed to reload MCP servers after config edit', error);
      }
    }
  }

  #setServerListError(api: ControllerApi, errorMessage: string | undefined): void {
    api.mutateState((state) => {
      const { input } = state;
      if (
        input?.inputType !== CLI_INPUT_TYPES.MCP_PANEL ||
        input.panelView.view !== McpPanelView.ServerList ||
        input.panelView.errorMessage === errorMessage
      ) {
        return state;
      }
      return {
        ...state,
        input: {
          ...input,
          panelView: { ...input.panelView, errorMessage },
        },
      };
    });
  }

  async #openConfigFile(filePath: string): Promise<Result<void, LaunchEditorError>> {
    // managed: false so the dashboard won't reformat this hand-edited file.
    const ensured = await this.#configWriter.ensureConfigFile(filePath, { managed: false });
    if (ensured.isErr()) {
      this.#logger.warn(`Failed to pre-seed MCP config file ${filePath}: ${ensured.error.message}`);
    }

    const { isKittyProtocolSupported } = this.#runtimeContext.envInfo;
    return launchExternalEditor(filePath, this.#logger, {
      suspendTty: (fn) => withSuspendedTty(fn, { isKittySupported: isKittyProtocolSupported }),
    });
  }

  #editorErrorMessage(error: LaunchEditorError): string {
    switch (error.kind) {
      case 'not_found':
        return `Editor "${error.editor}" not found. Set $VISUAL or $EDITOR to your editor.`;
      case 'spawn_failed':
        return `Failed to launch editor "${error.editor}".`;
      default: {
        const exhaustive: never = error;
        return exhaustive;
      }
    }
  }

  #getConfigFiles(): McpPanelConfigFileItem[] {
    const { cwd } = this.#cliInput;
    const candidates = getMcpConfigPathCandidates(cwd);

    return candidates.map(({ path: filePath, scope }) => {
      const isWorkspaceConfig = scope === 'workspace';
      return {
        path: isWorkspaceConfig ? relative(cwd, filePath) : filePath,
        absolutePath: filePath,
        label: isWorkspaceConfig ? 'project' : 'user',
        exists: existsSync(filePath),
      };
    });
  }

  #openServerDetail(api: ControllerApi, server: McpPanelServerItem): void {
    const serverName = server.name as ServerName;

    Promise.all([this.#fetchToolsForServer(serverName), this.#fetchServerMetadata(serverName)])
      .then(([tools, metadata]) => {
        api.mutateState((state) => ({
          ...state,
          input: {
            inputType: CLI_INPUT_TYPES.MCP_PANEL,
            servers: state.mcpServers ?? [],
            selectedIndex: 0,
            panelView: {
              view: McpPanelView.ServerDetail,
              server,
              tools,
              ...metadata,
            },
          },
        }));
        return undefined;
      })
      .catch((error) => {
        this.#logger.warn(`Failed to open server detail for ${server.name}`, error);
      });
  }

  async #fetchToolsForServer(serverName: ServerName): Promise<McpPanelToolItem[]> {
    try {
      const mcpTools = await this.#mcpManager.getToolsForServer(serverName);
      return mcpTools.map((t) => ({
        name: t.originalToolName,
        description: t.description,
      }));
    } catch {
      this.#logger.warn(`Failed to get tools for server ${String(serverName)}`);
      return [];
    }
  }

  async #fetchServerMetadata(
    serverName: ServerName,
  ): Promise<{ serverVersion?: string; configSource?: string }> {
    try {
      const serverState = await this.#mcpManager.getServer(serverName);
      if (serverState) {
        const serverVersion = serverState.serverInfo?.name
          ? `${serverState.serverInfo.name} ${serverState.serverInfo.version || ''}`
          : undefined;
        return { serverVersion, configSource: serverState.configSource };
      }
    } catch {
      this.#logger.warn(`Failed to get server info for ${String(serverName)}`);
    }
    return {};
  }
}
