import {
  NotificationType,
  CompletionItem,
  InlineCompletionRequest,
  DidChangeWorkspaceFoldersNotification,
} from 'vscode-languageserver-protocol';
import { FeatureStateManager, Notifier, LsConnection } from '@gitlab-org/core';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { VirtualFileSystemService } from '@gitlab-org/fs';
import { InitializeHandler } from './core/handlers/initialize_handler';
import { DidChangeWorkspaceFoldersHandler } from './core/handlers/did_change_workspace_folders_handler';
import { TokenCheckNotifier } from './core/handlers/token_check_notifier';
import {
  FeatureStateChangeNotificationType,
  TokenCheckNotificationType,
  DidChangeDocumentInActiveEditor,
  ApiErrorNotificationType,
  ApiRecoveryNotificationType,
  StreamingCompletionResponseNotificationType,
  CancelStreamingNotificationType,
  TelemetryNotificationType,
} from './notifications';
import { DocumentService } from './document_service';
import { SuggestionApiErrorNotifier } from './feature_state/suggestion_api_error_notifier';
import { StreamingHandler } from './suggestion/streaming_handler';
import { SuggestionService } from './suggestion/suggestion_service';
import {
  CONFIGURATION_VALIDATION_REQUEST,
  ConfigurationValidationService,
} from './configuration_validation/configuration_validation_service';
import { TelemetryNotificationHandler } from './core/handlers/telemetry_notification_handler';
import { DidChangeConfigurationHandler } from './core/handlers/did_change_configuration_handler';

export interface ConnectionService {
  initialize(): Promise<void>;
  registerInitializeNotifier<T>(method: NotificationType<T>, notifier: Notifier<T>): void;
  registerInitializedHandler(handler: () => void): void;
}

export const ConnectionService = createInterfaceId<ConnectionService>('ConnectionService');

const createNotifyFn =
  <T>(c: LsConnection, method: NotificationType<T>) =>
  (param: T) =>
    c.sendNotification(method, param);

@Injectable(ConnectionService, [
  LsConnection,
  TokenCheckNotifier,
  InitializeHandler,
  DidChangeWorkspaceFoldersHandler,
  DocumentService,
  FeatureStateManager,
  SuggestionApiErrorNotifier,
  StreamingHandler,
  SuggestionService,
  ConfigurationValidationService,
  TelemetryNotificationHandler,
  DidChangeConfigurationHandler,
  VirtualFileSystemService,
])
export class DefaultConnectionService implements ConnectionService {
  readonly #connection: LsConnection;

  readonly #tokenCheckNotifier: TokenCheckNotifier;

  readonly #initializeHandler: InitializeHandler;

  readonly #didChangeWorkspaceFoldersHandler: DidChangeWorkspaceFoldersHandler;

  readonly #documentService: DocumentService;

  readonly #featureStateManager: FeatureStateManager;

  readonly #suggestionApiErrorNotifier: SuggestionApiErrorNotifier;

  readonly #streamingHandler: StreamingHandler;

  readonly #suggestionService: SuggestionService;

  readonly #configValidationService: ConfigurationValidationService;

  readonly #telemetryNotificationHandler: TelemetryNotificationHandler;

  readonly #didChangeConfigurationHandler: DidChangeConfigurationHandler;

  readonly #virtualFileSystemService: VirtualFileSystemService;

  readonly #initializedNotifiers: Map<NotificationType<unknown>, Notifier<unknown>> = new Map();

  readonly #initializedHandlers: (() => void)[] = [];

  constructor(
    connection: LsConnection,
    tokenCheckNotifier: TokenCheckNotifier,
    initializeHandler: InitializeHandler,
    didChangeWorkspaceFoldersHandler: DidChangeWorkspaceFoldersHandler,
    documentService: DocumentService,
    featureStateManager: FeatureStateManager,
    suggestionApiErrorNotifier: SuggestionApiErrorNotifier,
    streamingHandler: StreamingHandler,
    suggestionService: SuggestionService,
    configValidationService: ConfigurationValidationService,
    telemetryNotificationHandler: TelemetryNotificationHandler,
    didChangeConfigurationHandler: DidChangeConfigurationHandler,
    virtualFileSystemService: VirtualFileSystemService,
  ) {
    this.#connection = connection;
    this.#tokenCheckNotifier = tokenCheckNotifier;
    this.#initializeHandler = initializeHandler;
    this.#didChangeWorkspaceFoldersHandler = didChangeWorkspaceFoldersHandler;
    this.#documentService = documentService;
    this.#featureStateManager = featureStateManager;
    this.#suggestionApiErrorNotifier = suggestionApiErrorNotifier;
    this.#streamingHandler = streamingHandler;
    this.#suggestionService = suggestionService;
    this.#configValidationService = configValidationService;
    this.#telemetryNotificationHandler = telemetryNotificationHandler;
    this.#didChangeConfigurationHandler = didChangeConfigurationHandler;
    this.#virtualFileSystemService = virtualFileSystemService;
  }

  async initialize(): Promise<void> {
    // notifiers
    this.registerInitializeNotifier(TokenCheckNotificationType, this.#tokenCheckNotifier);
    this.registerInitializeNotifier(FeatureStateChangeNotificationType, this.#featureStateManager);
    this.registerInitializeNotifier(
      StreamingCompletionResponseNotificationType,
      this.#streamingHandler,
    );

    // request handlers
    this.#connection.onInitialize(this.#initializeHandler.requestHandler);
    // suggestion handlers
    this.#connection.onCompletion(this.#suggestionService.completionHandler);
    // TODO: does Visual Studio or Neovim need this? VS Code doesn't
    this.#connection.onCompletionResolve((item: CompletionItem) => item);
    this.#connection.onRequest(
      InlineCompletionRequest.type,
      this.#suggestionService.inlineCompletionHandler,
    );

    this.#connection.onRequest(CONFIGURATION_VALIDATION_REQUEST, (config) =>
      this.#configValidationService.validate(config),
    );

    this.#connection.onInitialized(async () => {
      for (const [method, notifier] of this.#initializedNotifiers.entries()) {
        this.#initializeNotifier(method, notifier);
      }

      for (const handler of this.#initializedHandlers) {
        handler();
      }

      // FIXME: the following notifications are deprecated, once all clients use state check
      // src/common/feature_state/suggestion_api_error_check.ts
      // we can remove these notifiers
      this.#suggestionApiErrorNotifier.setErrorNotifyFn(
        createNotifyFn(this.#connection, ApiErrorNotificationType),
      );
      this.#suggestionApiErrorNotifier.setRecoveryNotifyFn(
        createNotifyFn(this.#connection, ApiRecoveryNotificationType),
      );

      // This notification must be registered on initialized! It won't work if you register it before initialization.
      this.#connection.onNotification(DidChangeWorkspaceFoldersNotification.method, (params) => {
        this.#didChangeWorkspaceFoldersHandler.notificationHandler(params);
      });

      // Don't start filesystem watcher and RepositoryService initialisation until connection is established
      await this.#virtualFileSystemService.setup();
    });

    // notification handlers
    this.#connection.onNotification(DidChangeDocumentInActiveEditor, (params) =>
      this.#documentService.notificationHandler(params),
    );
    this.#connection.onNotification(CancelStreamingNotificationType, (stream) =>
      this.#streamingHandler.notificationHandler(stream),
    );
    this.#connection.onNotification(TelemetryNotificationType, (params) =>
      this.#telemetryNotificationHandler.notificationHandler(params),
    );
    this.#connection.onDidChangeConfiguration(
      this.#didChangeConfigurationHandler.notificationHandler,
    );
  }

  registerInitializeNotifier<T>(method: NotificationType<T>, notifier: Notifier<T>): void {
    this.#initializedNotifiers.set(method, notifier);
  }

  registerInitializedHandler(handler: () => void): void {
    this.#initializedHandlers.push(handler);
  }

  #initializeNotifier<T>(method: NotificationType<T>, notifier: Notifier<T>) {
    notifier.init(createNotifyFn(this.#connection, method));
  }
}
