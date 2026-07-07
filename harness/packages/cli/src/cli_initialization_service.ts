import { URI } from 'vscode-uri';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { ConfigService } from '@gitlab-org/config';
import {
  DUO_NO_NAMESPACE_DETECTED_MESSAGE,
  GitLabApiService,
  UserService,
  doNotAwait,
  getLanguageServerVersion,
} from '@gitlab-org/core';
import { AIContextItem, SystemContextManager } from '@gitlab-org/ai-context';
import {
  GitLabRemote,
  RepositoryDiscoveryService,
  tryParseRepositoryGitLabRemoteDetails,
} from '@gitlab-org/repositories';
import { isGlab } from '@gitlab-org/tui';
import { DailyActivityTracker } from '@gitlab-org/telemetry/node';
import { redactUrlCredential, SecretRedactor } from '@gitlab-org/secret-redaction';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { isInitializableApiService } from './cli_api_service';
import { BetaFeaturesCheckService } from './beta_features_check_service';
import { isAllowlistedInstance } from './beta_instance_allowlist';
import { ParsedCliInput } from './parse';
import { RuntimeContext } from './runtime_context';
import { CredentialProvider } from './utils/credential_provider';
import { formatRunConfigForLogging } from './utils/format_run_config_for_logging';
import { DUO_CLI_APP_NAME, DUO_CLI_APP_VENDOR } from './cli_constants';

// AI context category (defined server-side) whose content carries a scanner-detected
// secret as `{"secret_value": "..."}`.
const SECRET_DETECTION_CONTEXT_CATEGORY = 'secret_detection_context';

export interface InitializationResult {
  criticalError?: string;
  existingSessionId?: string;
  systemContext: AIContextItem[];
  username: string;
  workspaceFolder: string;
  gitlabRemote?: GitLabRemote;
}

/**
 * Stateless service that handles common initialization logic
 * Reduces duplication between TUI and Run controllers and their backends
 */
@Service({
  dependencies: [
    Logger,
    ConfigService,
    GitLabApiService,
    RepositoryDiscoveryService,
    SystemContextManager,
    ParsedCliInput,
    UserService,
    DailyActivityTracker,
    CredentialProvider,
    RuntimeContext,
    SecretRedactor,
    BetaFeaturesCheckService,
    UserPersistentStorage,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class CliInitializationService {
  #logger: Logger;

  #configService: ConfigService;

  #apiService: GitLabApiService;

  #repositoryDiscoveryService: RepositoryDiscoveryService;

  #systemContextManager: SystemContextManager;

  #cliInput: ParsedCliInput;

  #userService: UserService;

  #dailyActivityTracker: DailyActivityTracker;

  #credentialProvider: CredentialProvider;

  #runtimeContext: RuntimeContext;

  #secretRedactor: SecretRedactor;

  #betaFeaturesCheckService: BetaFeaturesCheckService;

  #userPersistentStorage: UserPersistentStorage;

  constructor(
    logger: Logger,
    configService: ConfigService,
    apiService: GitLabApiService,
    repositoryDiscoveryService: RepositoryDiscoveryService,
    systemContextManager: SystemContextManager,
    cliInput: ParsedCliInput,
    userService: UserService,
    dailyActivityTracker: DailyActivityTracker,
    credentialProvider: CredentialProvider,
    runtimeContext: RuntimeContext,
    secretRedactor: SecretRedactor,
    betaFeaturesCheckService: BetaFeaturesCheckService,
    userPersistentStorage: UserPersistentStorage,
  ) {
    this.#logger = withPrefix(logger, '[CliInitializationService]');
    this.#configService = configService;
    this.#apiService = apiService;
    this.#repositoryDiscoveryService = repositoryDiscoveryService;
    this.#systemContextManager = systemContextManager;
    this.#cliInput = cliInput;
    this.#userService = userService;
    this.#dailyActivityTracker = dailyActivityTracker;
    this.#credentialProvider = credentialProvider;
    this.#runtimeContext = runtimeContext;
    this.#secretRedactor = secretRedactor;
    this.#betaFeaturesCheckService = betaFeaturesCheckService;
    this.#userPersistentStorage = userPersistentStorage;
  }

  /**
   * Performs common initialization for CLI controllers
   * Returns all initialization results without storing state
   */
  async initialize(): Promise<InitializationResult> {
    if (isGlab()) {
      this.#logger.info('Running as glab distribution');
    }

    // Register any known plaintext secrets passed via context (e.g. a scanner-detected
    // secret) for verbatim redaction before anything is logged. These values are not
    // reliably caught by pattern-based rules, so redact them deterministically.
    this.#registerKnownSecrets();

    const credentials = await this.#credentialProvider.getCredentials();
    this.#logger.debug(
      `CLI input: ${formatRunConfigForLogging(this.#cliInput, this.#runtimeContext, credentials, this.#secretRedactor)}`,
    );

    this.#secretRedactor.addSensitiveEnvVarRules();

    this.#logger.debug('Starting CLI common initialization');

    // Certificate config must be set before API initialization.
    this.#configureNetwork();

    // Start with all common initialisation that does not depend on each other (e.g. API will not be ready yet)
    const [, workspaceInfo] = await Promise.all([
      this.#initializeApiService(),
      this.#setupWorkspaceAndConfig(),
    ]);

    // When a git remote namespace is available (common case), kick off the beta
    // features check in parallel with system-context and user fetches to avoid
    // an extra sequential network round-trip on every startup.
    const remoteNamespace = workspaceInfo.gitlabRemote?.namespace;
    const earlyBetaCheck = remoteNamespace ? this.#checkBetaFeatures(remoteNamespace) : undefined;

    const [systemContext, user, telemetryEnabled] = await Promise.all([
      this.#initializeSystemContext(),
      this.#getUser(),
      this.#resolveTelemetryEnabled(),
    ]);
    this.#configService.set('telemetry.enabled', telemetryEnabled);

    const { criticalError } = earlyBetaCheck
      ? await earlyBetaCheck
      : await this.#checkBetaFeatures(undefined, user.defaultNamespacePath);

    const { terminalName, isKittyProtocolSupported, distribution, osPlatform, osVersion } =
      this.#runtimeContext.envInfo;
    const dailyActivityTrackingContext = {
      terminal_name: terminalName,
      os_platform: osPlatform,
      os_version: osVersion,
      is_kitty_protocol_supported: isKittyProtocolSupported,
      distribution,
      command_type: this.#cliInput.command.name,
    };
    this.#logger.debug(
      `Initializing daily activity tracker with context ${JSON.stringify(dailyActivityTrackingContext)}`,
    );

    doNotAwait(this.#dailyActivityTracker.initialize(dailyActivityTrackingContext));

    return {
      criticalError,
      existingSessionId: this.#getExistingSessionIdFromConfig(),
      username: user.username,
      systemContext,
      workspaceFolder: workspaceInfo.workspaceFolder,
      gitlabRemote: workspaceInfo.gitlabRemote,
    };
  }

  /**
   * Extract plaintext secrets carried in AI context (currently the scanner-detected
   * secret in `secret_detection_context`) and register them with the redactor so they
   * are masked in every subsequent log line.
   */
  #registerKnownSecrets(): void {
    const { command } = this.#cliInput;
    const contextItems = command.name === 'run' ? (command.aiContextItems ?? []) : [];
    const secretValues = contextItems
      // `category` is typed as a closed union that omits this server-supplied value.
      .filter((item) => (item.category as string) === SECRET_DETECTION_CONTEXT_CATEGORY)
      .flatMap((item) => {
        if (typeof item.content !== 'string') {
          return [];
        }
        try {
          const parsed = JSON.parse(item.content) as { secret_value?: unknown };
          return typeof parsed.secret_value === 'string' ? [parsed.secret_value] : [];
        } catch (err) {
          // Content isn't the expected JSON envelope; nothing to register.
          this.#logger.warn(
            'secret_detection_context content was not valid JSON; secret not registered for redaction',
            err instanceof Error ? err : undefined,
          );
          return [];
        }
      });

    if (secretValues.length > 0) {
      this.#secretRedactor.addExactSecretValues(secretValues);
    }
  }

  #configureNetwork(): void {
    // Map NODE_TLS_REJECT_UNAUTHORIZED=0 to equivalent "ignoreCertificateErrors" IDE setting
    const ignoreCertificateErrors = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
    this.#configService.set('ignoreCertificateErrors', ignoreCertificateErrors);

    // NODE_EXTRA_CA_CERTS is automatically used by Node.js, no need to manually set `ca`
    // and same goes for proxy related vars
    const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
    const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;

    this.#logger.debug(
      `Network/TLS configuration: ${JSON.stringify(
        {
          ignoreCertificateErrors,
          NODE_OPTIONS: process.env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? '(not set)',
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '(not set)',
          NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? '(not set)',
          HTTP_PROXY: httpProxy ? redactUrlCredential(httpProxy) : '(not set)',
          HTTPS_PROXY: httpsProxy ? redactUrlCredential(httpsProxy) : '(not set)',
          NO_PROXY: process.env.NO_PROXY ?? process.env.no_proxy ?? '(not set)',
        },
        null,
        4,
      )}`,
    );
  }

  async #initializeApiService(): Promise<void> {
    if (isInitializableApiService(this.#apiService)) {
      const result = await this.#apiService.initialize();
      if (result.isErr()) {
        this.#logger.error('API initialization failed:', result.error);
        throw result.error;
      }
    }
    this.#logger.info('API service initialized successfully');
  }

  async #setupWorkspaceAndConfig(): Promise<{
    workspaceFolder: string;
    gitlabRemote?: GitLabRemote;
  }> {
    const { cwd } = this.#cliInput;

    this.#configService.set('cwd', URI.file(cwd).toString());

    let workspaceFolder: string;
    try {
      // workspaceFolder / repositoryRoot might not be the same as cwd, e.g. if user has run CLI
      // inside a subdirectory. Resolve the repoRoot to ensure we treat that as the correct workspace root
      workspaceFolder = await this.#repositoryDiscoveryService.findRepositoryRoot(cwd);
    } catch {
      // Not in a git repository? Use cwd as workspace
      workspaceFolder = cwd;
    }

    this.#configService.set('workspaceFolders', [
      { uri: URI.file(workspaceFolder).toString(), name: 'repository root' },
    ]);

    this.#configService.set('gitHttpUser', this.#cliInput.gitHttpUser);
    this.#configService.set('gitHttpPassword', this.#cliInput.gitHttpPassword);
    this.#configService.set('gitUserEmail', this.#cliInput.gitUserEmail);
    this.#configService.set('gitUserName', this.#cliInput.gitUserName);
    this.#configService.set('gitAuthorEmail', this.#cliInput.gitAuthorEmail);
    this.#configService.set('gitAuthorName', this.#cliInput.gitAuthorName);
    this.#configService.set(
      'duo.sessionTrackingEnabled',
      this.#cliInput.sessionTrackingEnabled ?? false,
    );
    this.#configService.set('duo.sandbox.enabled', this.#cliInput.sandbox ?? false);
    this.#configService.set('clientInfo.name', DUO_CLI_APP_NAME); // see packages/lib_config/src/config_service.ts
    this.#configService.set('clientInfo.version', getLanguageServerVersion());
    const enableGlobalSkills = await this.#resolveEnableGlobalSkills();
    this.#configService.set('enableGlobalSkills', enableGlobalSkills);
    await this.#applyPersistedNotifications();
    this.#configService.set('telemetry.ide', {
      name: DUO_CLI_APP_NAME,
      version: getLanguageServerVersion(),
      vendor: DUO_CLI_APP_VENDOR,
    });
    this.#configService.set('telemetry.extension', {
      name: DUO_CLI_APP_NAME,
      version: getLanguageServerVersion(),
    });

    // Try to detect GitLab project from repository
    const repo = await this.#repositoryDiscoveryService.getMatchingRepository(cwd, workspaceFolder);
    const credentials = await this.#credentialProvider.getCredentials();

    this.#configService.set('baseUrl', credentials.baseUrl);

    const gitlabRemote = repo
      ? await tryParseRepositoryGitLabRemoteDetails(repo, credentials.baseUrl)
      : undefined;

    if (gitlabRemote?.namespaceWithPath) {
      this.#configService.set('projectPath', gitlabRemote.namespaceWithPath);
    }

    return { workspaceFolder, gitlabRemote };
  }

  async #initializeSystemContext(): Promise<AIContextItem[]> {
    try {
      await this.#systemContextManager.precalculateOnInitialized();
      const context = await this.#systemContextManager.getSystemContextItems();
      this.#logger.debug(`Initialized ${context.length} system context items`);
      return context;
    } catch (error) {
      this.#logger.error('Failed to initialize system context', error);
      return [];
    }
  }

  async #getUser(): Promise<{ username: string; defaultNamespacePath?: string }> {
    try {
      const user = await this.#userService.getUser();
      return {
        username: `@${user.username}`,
        defaultNamespacePath: user.duoDefaultNamespacePath,
      };
    } catch (error) {
      this.#logger.error('Error getting username', error);
      return { username: '' };
    }
  }

  async #checkBetaFeatures(
    remoteNamespace?: string,
    defaultNamespacePath?: string,
  ): Promise<{ criticalError?: string }> {
    if (this.#getExistingSessionIdFromConfig()) {
      this.#logger.debug('Running in headless mode, skipping beta features check');
      return {};
    }

    const credentials = await this.#credentialProvider.getCredentials();
    if (isAllowlistedInstance(credentials.baseUrl)) {
      this.#logger.info('Instance is on the beta allowlist, skipping beta features check');
      return {};
    }

    const namespacePath = remoteNamespace || defaultNamespacePath;

    if (!remoteNamespace && defaultNamespacePath) {
      this.#logger.debug(
        `No git remote namespace detected, using user default namespace: ${defaultNamespacePath}`,
      );
    }

    if (!namespacePath) {
      return { criticalError: DUO_NO_NAMESPACE_DETECTED_MESSAGE };
    }

    const rootNamespace = namespacePath.split('/')[0];

    const result = await this.#betaFeaturesCheckService.check(rootNamespace);

    if (result.status === 'error') {
      return {
        criticalError: `ALCOR is an experimental/beta feature.\n${result.message}`,
      };
    }

    return {};
  }

  /**
   * Resolves the effective telemetry enabled value.
   *
   * Priority:
   * 1. CLI flag (`--telemetry-enabled`) — when explicitly provided, it wins.
   * 2. Persisted user setting from `UserPersistentStorage`.
   * 3. Default: `true` (telemetry on by default).
   *
   * Note: `clientInfo.name` must be set in ConfigService before calling this,
   * so that `UserPersistentStorage` can resolve the client-scoped key.
   */
  async #resolveTelemetryEnabled(): Promise<boolean> {
    if (this.#cliInput.telemetryEnabled !== undefined) {
      this.#logger.debug(`Telemetry enabled from CLI flag: ${this.#cliInput.telemetryEnabled}`);
      return this.#cliInput.telemetryEnabled;
    }

    try {
      const stored = await this.#userPersistentStorage.get('telemetry');
      if (stored !== undefined && typeof stored.enabled === 'boolean') {
        this.#logger.debug(`Telemetry enabled from persisted setting: ${stored.enabled}`);
        return stored.enabled;
      }
    } catch (error) {
      this.#logger.warn('Failed to load persisted telemetry setting', error);
    }

    this.#logger.debug('Telemetry enabled by default');
    return true;
  }

  /**
   * Resolves the effective enableGlobalSkills value.
   *
   * Priority:
   * 1. CLI flag (`--enable-global-skills`) — when explicitly provided, it wins.
   * 2. Persisted user setting from `UserPersistentStorage`.
   * 3. Default: `false` (experimental feature, off by default).
   */
  async #resolveEnableGlobalSkills(): Promise<boolean> {
    if (this.#cliInput.enableGlobalSkills !== undefined) {
      this.#logger.debug(`enableGlobalSkills from CLI flag: ${this.#cliInput.enableGlobalSkills}`);
      return this.#cliInput.enableGlobalSkills;
    }

    try {
      const stored = await this.#userPersistentStorage.get('enableGlobalSkills');
      if (stored !== undefined && typeof stored.enabled === 'boolean') {
        this.#logger.debug(`enableGlobalSkills from persisted setting: ${stored.enabled}`);
        return stored.enabled;
      }
    } catch (error) {
      this.#logger.warn('Failed to load persisted enableGlobalSkills setting', error);
    }

    this.#logger.debug('enableGlobalSkills disabled by default');
    return false;
  }

  /**
   * Merges persisted notification settings over the ConfigService defaults.
   *
   * Persisted values from `UserPersistentStorage` take precedence over the defaults
   * defined in `DefaultConfigService`. Missing or invalid storage leaves defaults intact.
   */
  async #applyPersistedNotifications(): Promise<void> {
    try {
      const stored = await this.#userPersistentStorage.get('notifications');
      if (stored && typeof stored === 'object') {
        const current = this.#configService.get('notifications') ?? {};
        this.#configService.set('notifications', { ...current, ...stored });
      }
    } catch (error) {
      this.#logger.warn('Failed to load persisted notifications setting', error);
    }
  }

  #getExistingSessionIdFromConfig(): string | undefined {
    const { command } = this.#cliInput;

    if (command.name === 'run' || command.name === 'tui') {
      return command.existingSessionId;
    }

    return undefined;
  }
}
