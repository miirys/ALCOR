export * from './api';
export * from './workflow_handler';
export * from './document_transformer_service';
export { type ClientConfig } from '@gitlab-org/config';
export { supportedLanguages, type SupportedLanguageEntry } from './code_suggestions_config';
export * from './suggestion/connection_details_service';
export * from './suggestion/direct_connection_details_service';
export * from './suggestion/streaming_handler';
export * from './notifications';
export * from './requests';
export type * from './security_scan/types';
export {
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  CODE_SUGGESTIONS_TRACKING_EVENTS as TRACKING_EVENTS,
  CODE_SUGGESTIONS_CATEGORY,
  TELEMETRY_NOTIFICATION,
  type IClientContext,
  QUICK_CHAT_EVENT,
  QUICK_CHAT_OPEN_TRIGGER,
  QUICK_CHAT_CATEGORY,
  SECURITY_DIAGNOSTICS_CATEGORY,
  SECURITY_DIAGNOSTICS_EVENT,
} from './tracking';
export { friendlyTokenHashOnlyForLogging } from './utils/friendly_hash';
export * from './constants';
export { type Intent } from './tree_sitter';
export * from './feature_state';
export { type ThemeKeys } from '@gitlab-org/webview-theme';
export * from './ai_context_management';
export { commonContributions } from './contributions';

// Exports needed by src/node and src/browser (deep path re-exports)
export { log } from './log';
export { DefaultDocumentService, DocumentService } from './document_service';
export { DefaultTokenCheckNotifier } from './core/handlers/token_check_notifier';
export { ConnectionService, DefaultConnectionService } from './connection_service';
export { DefaultDirectoryWalker } from './services/fs';
export { DefaultSuggestionService } from './suggestion/suggestion_service';
export { DefaultVirtualFileSystemService } from './services/fs/virtual_file_system_service';
export { DefaultRepositoryService } from './services/git/repository_service';
export { EmptyFsClient, FsClient, type ExtendedPromiseFsClient } from './services/fs/fs';
export {
  SecurityDiagnosticsPublisher,
  DefaultSecurityDiagnosticsPublisher,
} from './security_scan/security_diagnostics_publisher';
export {
  SecurityScanNotifier,
  DefaultSecurityScanNotifier,
} from './security_scan/security_notifier';
export type { DiagnosticsPublisher } from './diagnostics_publisher';
export { CurrentOs } from './os';
export type { Project } from './core/services/project_service';
export { ProjectService } from './core/services/project_service';
export {
  DuoWorkspaceProjectAccessCache,
  type DuoProject,
} from './services/duo_access/workspace_project_access_cache';
export { TextDocumentChangeListenerType } from './text_document_change_listener_type';
export { DefaultDirectoryService } from './services/fs/directory_service';
export { DirectoryWalker, type DirectoryToSearch } from './services/fs/dir';
export { callbackify } from './utils/callbackify';
export { URL_PLACEHOLDER } from './utils/sanitize_url_from_string';
export {
  ApplyEditMessageDefinitionSource,
  LspFileAccessService,
} from './services/lsp_file_access_service';
export { NonceService } from './webview/nonce/nonce_service';
export { DefaultWebviewHtmlTransformer, WebviewHtmlTransformer } from './webview/html';
export type { WebviewUriProviderRegistry, WebviewUriProvider } from './webview';
export {
  ExtensionConnectionMessageBusProvider,
  WebviewLocationService,
  WebviewMetadataProvider,
  DefaultWebviewThemeBroadcastService,
} from './webview';
export {
  TreeSitterParserLoadState,
  COMMON_TREE_SITTER_LANGUAGES,
  AbstractTreeSitterParser,
  TreeSitterParser,
  type TreeSitterLanguageInfo,
} from './tree_sitter';
export { type SuggestionOptionText } from './api_types';
export { type SuggestionContext } from './suggestion_client';
export { JsonUrlProcessor } from './suggestion_client/post_processors/url_sanitization/json_url_processor';
export { YamlUrlProcessor } from './suggestion_client/post_processors/url_sanitization/yaml_url_processor';
export { TRACKED_EXTENSIONS } from './ai_context_management/context_providers/imports/ast/utils';

// AI context management deep exports
export { DefaultAgenticChatContextManager } from './ai_context_management/agentic_chat_context_manager';
export { DefaultCurrentFileContextProvider } from './ai_context_management/context_providers/current_file';
export { DefaultDependencyContextProvider } from './ai_context_management/context_providers/dependencies';
export { DefaultDependencyScanner } from './ai_context_management/context_providers/depdendency_scanner/scanner';
export { DefaultDirectoryContextProvider } from './ai_context_management/context_providers/directory';
export { DefaultDuoChatContextManager } from './ai_context_management/duo_chat_context_manager';
export { DefaultEditorSelectionContextProvider } from './ai_context_management/context_providers/editor_selection/editor_selection_context_provider';
export { DefaultImportContextProvider } from './ai_context_management/context_providers/imports/import_context_provider';
export { DefaultIssueContextProvider } from './ai_context_management/context_providers/issue';
export {
  DefaultJavascriptImportStore,
  JavascriptImportStore,
} from './ai_context_management/context_providers/imports/ast/javascript/javascript_import_store';
export { DefaultLocalFileContextProvider } from './ai_context_management/context_providers/file_local_search';
export { DefaultLocalGitContextProvider } from './ai_context_management/context_providers/local_git_context_provider';
export { DefaultMergeRequestContextProvider } from './ai_context_management/context_providers/merge_request';
export { DefaultRepositoryContextProvider } from './ai_context_management/context_providers/repository';
export { DefaultTerminalContextProvider } from './ai_context_management/context_providers/terminal';
export {
  DefaultTsConfigStore,
  TsConfigStore,
} from './ai_context_management/context_providers/imports/ast/javascript/ast/import_file_path_resolver/tsconfig_store';
export { JavascriptImportResolver } from './ai_context_management/context_providers/imports/ast/javascript/javascript_import_resolver';
export { RelativeJavaScriptFilePathResolver } from './ai_context_management/context_providers/imports/ast/javascript/ast/import_file_path_resolver/relative_javascript_file_path_resolver';
export { RemoteRepositoryContextItemStrategy } from './ai_context_management/context_providers/strategies/remote_repository_context_item_strategy';
export { WorkspaceRepositoryContextItemStrategy } from './ai_context_management/context_providers/strategies/workspace_repository_context_item_strategy';
export {
  AbstractJavaScriptImportFilePathResolver,
  JavaScriptImportFilePathResolver,
} from './ai_context_management/context_providers/imports/ast/javascript/ast/import_file_path_resolver/index';
export {
  CIRCUIT_BREAK_INTERVAL_MS,
  type CircuitBreaker,
  CircuitBreakerState,
  DEFAULT_BACKOFF_MULTIPLIER,
  DEFAULT_INITIAL_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_MS,
  ExponentialBackoffCircuitBreaker,
  type ExponentialBackoffCircuitBreakerOptions,
  FixedTimeCircuitBreaker,
  MAX_ERRORS_BEFORE_CIRCUIT_BREAK,
  MaxAttemptsCircuitBreaker,
  CHAT,
  CODE_SUGGESTIONS,
  AGENTIC_CHAT,
  AGENT_PLATFORM,
  AUTHENTICATION,
  DUO_DISABLED_FOR_PROJECT,
  CHAT_TERMINAL_CONTEXT,
  CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
  CHAT_NO_LICENSE,
  FLOWS,
  SANDBOX,
  SUGGESTIONS_API_ERROR,
  SUGGESTIONS_NO_CREDITS,
  UNSUPPORTED_GITLAB_VERSION,
  SUGGESTIONS_DISABLED_BY_USER,
  SUGGESTIONS_FILE_EXCLUDED,
  STATE_CHECK_USER_READABLE_LABELS,
  UNSUPPORTED_LANGUAGE,
  type Feature,
  type FeatureState,
  type FeatureStateCheck,
  type StateCheckId,
  // Repository provider types
  type RemoteUrl,
  type Remote,
  type Repository,
  type ProjectInRepository,
  type RepositoryWithoutProject,
  type SingleProjectRepository,
  type MultipleProjectRepository,
  type SelectedProjectRepository,
  type RepositoryState,
  type GetRepositoriesResponse,
  type SelectProjectParams,
  type ClearProjectParams,
  type GitRemoteUrlPointer,
  RepositoryEndpoints,
  RepositoriesChangedNotificationType,
} from '@gitlab-org/core';
export {
  type AIContextItem,
  AIContextCategory,
  type AIContextItemMetadata,
  DuoChatAIRequest,
} from '@gitlab-org/ai-context';
