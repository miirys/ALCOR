import { Logger, withPrefix } from '@gitlab-org/logging';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { WebviewConnectionProvider } from '@gitlab-org/webview';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import {
  GitLabApiService,
  FeatureStateManager,
  type ApiReconfiguredData,
  type FeatureState,
} from '@gitlab-org/core';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { ConfigService } from '@gitlab-org/config';
import type { WebviewConnection } from '@gitlab-org/webview-plugin';
import { GITLAB_CONNECTION_WEBVIEW_ID, type GitLabConnectionMessages } from './contract';
import type { GitLabConnectionInfo, GitLabConnectionStatus } from './types';

function connectionInfoEqual(a: GitLabConnectionInfo, b: GitLabConnectionInfo): boolean {
  if (
    a.status !== b.status ||
    a.reason !== b.reason ||
    a.instance?.instanceUrl !== b.instance?.instanceUrl ||
    a.instance?.instanceVersion !== b.instance?.instanceVersion ||
    a.project?.projectPath !== b.project?.projectPath ||
    a.project?.namespacePath !== b.project?.namespacePath
  ) {
    return false;
  }

  // Compare featureStates by engaged check IDs per feature — the meaningful
  // signal for consumers. Avoids spurious inequality from reference changes
  // or property insertion order differences.
  if (a.featureStates.length !== b.featureStates.length) return false;
  for (let i = 0; i < a.featureStates.length; i++) {
    const fa = a.featureStates[i];
    const fb = b.featureStates[i];
    if (fa.featureId !== fb.featureId) return false;
    if (fa.engagedChecks.length !== fb.engagedChecks.length) return false;
    for (let j = 0; j < fa.engagedChecks.length; j++) {
      if (fa.engagedChecks[j].checkId !== fb.engagedChecks[j].checkId) return false;
      if (fa.engagedChecks[j].engaged !== fb.engagedChecks[j].engaged) return false;
    }
    if (fa.allChecks.length !== fb.allChecks.length) return false;
    for (let j = 0; j < fa.allChecks.length; j++) {
      if (fa.allChecks[j].checkId !== fb.allChecks[j].checkId) return false;
      if (fa.allChecks[j].engaged !== fb.allChecks[j].engaged) return false;
    }
  }

  return true;
}

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    Logger,
    GitLabApiService,
    WorkflowRunner,
    ConfigService,
    WebviewConnectionProvider,
    FeatureStateManager,
  ],
  autoActivate: true,
})
export class GitLabConnectionService implements Disposable {
  #logger: Logger;

  #workflowRunner: WorkflowRunner;

  #connection: WebviewConnection<GitLabConnectionMessages>;

  #currentState: GitLabConnectionInfo;

  #disposable: CompositeDisposable;

  /** Last known API reconfiguration data — null until the first onApiReconfigured fires */
  #lastApiData: ApiReconfiguredData | null;

  /** Current feature states (authentication, licensing, feature flags per feature) */
  #featureStates: FeatureState[];

  constructor(
    logger: Logger,
    apiService: GitLabApiService,
    workflowRunner: WorkflowRunner,
    configService: ConfigService,
    connectionProvider: WebviewConnectionProvider,
    featureStateManager: FeatureStateManager,
  ) {
    this.#logger = withPrefix(logger, '[GitLabConnectionService]');
    this.#workflowRunner = workflowRunner;
    this.#featureStates = [];

    const compositeDisposable = new CompositeDisposable();

    // Seed from current API service snapshot. Both instanceInfo and tokenInfo
    // must be present to consider the API in a valid state — instanceInfo can
    // theoretically be set while tokenInfo is still undefined during partial init.
    this.#lastApiData =
      apiService.instanceInfo && apiService.tokenInfo
        ? {
            isInValidState: true,
            instanceInfo: apiService.instanceInfo,
            tokenInfo: apiService.tokenInfo,
          }
        : null;

    this.#currentState = this.#computeState();

    // Setup WebviewConnectionProvider connection
    this.#connection = connectionProvider.getConnection<GitLabConnectionMessages>(
      GITLAB_CONNECTION_WEBVIEW_ID,
    );

    this.#connection.onInstanceConnected((_instanceId, messageBus) => {
      this.#logger.debug(`Connection instance connected: ${_instanceId}`);

      messageBus.onNotification('appReady', () => {
        messageBus.sendNotification('connectionStateChanged', this.#currentState);
      });

      messageBus.onRequest('getConnectionInfo', async () => this.#currentState);
    });

    // Listen to API reconfiguration events (token validation, instance connect/disconnect).
    // We track the full ApiReconfiguredData so we can distinguish between "API never
    // configured" (null) vs "API configured but invalid" (isInValidState: false).
    compositeDisposable.add(
      apiService.onApiReconfigured((data: ApiReconfiguredData) => {
        this.#lastApiData = data;
        this.#recomputeAndBroadcast();
      }),
    );

    // We listen broadly to all config changes rather than filtering for
    // project-specific keys. The deep-equality check in #recomputeAndBroadcast
    // prevents spurious broadcasts — this is intentional simplicity over
    // premature optimization of filtering individual config keys.
    compositeDisposable.add(configService.onConfigChange(() => this.#recomputeAndBroadcast()));

    // Listen to feature state changes (authentication, licensing, feature flags).
    // onChange immediately calls the listener with the current state, which seeds
    // #featureStates before the first external change arrives.
    compositeDisposable.add(
      featureStateManager.onChange((states: FeatureState[]) => {
        this.#featureStates = states;
        this.#recomputeAndBroadcast();
      }),
    );

    this.#disposable = compositeDisposable;

    this.#logger.debug(`Initialized with status: ${this.#currentState.status}`);
  }

  dispose(): void {
    this.#disposable.dispose();
  }

  #recomputeAndBroadcast(): void {
    const newState = this.#computeState();
    if (connectionInfoEqual(newState, this.#currentState)) return;

    this.#logger.debug(
      `Connection state changed: ${this.#currentState.status} → ${newState.status}`,
    );
    this.#currentState = newState;
    this.#connection.broadcast('connectionStateChanged', this.#currentState);
  }

  #computeState(): GitLabConnectionInfo {
    const projectPath = this.#workflowRunner.getProjectPath();
    const namespacePath = this.#workflowRunner.getNamespacePath();

    // Only populate project context when a project path is actually present.
    // namespacePath alone isn't sufficient — hasProject should mean "a project
    // is open", not just "a namespace is configured".
    const project = projectPath ? { projectPath, namespacePath: namespacePath || '' } : null;

    let status: GitLabConnectionStatus;
    let instance: GitLabConnectionInfo['instance'] = null;
    let reason: string | null = null;

    if (!this.#lastApiData) {
      // API has never configured yet
      status = 'connecting';
    } else if (!this.#lastApiData.isInValidState) {
      // API configured but in an error state (invalid token, unreachable instance, etc.)
      status = 'error';
      reason = this.#lastApiData.validationMessage;
    } else {
      // API is valid and connected
      status = 'connected';
      instance = {
        instanceUrl: this.#lastApiData.instanceInfo.instanceUrl.toString(),
        instanceVersion: this.#lastApiData.instanceInfo.instanceVersion,
      };
    }

    return { status, instance, project, reason, featureStates: this.#featureStates };
  }
}
