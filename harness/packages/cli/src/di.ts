import {
  createFactoryDescriptor,
  createInstanceDescriptor,
  ServiceCollection,
  ServiceLifetime,
  ServiceProvider,
} from '@gitlab/needle';
import { DefaultLogger, Logger } from '@gitlab-org/logging';
import { Fetch } from '@gitlab-org/fetch/node';
import { LsFetch } from '@gitlab-org/fetch';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  FeatureFlagService,
  DefaultProjectService,
  DefaultUserService,
  DefaultInstanceFeatureFlagsService,
  InstanceFeatureFlagsService,
} from '@gitlab-org/core';
import {
  BM25CodeSnippetsRanker,
  DefaultDuoWorkflowInstanceTracker,
  DefaultModelResolverService,
  DefaultWorkflowGraphqlOperations,
  DefaultWorkflowRailsService,
  NullRgBinaryProvider,
  RgEmbeddedBinaryPath,
} from '@gitlab-org/workflow-executor';
import {
  DefaultExecutorManager,
  DefaultFileStateTracker,
  DefaultNodeExecutor,
  DefaultNodeExecutorWithRetry,
  DefaultRgBinaryProvider,
  DefaultRipgrepService,
  DesktopWorkflowRunner,
  ExecutorManager,
  MakeDirectoryActionHandler,
  RunCommandAsProcess,
  ListDirectoryActionHandler,
  FindFilesActionHandler,
  ReadFileActionHandler,
  ReadFilesActionHandler,
  WriteFileActionHandler,
  EditFileActionHandler,
  GitlabApiRequestActionHandler,
  GrepActionHandler,
  RunCommandActionHandler,
  RunShellCommandActionHandler,
  RunMcpToolActionHandler,
  ReadFileFormatter,
  ReadFilesFormatter,
  WriteFileFormatter,
  EditFileFormatter,
  GrepFormatter,
  MakeDirectoryFormatter,
  ListDirectoryFormatter,
  FindFilesFormatter,
  RunCommandFormatter,
  RunShellCommandFormatter,
  RunGitCommandFormatter,
  TodoWriteFormatter,
  CompactionFormatter,
  McpToolFormatter,
} from '@gitlab-org/workflow-executor/node';
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
  DefaultAiContextTransformerService,
  DefaultSystemContextManager,
} from '@gitlab-org/ai-context';
import {
  DefaultAgentsMdResolver,
  DefaultAgentSkillsResolver,
  DefaultUserRuleContextProvider,
} from '@gitlab-org/ai-context/node';
import { registerMcpServices, AutoApproveApprovalPolicy } from '@gitlab-org/ai-configuration';
import {
  DefaultSecretRedactor,
  GitLeaksRuleEvaluator,
  GitleaksRuleParser,
} from '@gitlab-org/secret-redaction';
import { StatelessRepositoryDiscoveryService } from '@gitlab-org/repositories/node';
import { FsFileAccessService, DesktopFsClient } from '@gitlab-org/fs/node';
import { DocumentQualityService } from '@gitlab-org/document';
import { DefaultErrorHandler, ErrorHandler } from '@gitlab-org/errors';
import { NodeSentryTracker } from '@gitlab-org/errors/node';
import { DefaultSystemContext, DefaultAuthContext } from '@gitlab-org/request-context';
import { DefaultGraphQLService } from '@gitlab-org/graphql';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { DefaultDailyActivityTracker } from '@gitlab-org/telemetry/node';
import {
  DefaultPersistentStorage,
  DefaultUserPersistentStorage,
} from '@gitlab-org/persistent-storage';
import {
  DefaultDuoAgentPlatformTracker,
  DefaultExtensionActivitySnowplowTracker,
  DefaultSnowplowService,
  DefaultStandardContext,
} from '@gitlab-org/telemetry';
import { statelessFeatureStateContributions } from '@gitlab-org/feature-state';
import {
  DefaultHookExecutor,
  DefaultHookConfigLoader,
  DefaultHookService,
} from '@gitlab-org/hooks';
import { CreditLedgerFactory, CreditLedgerService } from '@gitlab-org/credit-ledger';
import rgEmbeddedBinaryPath from './rg_binary_embed';
import { startPoolBridge } from './pool/start_pool_bridge';

import { DefaultSessionManager, DefaultSessionsHistoryController } from './sessions';
import { HookSessionStartContextProvider } from './system_context/hook_session_start_context_provider';
import { CliLogLevelProvider } from './commands/log/cli_log_level_provider';
import { CliFileLogWriter } from './commands/log/cli_file_log_writer';
import { CliStderrLogWriter } from './commands/log/cli_stderr_log_writer';
import { ParsedCliInput } from './parse';
import { RuntimeContext } from './runtime_context';
import {
  ConfigurationController,
  DefaultConfigurationController,
} from './commands/config/configuration_controller';
import { DefaultCredentialProvider, CredentialProvider } from './utils/credential_provider';
import { TokenRefresher, TokenRefresherService } from './utils/token_refresher';
import type { BackendConfigAdapter } from './backend/backend_config_adapter';
import { CliUrlOpenerService } from './cli_url_opener_service';
import { DefaultCliDiagnosticsService, CliDiagnosticsService } from './cli_diagnostics_service';
import { CliInitializationService } from './cli_initialization_service';
import { BetaFeaturesCheckService } from './beta_features_check_service';
import { ToolInputFormatterService } from './backend/tool_input_formatter';
import { DefaultCliContextManager } from './ai_context/cli_ai_context_manager';
import { CliFileContextProvider } from './ai_context/file_context_provider';
import { RunController } from './commands/run/run_controller';
import { RunResultWriter } from './commands/run/run_result_writer';
import { TUIController } from './commands/tui/tui_controller';
import { DefaultMcpStatusController } from './commands/tui/mcp_status_controller';
import { DefaultMcpApprovalController } from './commands/tui/mcp_approval_controller';
import { McpApprovalComponentHandler } from './commands/tui/mcp_approval_component_handler';
import { DefaultUpdateChecker } from './utils/update_checker';
import { DefaultSlashCommandService } from './slash_commands/slash_command_service';
import { ExitHandler } from './utils/exit';
import { DefaultNewSessionCommandHandler } from './slash_commands/handlers/new_session_command_handler';
import { DefaultSessionsCommandHandler } from './slash_commands/handlers/sessions_command_handler';
import { DefaultHelpCommandHandler } from './slash_commands/handlers/help_command_handler';
import { DefaultHelpController } from './help';
import { DefaultCopyCommandHandler } from './slash_commands/handlers/copy_command_handler';
import { DefaultFeedbackCommandHandler } from './slash_commands/handlers/feedback_command_handler';
import { DefaultFeedbackController, DefaultLogPreviewController } from './feedback';
import { DefaultClipboardService } from './utils/clipboard';
import { ContextDropdownProvider, SlashCommandDropdownProvider } from './dropdown_providers';
import { DefaultModelCommandHandler } from './slash_commands/handlers/model_command_handler';
import { DefaultAutoCommandHandler } from './slash_commands/handlers/auto_command_handler';
import { DefaultToolApprovalHandler } from './commands/tui/tool_approval_handler';
import { DefaultPermissionModeService } from './commands/tui/permission_mode_service';
import { TerminalProgressService } from './utils/terminal_progress_service';
import { NotificationService } from './utils/notification_service';
import { DefaultPromptHistoryController } from './commands/tui/prompt_history_controller';
import { DefaultSkillsCommandHandler } from './slash_commands/handlers/skills_command_handler';
import { DefaultCompactCommandHandler } from './slash_commands/handlers/compact_command_handler';
import { DefaultExitCommandHandler } from './slash_commands/handlers/exit_command_handler';
import {
  DefaultSettingsCommandHandler,
  DefaultThemeCommandHandler,
  DefaultStatsCommandHandler,
} from './slash_commands/handlers/settings_command_handler';
import { DefaultDoctorCommandHandler } from './slash_commands/handlers/doctor_command_handler';
import { DefaultDiagnosticsReporter } from './commands/doctor/diagnostics_reporter';
import { DefaultDoctorController } from './commands/doctor/doctor_controller';
import { DefaultMcpCommandHandler } from './slash_commands/handlers/mcp_command_handler';
import { DefaultPoolCommandHandler } from './slash_commands/handlers/pool_command_handler';

export type CliDiConfig = {
  logDestination: 'stderr' | 'file';
};

export type CliGlobalExtensions = {
  __errorHandler?: ErrorHandler;
};

export async function initDi<TBackendOpts>(
  diConfig: CliDiConfig,
  cliInput: ParsedCliInput,
  cliVersion: string,
  envInfo: RuntimeContext['envInfo'],
  exitHandler: ExitHandler,
  backendAdapter: BackendConfigAdapter<TBackendOpts>,
  backendOpts: TBackendOpts,
): Promise<{ container: ServiceProvider; configurationController: ConfigurationController }> {
  const serviceCollection = new ServiceCollection();

  const runtimeContext: RuntimeContext = { cliVersion, envInfo };

  // Register ParsedCliInput (shared CLI flags + command)
  serviceCollection.add(
    createInstanceDescriptor({
      instance: cliInput,
      aliases: [ParsedCliInput],
    }),
  );

  // Register RuntimeContext (version + env info only)
  serviceCollection.add(
    createInstanceDescriptor({
      instance: runtimeContext,
      aliases: [RuntimeContext],
    }),
  );

  // Register the exit handler instance for DI injection
  serviceCollection.add(
    createInstanceDescriptor({
      instance: exitHandler,
      aliases: [ExitHandler],
    }),
  );

  if (diConfig?.logDestination === 'stderr') {
    serviceCollection.addClass(CliStderrLogWriter);
  } else {
    serviceCollection.addClass(CliFileLogWriter);
  }

  serviceCollection.addClass(
    CliLogLevelProvider,
    DefaultLogger,
    Fetch,
    DefaultCliDiagnosticsService,
  );

  // Configuration and credential management
  serviceCollection.addClass(DefaultConfigurationController, DefaultCredentialProvider);
  // Patch B: proactive token refresher (attached to the credential provider
  // after the container is built, below).
  serviceCollection.addClass(TokenRefresher);

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [ExecutorManager],
      factory: (serviceLocator) =>
        new DefaultExecutorManager(serviceLocator, serviceLocator.getRequiredService(Logger)),
      lifetime: ServiceLifetime.Singleton,
    }),
  );

  // These are needed to setup the WorkflowRunner
  serviceCollection.addClass(
    DefaultConfigService,
    DefaultWorkflowGraphqlOperations,
    DefaultWorkflowRailsService,
    DefaultModelResolverService,
    DesktopWorkflowRunner,
    DefaultGraphQLService,
  );

  serviceCollection.addClass(DefaultDuoWorkflowInstanceTracker);

  // Register MCP services (Model Context Protocol)
  // The CliUrlOpenerService is required for OAuth flows in MCP servers
  serviceCollection.addClass(CliUrlOpenerService, RunMcpToolActionHandler);

  // In headless mode ('run' command) the user cannot respond to approval prompts,
  // so we auto-approve all MCP servers for this invocation without persisting the decision.
  // Pass the policy class to registerMcpServices so only one implementation of
  // McpApprovalPolicy is ever registered (avoids "multiple implementations" DI error).
  registerMcpServices(
    serviceCollection,
    cliInput.command.name === 'run' ? AutoApproveApprovalPolicy : undefined,
  );

  serviceCollection.addClass(
    BM25CodeSnippetsRanker,
    StatelessRepositoryDiscoveryService,
    RunCommandAsProcess,
    DesktopSandboxAvailabilityService,
    DesktopSandboxConfigService,
    DesktopMcpStdioSandboxWrapper,
    DesktopSandboxViolations,
    DefaultWorkerProcessManager,
    SrtSandboxProvider,
    SandboxAwareActionExecutorFactory,
    DefaultNodeExecutor,
    DefaultNodeExecutorWithRetry,
    DefaultFileStateTracker,
    DefaultSecretRedactor,
    GitLeaksRuleEvaluator,
    GitleaksRuleParser,
    ListDirectoryActionHandler,
    MakeDirectoryActionHandler,
    FindFilesActionHandler,
    FsFileAccessService,
    DesktopFsClient,
    ReadFileActionHandler,
    ReadFilesActionHandler,
    WriteFileActionHandler,
    EditFileActionHandler,
    GrepActionHandler,
    DefaultRipgrepService,
    RunCommandActionHandler,
    RunShellCommandActionHandler,
    // GitlabApiRequestActionHandler must be included
    // it is not used on gitlab.com, but it is used to proxy requests for Self-Managed where
    // workflow service can't make the requests directly
    GitlabApiRequestActionHandler,
  );

  serviceCollection.addClass(
    ReadFileFormatter,
    ReadFilesFormatter,
    WriteFileFormatter,
    EditFileFormatter,
    GrepFormatter,
    MakeDirectoryFormatter,
    ListDirectoryFormatter,
    FindFilesFormatter,
    RunCommandFormatter,
    RunShellCommandFormatter,
    RunGitCommandFormatter,
    TodoWriteFormatter,
    CompactionFormatter,
    McpToolFormatter,
  );

  // FIXME separate the DocumentQuality (diagnostics) responsibility from the base EditFileActionHandler
  // I would imagine creating DocumentQualityEditFileActionHandler which will wrap some base edit file tool
  // and the base edit file tool will be used for the CLI
  serviceCollection.add(
    createInstanceDescriptor({
      instance: { getDiagnostics: async () => [] },
      aliases: [DocumentQualityService],
    }),
  );

  // FIXME extract feature flag and instance feature flag services to a package
  // they can't be extracted to core without creating circular dependency between core and config
  serviceCollection.addClass(DefaultInstanceFeatureFlagsService);
  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [FeatureFlagService],
      factory: (serviceLocator) => {
        const instanceFlags = serviceLocator.getRequiredService(InstanceFeatureFlagsService);
        return {
          isClientFlagEnabled: () => false,
          isInstanceFlagEnabled: (name) => instanceFlags.isInstanceFlagEnabled(name),
          updateInstanceFeatureFlags: () => instanceFlags.updateInstanceFeatureFlags(),
        } satisfies FeatureFlagService;
      },
      lifetime: ServiceLifetime.Singleton,
    }),
  );

  serviceCollection.addClass(DefaultProjectService, DefaultUserService);

  // Error tracking and handling services
  serviceCollection.addClass(
    NodeSentryTracker,
    DefaultSystemContext,
    DefaultAuthContext,
    DefaultErrorHandler,
  );

  // FIXME - handle Duo feature access
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1564
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1556
  serviceCollection.add(
    createInstanceDescriptor({
      instance: {
        isChatFeatureEnabled: () => Promise.resolve(true),
        isSuggestionsFeatureEnabled: () => Promise.resolve(true),
      } satisfies DuoFeatureAccessService,
      aliases: [DuoFeatureAccessService],
    }),
  );

  // Persistent storage for tracking
  serviceCollection.addClass(DefaultPersistentStorage, DefaultUserPersistentStorage);
  // Credit ledger (per-action attribution + threshold/switch decision).
  serviceCollection.addClass(CreditLedgerFactory);
  serviceCollection.addClass(
    DefaultSnowplowService,
    DefaultStandardContext,
    DefaultExtensionActivitySnowplowTracker,
    DefaultDuoAgentPlatformTracker,
    DefaultDailyActivityTracker,
  );
  serviceCollection.addClass(
    DefaultSystemContextManager,
    DefaultCliContextManager,
    DefaultAiContextTransformerService,
    // ShellContextProvider,
    DefaultUserRuleContextProvider,
    DefaultAgentsMdResolver,
    DefaultAgentSkillsResolver,
    CliFileContextProvider,
    DefaultClipboardService,
    DefaultSlashCommandService,
    DefaultNewSessionCommandHandler,
    DefaultSessionsCommandHandler,
    DefaultHelpController,
    DefaultHelpCommandHandler,
    DefaultFeedbackController,
    DefaultLogPreviewController,
    DefaultCopyCommandHandler,
    DefaultFeedbackCommandHandler,
    DefaultSkillsCommandHandler,
    DefaultCompactCommandHandler,
    DefaultExitCommandHandler,
    DefaultDoctorCommandHandler,
    ContextDropdownProvider,
    SlashCommandDropdownProvider,
    DefaultModelCommandHandler,
    DefaultMcpCommandHandler,
    DefaultAutoCommandHandler,
    DefaultPoolCommandHandler,
  );

  serviceCollection.addClass(...statelessFeatureStateContributions);
  serviceCollection.addClass(DefaultDiagnosticsReporter, DefaultDoctorController);

  serviceCollection.addClass(DefaultSettingsCommandHandler);
  serviceCollection.addClass(DefaultThemeCommandHandler);
  serviceCollection.addClass(DefaultStatsCommandHandler);

  serviceCollection.addClass(ToolInputFormatterService);
  serviceCollection.addClass(BetaFeaturesCheckService);
  serviceCollection.addClass(CliInitializationService);
  serviceCollection.addClass(DefaultUpdateChecker);
  serviceCollection.addClass(TerminalProgressService);
  serviceCollection.addClass(NotificationService);
  serviceCollection.addClass(RunResultWriter);
  serviceCollection.addClass(RunController);
  serviceCollection.addClass(TUIController);
  serviceCollection.addClass(DefaultMcpStatusController);
  serviceCollection.addClass(DefaultMcpApprovalController, McpApprovalComponentHandler);
  serviceCollection.addClass(DefaultToolApprovalHandler);
  serviceCollection.addClass(DefaultPermissionModeService);
  serviceCollection.addClass(DefaultPromptHistoryController);

  serviceCollection.addClass(
    DefaultHookExecutor,
    DefaultHookConfigLoader,
    DefaultHookService,
    HookSessionStartContextProvider,
  );

  serviceCollection.addClass(DefaultSessionManager, DefaultSessionsHistoryController);

  // Register backend-specific services (including the backend's factory)
  backendAdapter.registerServices(serviceCollection, backendOpts, cliInput);

  // Register embedded rg binary path.
  // In compiled binaries, rgEmbeddedBinaryPath points to the embedded rg bytes (set by compile_executables.ts).
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

  // Patch B: attach the proactive token refresher to the credential provider so
  // an idle session's OAuth token is refreshed before it expires.
  container
    .getRequiredService(TokenRefresherService)
    .attach(container.getRequiredService(CredentialProvider));

  // First-party in-process pool bridge, wired to the credit ledger's switch
  // decision. Gated on DUOX_POOL_BRIDGE so ordinary invocations don't spin up
  // the pool (it does browser automation on init). Same startup phase as the
  // credential provider. Fire-and-forget: never blocks or fails boot.
  if (process.env.DUOX_POOL_BRIDGE === '1') {
    startPoolBridge({
      ledgerFactory: container.getRequiredService(CreditLedgerService),
      credentialProvider: container.getRequiredService(CredentialProvider),
      logger: container.getRequiredService(Logger),
    }).catch(() => undefined);
  }

  // Initialize ConfigurationController (reads stored config + CLI overrides)
  const configurationController = container.getRequiredService(ConfigurationController);
  await configurationController.initialize();

  const diagnosticsService = container.getRequiredService(CliDiagnosticsService);
  diagnosticsService.logDebugDetails();

  const fetch = container.getRequiredService(LsFetch);
  await fetch.initialize();

  // Made available so our global exception handler, (defined outside of DI), can log and track any final error
  const globalWithExtras = global as typeof global & CliGlobalExtensions;
  // eslint-disable-next-line no-underscore-dangle
  globalWithExtras.__errorHandler = container.getRequiredService(ErrorHandler);

  exitHandler.setDiContainer(container);

  return { container, configurationController };
}
