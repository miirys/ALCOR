import { createInterfaceId, Injectable } from '@gitlab/needle';
import { NotificationType, PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import { Notifier, LsConnection, RepositoryProvider } from '@gitlab-org/core';
import { DuoChatContextManager } from '@gitlab-org/ai-context';
import {
  DidChangeThemeNotificationType,
  ThemeNotificationHandler,
} from '@gitlab-org/webview-theme';
import {
  ConnectionService,
  SecurityDiagnosticsPublisher,
  DiagnosticsPublisher,
  RemoteSecurityResponseScanNotificationType,
  RemoteSecurityScanNotificationType,
  SendWorkflowEventNotificationType,
  StartWorkflowNotificationType,
  AIContextEndpoints,
  SecurityScanNotifier,
  WorkflowHandler,
} from '@gitlab-org/legacy-common';
import { RepositoriesChangedNotificationType } from './services/gitlab/repository_provider';

export interface NodeConnectionService extends ConnectionService {}

export const NodeConnectionService =
  createInterfaceId<NodeConnectionService>('NodeConnectionService');

const createDiagnosticsPublisherFn = (c: LsConnection) => (param: PublishDiagnosticsParams) =>
  c.sendDiagnostics(param);

@Injectable(NodeConnectionService, [
  LsConnection,
  ConnectionService,
  SecurityDiagnosticsPublisher,
  ThemeNotificationHandler,
  DuoChatContextManager,
  SecurityScanNotifier,
  WorkflowHandler,
  RepositoryProvider,
])
export class DefaultNodeConnectionService implements NodeConnectionService {
  readonly #connection: LsConnection;

  readonly #connectionService: ConnectionService;

  readonly #securityDiagnosticsPublisher: SecurityDiagnosticsPublisher;

  readonly #themeNotificationHandler: ThemeNotificationHandler;

  readonly #chatContextManager: DuoChatContextManager;

  readonly #securityScanNotifier: SecurityScanNotifier;

  readonly #workflowHandler: WorkflowHandler;

  readonly #repositoryProvider: RepositoryProvider;

  constructor(
    connection: LsConnection,
    connectionService: ConnectionService,
    securityDiagnosticsPublisher: SecurityDiagnosticsPublisher,
    themeNotificationHandler: ThemeNotificationHandler,
    chatContextManager: DuoChatContextManager,
    securityScanNotifier: SecurityScanNotifier,
    workflowHandler: WorkflowHandler,
    repositoryProvider: RepositoryProvider,
  ) {
    this.#connection = connection;
    this.#connectionService = connectionService;
    this.#securityDiagnosticsPublisher = securityDiagnosticsPublisher;
    this.#themeNotificationHandler = themeNotificationHandler;
    this.#chatContextManager = chatContextManager;
    this.#securityScanNotifier = securityScanNotifier;
    this.#workflowHandler = workflowHandler;
    this.#repositoryProvider = repositoryProvider;
  }

  async initialize(): Promise<void> {
    await this.#connectionService.initialize();

    this.#connectionService.registerInitializeNotifier(
      RemoteSecurityResponseScanNotificationType,
      this.#securityScanNotifier,
    );

    this.#connection.onNotification(DidChangeThemeNotificationType, (message) =>
      this.#themeNotificationHandler.handleThemeChange(message),
    );

    this.#connection.onNotification(RemoteSecurityScanNotificationType, (params) => {
      this.#securityDiagnosticsPublisher.handleScanNotification(params);
    });

    // diagnostics publishers
    this.#initializeDiagnosticsPublisher(this.#securityDiagnosticsPublisher);

    // AI Context
    this.#connection.onRequest(AIContextEndpoints.QUERY, (query) =>
      this.#chatContextManager.searchContextItems({ ...query, featureType: 'duo_chat' }),
    );
    this.#connection.onRequest(AIContextEndpoints.ADD, (item) =>
      this.#chatContextManager.addSelectedContextItem(item),
    );
    this.#connection.onRequest(AIContextEndpoints.REMOVE, (item) =>
      this.#chatContextManager.removeSelectedContextItem(item),
    );
    this.#connection.onRequest(AIContextEndpoints.CURRENT_ITEMS, () =>
      this.#chatContextManager.getSelectedContextItems(),
    );
    this.#connection.onRequest(AIContextEndpoints.CLEAR, () =>
      this.#chatContextManager.clearSelectedContextItems(),
    );
    this.#connection.onRequest(AIContextEndpoints.RETRIEVE, () =>
      this.#chatContextManager.retrieveContextItemsWithContent(),
    );
    this.#connection.onRequest(AIContextEndpoints.GET_PROVIDER_CATEGORIES, () =>
      this.#chatContextManager.getAvailableCategories(),
    );
    this.#connection.onRequest(AIContextEndpoints.GET_ITEM_CONTENT, (item) =>
      this.#chatContextManager.getItemWithContent(item),
    );

    // Workflow
    this.#connection.onNotification(
      StartWorkflowNotificationType,
      this.#workflowHandler.startWorkflowNotificationHandler,
    );

    this.#connection.onNotification(
      SendWorkflowEventNotificationType,
      this.#workflowHandler.sendWorkflowEventHandler,
    );

    // Client repository data provider
    this.registerInitializeNotifier(RepositoriesChangedNotificationType, this.#repositoryProvider);
  }

  registerInitializeNotifier<T>(method: NotificationType<T>, notifier: Notifier<T>): void {
    this.#connectionService.registerInitializeNotifier<T>(method, notifier);
  }

  registerInitializedHandler(handler: () => void): void {
    this.#connectionService.registerInitializedHandler(handler);
  }

  #initializeDiagnosticsPublisher(publisher: DiagnosticsPublisher) {
    publisher.init(createDiagnosticsPublisherFn(this.#connection));
  }
}
