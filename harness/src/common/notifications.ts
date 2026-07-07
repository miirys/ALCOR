import { NotificationType } from 'vscode-languageserver-protocol';
import { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';
import { WorkflowEvent, RunWorkflowPayload } from '@gitlab-lsp/workflow-api';
import { FeatureStateNotificationParams } from '@gitlab-org/core';
import { CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';
import { SecurityScanClientResponse } from './security_scan/types';
import { CODE_SUGGESTIONS_CATEGORY } from './tracking/code_suggestions/constants';
import { QUICK_CHAT_CATEGORY, QUICK_CHAT_EVENT, QuickChatContext } from './tracking/quick_chat';
import {
  SECURITY_DIAGNOSTICS_CATEGORY,
  SECURITY_DIAGNOSTICS_EVENT,
  SecurityDiagnosticsContext,
} from './tracking/security_scan/security_diagnostics_tracker';

export { DidChangeThemeNotificationType } from '@gitlab-org/webview-theme';

export const TOKEN_CHECK_NOTIFICATION = '$/gitlab/token/check';
export const FEATURE_STATE_CHANGE = '$/gitlab/featureStateChange';

export const FeatureStateChangeNotificationType =
  new NotificationType<FeatureStateNotificationParams>(FEATURE_STATE_CHANGE);

export interface TokenCheckNotificationParams {
  message?: string;
}

export const TokenCheckNotificationType = new NotificationType<TokenCheckNotificationParams>(
  TOKEN_CHECK_NOTIFICATION,
);
// TODO: once the following clients are updated:
//
// - JetBrains: https://gitlab.com/gitlab-org/editor-extensions/gitlab-jetbrains-plugin/-/blob/main/src/main/kotlin/com/gitlab/plugin/lsp/GitLabLanguageServer.kt#L16
//
// We should remove the `TextDocument` type from the parameter since it's deprecated
export type DidChangeDocumentInActiveEditorParams = TextDocument | DocumentUri;
export const DidChangeDocumentInActiveEditor =
  new NotificationType<DidChangeDocumentInActiveEditorParams>(
    '$/gitlab/didChangeDocumentInActiveEditor',
  );

export interface StreamWithId {
  /** unique stream ID */
  id: string;
}
export interface StreamingCompletionResponse {
  /** stream ID taken from the request, all stream responses for one request will have the request's stream ID */
  id: string;
  /** most up-to-date generated suggestion, each time LS receives a chunk from LLM, it adds it to this string -> the client doesn't have to join the stream */
  completion?: string;
  done: boolean;
}

export const STREAMING_COMPLETION_RESPONSE_NOTIFICATION = 'streamingCompletionResponse';
export const CANCEL_STREAMING_COMPLETION_NOTIFICATION = 'cancelStreaming';
export const StreamingCompletionResponseNotificationType =
  new NotificationType<StreamingCompletionResponse>(STREAMING_COMPLETION_RESPONSE_NOTIFICATION);
export const CancelStreamingNotificationType = new NotificationType<StreamWithId>(
  CANCEL_STREAMING_COMPLETION_NOTIFICATION,
);

export const API_ERROR_NOTIFICATION = '$/gitlab/api/error';
export const API_RECOVERY_NOTIFICATION = '$/gitlab/api/recovered';

export const ApiErrorNotificationType = new NotificationType<void>(API_ERROR_NOTIFICATION);
export const ApiRecoveryNotificationType = new NotificationType<void>(API_RECOVERY_NOTIFICATION);

export const REMOTE_SECURITY_SCAN = '$/gitlab/security/remoteSecurityScan';
export const REMOTE_SECURITY_SCAN_RESPONSE_NOTIFICATION = `${REMOTE_SECURITY_SCAN}/response`;

export type RemoteSecurityScanNotificationParam = {
  documentUri: DocumentUri;
  source: 'save' | 'command';
};
export const RemoteSecurityScanNotificationType =
  new NotificationType<RemoteSecurityScanNotificationParam>(REMOTE_SECURITY_SCAN);

export const RemoteSecurityResponseScanNotificationType =
  new NotificationType<SecurityScanClientResponse>(REMOTE_SECURITY_SCAN_RESPONSE_NOTIFICATION);

const TELEMETRY_NOTIFICATION = '$/gitlab/telemetry';

interface CodeSuggestionsContext {
  trackingId: string;
  optionId?: number;
}

interface CodeSuggestionsTelemetryNotificationParams {
  category: typeof CODE_SUGGESTIONS_CATEGORY;
  action: CODE_SUGGESTIONS_TRACKING_EVENTS;
  context: CodeSuggestionsContext;
}

interface QuickChatTelemetryNotificationParams {
  category: typeof QUICK_CHAT_CATEGORY;
  action: QUICK_CHAT_EVENT;
  context: QuickChatContext;
}

interface SecurityDiagnosticsNotificationParams {
  category: typeof SECURITY_DIAGNOSTICS_CATEGORY;
  action: SECURITY_DIAGNOSTICS_EVENT;
  context: SecurityDiagnosticsContext;
}

export type TelemetryNotificationParams =
  | CodeSuggestionsTelemetryNotificationParams
  | QuickChatTelemetryNotificationParams
  | SecurityDiagnosticsNotificationParams;

export const TelemetryNotificationType = new NotificationType<TelemetryNotificationParams>(
  TELEMETRY_NOTIFICATION,
);

export interface SendWorkflowEventNotificationParams {
  workflowID: string;
  eventType: WorkflowEvent;
  message?: { correlation_id: string; message: string };
}

export const START_WORKFLOW_NOTIFICATION = '$/gitlab/startWorkflow';
export const SEND_WORKFLOW_EVENT = '$/gitlab/sendWorkflowEvent';

export const StartWorkflowNotificationType = new NotificationType<RunWorkflowPayload>(
  START_WORKFLOW_NOTIFICATION,
);
export const SendWorkflowEventNotificationType =
  new NotificationType<SendWorkflowEventNotificationParams>(SEND_WORKFLOW_EVENT);
