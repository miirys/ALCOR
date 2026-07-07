#!/usr/bin/env node
// Single-binary sandbox-worker support.
//
// Importing this module has two side effects:
//   1. It registers a globalThis flag advertising that this binary can be
//      re-spawned as a sandbox worker (read by DefaultWorkerProcessManager).
//   2. If the binary was launched with GITLAB_SANDBOX_WORKER=true, it boots
//      a JSON-RPC worker on stdio and never returns to the LS bootstrap.
//
// Must be imported BEFORE any other module that may write to stdout at module
// load time — the worker uses stdout as the JSON-RPC channel.
import '@gitlab-org/sandbox/worker';

import EventEmitter from 'events';
import { Console } from 'node:console';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProposedFeatures, TextDocuments, createConnection } from 'vscode-languageserver/node';
import { install as installSourceMapSupport } from 'source-map-support';
import {
  DefaultInstanceFeatureFlagsService,
  getLanguageServerVersion,
  LsConnection,
  LsTextDocuments,
  DefaultProjectService,
  RepositoryProvider,
} from '@gitlab-org/core';
import { LogWriter } from '@gitlab-org/logging';
import { documentationDiContributions } from '@gitlab-org/documentation';
import { LsFetch } from '@gitlab-org/fetch';
import { EndpointProvider } from '@gitlab-org/rpc-endpoint';
import { EndpointConnectionAdapter } from '@gitlab-org/rpc-endpoint-lsp-adapter';
import { DefaultSystemContextManager } from '@gitlab-org/ai-context';
import {
  DefaultAgenticChatWebviewPlugin,
  WEBVIEW_ID as AGENTIC_CHAT_WEBVIEW_ID,
} from '@gitlab-org/lib-agentic-duo-chat';
import {
  DefaultAgenticTabsWebviewPlugin,
  WEBVIEW_ID as AGENTIC_TABS_WEBVIEW_ID,
} from '@gitlab-org/agentic-tabs';
import { registerDuoAgentPlatformServices } from '@gitlab-org/lib-duo-agent-platform';
import { themingPluginFactory } from '@gitlab-org/webview-theming';
import {
  DefaultUsageQuotaService,
  DefaultAgentPlatformProjectStore,
  DefaultAgentPlatformProjectService,
} from '@gitlab-lsp/workflow-api/node';
import {
  webviewContributions,
  WebviewTransportService,
  ExtensionMessageBusProvider,
  PluginManager,
} from '@gitlab-org/webview';
import { JsonRpcConnectionTransport } from '@gitlab-org/webview-transport-json-rpc';
import { WebviewId, WebviewPlugin } from '@gitlab-org/webview-plugin';
import { Transport } from '@gitlab-org/webview-transport';
import { remoteSecurityWebviewPlugin } from '@gitlab-org/webview-vuln-details';
import {
  ServiceCollection,
  createInstanceDescriptor,
  createFactoryDescriptor,
  ServiceLifetime,
} from '@gitlab/needle';
import { ConfigService } from '@gitlab-org/config';
import { addWebviewThemeServicesToContainer } from '@gitlab-org/webview-theme';
import { DuoChatWebviewPlugin, DUO_CHAT_V2_WEBVIEW_ID } from '@gitlab-org/webview-duo-chat-classic';
import {
  ClientToServerRpcMessageDefinitionProvider,
  ServerToClientRpcMessageDefinitionProvider,
  ServerToClientRpcMessageDefinitionSource,
} from '@gitlab-org/rpc';
import { RpcMessageSender, DefaultRpcMessageSender } from '@gitlab-org/rpc-client';
import { NullRgBinaryProvider, RgEmbeddedBinaryPath } from '@gitlab-org/workflow-executor';
import {
  DefaultExecutorManager,
  ExecutorManager,
  workflowExecutorContributions,
  DefaultRgBinaryProvider,
} from '@gitlab-org/workflow-executor/node';
import { registerAiConfigurationServices } from '@gitlab-org/ai-configuration';
import { registerDuoFlowServices } from '@gitlab-org/flow-builder';
import { registerAIConfigurationWebviewServices } from '@gitlab-org/ai-configuration-webview';
import { registerWebviewGitLabConnectionServices } from '@gitlab-org/webview-gitlab-connection';
import { NodeSentryTracker } from '@gitlab-org/errors/node';
import {
  DefaultKnowledgeGraphManager,
  KnowledgeGraphManager,
  createKnowledgeGraphPlugin,
} from '@gitlab-org/knowledge-graph';
import { documentContributions } from '@gitlab-org/document';

import {
  nodeGitCommandsContributions,
  StatelessRepositoryDiscoveryService,
} from '@gitlab-org/repositories/node';
import { Fetch } from '@gitlab-org/fetch/node';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import {
  DefaultPersistentStorage,
  DefaultUserPersistentStorage,
} from '@gitlab-org/persistent-storage';
import { DefaultGraphQLService } from '@gitlab-org/graphql';
import { DailyActivityTracker, DefaultDailyActivityTracker } from '@gitlab-org/telemetry/node';
import {
  DesktopSandboxAvailabilityService,
  DesktopSandboxConfigService,
  DesktopMcpStdioSandboxWrapper,
  DesktopSandboxViolations,
  DefaultWorkerProcessManager,
  SrtSandboxProvider,
  SandboxAwareActionExecutorFactory,
} from '@gitlab-org/sandbox';
import {
  log,
  commonContributions,
  DefaultStreamingHandler,
  GET_WEBVIEW_METADATA_REQUEST,
  DefaultDocumentService,
  DocumentService,
  DefaultTokenCheckNotifier,
  DefaultSecurityDiagnosticsPublisher,
  DefaultConnectionService,
  ExtensionConnectionMessageBusProvider,
  WebviewLocationService,
  WebviewMetadataProvider,
  DefaultWebviewThemeBroadcastService,
  DefaultSuggestionService,
  DefaultWebviewHtmlTransformer,
  WebviewHtmlTransformer,
  DefaultVirtualFileSystemService,
  DefaultRepositoryService,
  DefaultSecurityScanNotifier,
  NonceService,
  DefaultDirectoryService,
  ApplyEditMessageDefinitionSource,
  LspFileAccessService,
  DefaultWorkflowHandler,
} from '@gitlab-org/legacy-common';
import { McpPendingApprovalNotifier } from './mcp/mcp_pending_approval_notifier';
import rgEmbeddedBinaryPath from './rg_binary_embed';
import { NodeProjectService } from './core/services/node_project_service';
import { aiContextManagementContributions as nodeAiContextManagementContributions } from './ai_context_management/contributions';
import { DesktopDirectoryWalker } from './services/fs';
import { DesktopCurrentOs } from './os';
import { desktopWorkflowContributions } from './duo_workflow/contributions';
import { DesktopTreeSitterParser } from './tree_sitter/parser';
import { setupHttp } from './setup_http';
import { DesktopFsClient } from './services/fs/fs';
import { CryptoNonceService } from './webview/nonce/crypto_nonce_service';
import { DefaultKnowledgeGraphService } from './knowledge_graph/knowledge_graph_service';
import { DefaultNodeConnectionService, NodeConnectionService } from './node_connection_service';
import { DefaultSystemContextInitializedHandler } from './core/handlers/system_context_initialized_handler';
import { repositoryProviderContributions } from './services/gitlab/repository_provider/contributions';
import { ShutdownController } from './services/connection_handlers/shutdown_controller';

const webviewPlugins = new Set<WebviewPlugin>();

function parseArgValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const useSourceMaps = process.argv.includes('--use-source-maps');
  const printVersion = process.argv.includes('--version') || process.argv.includes('-v');
  const isDev = process.argv.includes('--dev');
  const httpPort = parseInt(parseArgValue('--http-port') ?? '0', 10) || 0;

  const version = getLanguageServerVersion();
  if (printVersion) {
    // eslint-disable-next-line no-console
    console.error(`GitLab Language Server v${version}`);
    return;
  }

  // We have many components listening to changes to API and Config and so we increase the default (10) limit on listeners
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/585
  EventEmitter.setMaxListeners(30);

  if (useSourceMaps) installSourceMapSupport();

  /* ----- START: SETUP CONNECTION ------- */
  const connection = createConnection(ProposedFeatures.all);
  // Send all console messages to stderr. Stdin/stdout may be in use
  // as the LSP communications channel.
  //
  // This has to happen after the `createConnection` because the `vscode-languageserver` server version 9 and higher
  // patches the console as well
  // https://github.com/microsoft/vscode-languageserver-node/blob/84285312d8d9f22ee0042e709db114e5415dbdde/server/src/node/main.ts#L270
  //
  // FIXME: we should really use the remote logging with `window/logMessage` messages
  // That's what the authors of the languageserver-node want us to use
  // https://github.com/microsoft/vscode-languageserver-node/blob/4e057d5d6109eb3fcb075d0f99456f05910fda44/server/src/common/server.ts#L133
  global.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  /* ----- END: SETUP CONNECTION ------- */

  const serviceCollection = new ServiceCollection();
  serviceCollection.add(
    createInstanceDescriptor({
      instance: connection,
      aliases: [LsConnection],
    }),
  );

  const documents = new TextDocuments(TextDocument);
  serviceCollection.add(
    createInstanceDescriptor({
      instance: documents,
      aliases: [LsTextDocuments],
    }),
  );

  serviceCollection.add(
    createInstanceDescriptor({
      // eslint-disable-next-line no-console -- we are setting up console logging here
      instance: { write: (msg: string) => console.log(msg) },
      aliases: [LogWriter],
    }),
  );

  const lsFetch = new Fetch(log);
  await lsFetch.initialize();
  serviceCollection.add(
    createInstanceDescriptor({
      instance: lsFetch,
      aliases: [LsFetch],
    }),
  );

  const documentService = new DefaultDocumentService(documents);
  serviceCollection.add(
    createInstanceDescriptor({
      instance: documentService,
      aliases: [DocumentService],
    }),
  );

  // setup messaging

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [RpcMessageSender],
      factory: (provider) =>
        new DefaultRpcMessageSender(
          connection,
          provider.getRequiredService(ServerToClientRpcMessageDefinitionProvider),
        ),
      lifetime: ServiceLifetime.Singleton,
    }),
    createInstanceDescriptor({
      instance: new ExtensionConnectionMessageBusProvider({
        connection,
        logger: log,
      }),
      aliases: [ExtensionMessageBusProvider],
    }),
    createFactoryDescriptor({
      aliases: [ClientToServerRpcMessageDefinitionProvider],
      lifetime: ServiceLifetime.Singleton,
      factory: (serviceLocator): ClientToServerRpcMessageDefinitionProvider => {
        return {
          getMessageDefinitions: () =>
            serviceLocator.getServices(EndpointProvider).flatMap((source) => source.getEndpoints()),
        };
      },
    }),
    createFactoryDescriptor({
      aliases: [ServerToClientRpcMessageDefinitionProvider],
      lifetime: ServiceLifetime.Singleton,
      factory: (serviceLocator): ServerToClientRpcMessageDefinitionProvider => {
        return {
          getMessageDefinitions: () =>
            serviceLocator
              .getServices(ServerToClientRpcMessageDefinitionSource)
              .flatMap((source) => source.getMessageDefinitions()),
        };
      },
    }),
  );

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [ExecutorManager],
      factory: (serviceLocator) => new DefaultExecutorManager(serviceLocator, log),
      lifetime: ServiceLifetime.Singleton,
    }),
  );

  addWebviewThemeServicesToContainer(serviceCollection, log);
  registerAiConfigurationServices(serviceCollection);
  registerDuoFlowServices(serviceCollection);
  registerAIConfigurationWebviewServices(serviceCollection);
  registerDuoAgentPlatformServices(serviceCollection);
  registerWebviewGitLabConnectionServices(serviceCollection);
  serviceCollection.addClass(
    ...commonContributions,
    ...documentationDiContributions,
    ...webviewContributions,
    ...nodeAiContextManagementContributions,
    ...workflowExecutorContributions,
    ...desktopWorkflowContributions,
    ...nodeGitCommandsContributions,
    ...documentContributions,
    ...repositoryProviderContributions,
    DefaultGraphQLService,
    DefaultSystemContextManager,
    DefaultPersistentStorage,
    DefaultUserPersistentStorage,
    DefaultDailyActivityTracker,
    DefaultTokenCheckNotifier,
    DefaultSecurityScanNotifier,
    DefaultSecurityDiagnosticsPublisher,
    DesktopCurrentOs,
    DesktopSandboxAvailabilityService,
    DesktopSandboxConfigService,
    DesktopMcpStdioSandboxWrapper,
    DesktopSandboxViolations,
    DefaultWorkerProcessManager,
    SrtSandboxProvider,
    SandboxAwareActionExecutorFactory,
    DesktopDirectoryWalker,
    DesktopTreeSitterParser,
    NodeSentryTracker,
    DefaultVirtualFileSystemService,
    StatelessRepositoryDiscoveryService,
    DefaultRepositoryService,
    DesktopFsClient,
    CryptoNonceService,
    DefaultWebviewHtmlTransformer,
    DefaultStreamingHandler,
    DefaultNodeConnectionService,
    DefaultSystemContextInitializedHandler,
    DefaultConnectionService,
    DefaultSuggestionService,
    DefaultWebviewThemeBroadcastService,
    DuoChatWebviewPlugin,
    NodeProjectService,
    DefaultInstanceFeatureFlagsService,
    DefaultDirectoryService,
    FsFileAccessService,
    DefaultKnowledgeGraphManager,
    DefaultKnowledgeGraphService,
    DefaultAgenticTabsWebviewPlugin,
    DefaultAgenticChatWebviewPlugin,
    DefaultWorkflowHandler,
    LspFileAccessService,
    ApplyEditMessageDefinitionSource,
    DefaultProjectService,
    ShutdownController,
    DefaultAgentPlatformProjectStore,
    DefaultAgentPlatformProjectService,
    DefaultUsageQuotaService,
    McpPendingApprovalNotifier,
  );

  // Register embedded rg binary path.
  // In compiled binaries, rgEmbeddedBinaryPath points to the embedded rg bytes
  // (set by scripts/compile_lsp_executables.sh).
  // In dev/npm mode, it is an empty string and NullRgBinaryProvider returns null.
  if (rgEmbeddedBinaryPath) {
    serviceCollection.add(
      createFactoryDescriptor({
        aliases: [RgEmbeddedBinaryPath],
        factory: () => rgEmbeddedBinaryPath,
        lifetime: ServiceLifetime.Singleton,
      }),
    );
    serviceCollection.addClass(DefaultRgBinaryProvider);
  } else {
    serviceCollection.addClass(NullRgBinaryProvider);
  }

  const container = serviceCollection.build();

  const configService = container.getRequiredService(ConfigService);
  log.setup(configService);

  if (isDev) {
    const envToken = process.env.GITLAB_TOKEN;
    const envBaseUrl = process.env.GITLAB_BASE_URL;
    const envProjectPath = process.env.GITLAB_PROJECT_PATH;
    const envWorkspaceFolder = process.env.GITLAB_WORKSPACE_FOLDER;
    if (envToken || envBaseUrl || envProjectPath || envWorkspaceFolder) {
      log.info('Dev mode: injecting configuration from environment variables');
      configService.merge({
        ...(envToken ? { token: envToken } : {}),
        ...(envBaseUrl ? { baseUrl: envBaseUrl } : {}),
        ...(envProjectPath ? { projectPath: envProjectPath } : {}),
        ...(envWorkspaceFolder
          ? {
              workspaceFolders: [
                {
                  name: path.basename(envWorkspaceFolder),
                  uri: pathToFileURL(path.resolve(envWorkspaceFolder)).href,
                },
              ],
            }
          : {}),
        // Enable a Duo feature to enable project scanning in DuoWorkspaceProjectAccessCache
        duo: { agentPlatform: { enabled: true } },
      });
    }

    // In dev mode there is no IDE sending the LSP `initialized` notification,
    // so RepositoryProvider.init() is never called via ConnectionService.
    // Initialize it manually so it subscribes to DuoWorkspaceProjectAccessCache.
    const repositoryProvider = container.getRequiredService(RepositoryProvider);
    repositoryProvider.init(async () => {});
  }

  const connectionService = container.getRequiredService(NodeConnectionService);

  await connectionService.initialize();

  const stubSetup = () => {};

  // Add MCP Dashboard as plugin type
  webviewPlugins.add({
    id: 'root/mcp' as WebviewId,
    title: 'MCP Dashboard',
    setup: stubSetup,
  });

  // Add Flow Builder as plugin type
  webviewPlugins.add({
    id: 'root/flow' as WebviewId,
    title: 'Flow Builder',
    setup: stubSetup,
  });

  // Add Duo Agent Platform as plugin type
  webviewPlugins.add({
    id: 'root/duoAgentPlatform' as WebviewId,
    title: 'Duo Agent Platform',
    setup: stubSetup,
  });

  const dailyActivityTracker = container.getRequiredService(DailyActivityTracker);
  await dailyActivityTracker.initialize();

  const webviewLocationService = new WebviewLocationService();
  const webviewTransports = new Set<Transport>();
  const webviewMetadataProvider = new WebviewMetadataProvider(
    webviewLocationService,
    webviewPlugins,
  );

  log.info(`GitLab Language Server is starting (v${version})`);

  webviewTransports.add(
    new JsonRpcConnectionTransport({
      connection,
      logger: log,
    }),
  );

  // FIXME: This is antipattern, don't use the connection here in main.ts
  // set up all your request and notification handlers in the ConnectionService
  connection.onRequest(GET_WEBVIEW_METADATA_REQUEST, () => {
    return webviewMetadataProvider?.getMetadata() ?? [];
  });
  // Make the text document manager listen on the connection for open, change and close text document events
  documents.listen(connection);

  // TODO: move to a common connection setup location
  const endpointProviders = container.getServices(EndpointProvider);
  const endpoints = endpointProviders.flatMap((provider) => provider.getEndpoints());
  const endpointConnectionAdapter = new EndpointConnectionAdapter(connection, [], log);
  endpointConnectionAdapter.applyEndpoints(endpoints);

  // Listen on the connection
  connection.listen();

  const allWebViewPlugins = container.getServices(WebviewPlugin);

  const duoChatV2Plugin = allWebViewPlugins.find(({ id }) => id === DUO_CHAT_V2_WEBVIEW_ID);

  if (duoChatV2Plugin) {
    webviewPlugins.add(duoChatV2Plugin);
  }

  const agenticChatPlugin = allWebViewPlugins.find(({ id }) => id === AGENTIC_CHAT_WEBVIEW_ID);

  if (agenticChatPlugin) {
    webviewPlugins.add(agenticChatPlugin);
  }
  const agenticTabsPlugin = allWebViewPlugins.find(({ id }) => id === AGENTIC_TABS_WEBVIEW_ID);

  if (agenticTabsPlugin) {
    webviewPlugins.add(agenticTabsPlugin);
  }
  webviewPlugins.add(remoteSecurityWebviewPlugin(connection));
  webviewPlugins.add(themingPluginFactory());

  const knowledgeGraphManager = container.getRequiredService(KnowledgeGraphManager);
  const knowledgeGraphPlugin = createKnowledgeGraphPlugin({ knowledgeGraphManager });
  container.getRequiredService(PluginManager).registerPlugin(knowledgeGraphPlugin);

  const webviewIds = [...Array.from(webviewPlugins).map((x) => x.id), 'root' as WebviewId];

  await setupHttp(
    webviewIds,
    webviewLocationService,
    webviewTransports,
    container.getRequiredService(WebviewHtmlTransformer),
    container.getRequiredService(NonceService),
    log,
    { isDev, port: httpPort },
  );

  const webviewTransportService = container.getRequiredService(WebviewTransportService);
  webviewTransports.forEach((transport) => webviewTransportService.registerTransport(transport));

  const pluginManager = container.getRequiredService(PluginManager);

  // Filter out noop stub plugins (packages/webview) to avoid creating redundant WebviewController
  webviewPlugins.forEach(
    (plugin) => plugin.setup !== stubSetup && pluginManager.registerPlugin(plugin),
  );

  log.info('GitLab Language Server has started');
}

// Skip the LS bootstrap when running as an embedded sandbox worker; the
// '@gitlab-org/sandbox/worker' import above has already taken over stdio.
if (process.env.GITLAB_SANDBOX_WORKER !== 'true') {
  main().catch((e) => log.error(`failed to start the language server`, e));
}
