import { createInterfaceId } from '@gitlab/needle';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { AIContextItem } from '@gitlab-org/ai-context';

type BackendId = 'gitlab' | 'anthropic';

export type AgentMode = 'build' | 'plan';

export enum AgentEventType {
  TextChunk = 'TEXT_CHUNK',
  ToolStart = 'TOOL_START',
  ToolComplete = 'TOOL_COMPLETE',
  ToolAwaitingApproval = 'TOOL_AWAITING_APPROVAL',
  Error = 'ERROR',
  Retry = 'RETRY',
  TokenUsage = 'TOKEN_USAGE',
}

export type AgentEvent =
  | { type: AgentEventType.TextChunk; messageId: string; content: string; timestamp: number }
  | {
      type: AgentEventType.ToolStart;
      toolId: string;
      name: string;
      input: ToolInputDisplay;
      timestamp: number;
    }
  | {
      type: AgentEventType.ToolComplete;
      toolId: string;
      result: string;
      error?: string;
      timestamp: number;
    }
  | {
      type: AgentEventType.ToolAwaitingApproval;
      toolId: string;
      // FIXME this should not be necessary in the schema, we use it now as data store for the gitlab backend
      toolName: string;
      input: ToolInputDisplay;
      content: string;
      timestamp: number;
      availableScopes: ApprovalScope[];
      suggestedPatterns?: string[];
    }
  | { type: AgentEventType.Error; message: string; timestamp: number }
  | {
      type: AgentEventType.Retry;
      attempt: number;
      maxAttempts: number;
      backoffMs: number;
      timestamp: number;
    }
  | {
      type: AgentEventType.TokenUsage;
      totalTokens: number;
      maxTokens: number;
      timestamp: number;
    };

export type RetryAgentEvent = Extract<AgentEvent, { type: AgentEventType.Retry }>;

export enum UserEventType {
  UserMessage = 'USER_MESSAGE',
}

export type UserEvent = {
  type: UserEventType.UserMessage;
  messageId: string;
  content: string;
  timestamp: number;
};

export type SessionEvent = AgentEvent | UserEvent;

export enum UserActionType {
  SendPrompt = 'SEND_PROMPT',
  SendToolApproval = 'SEND_TOOL_APPROVAL',
}

export interface SendPromptAction {
  type: UserActionType.SendPrompt;
  prompt: string;
  aiContextItems?: AIContextItem[];
  agentMode?: AgentMode;
}

export type ApprovalScope = 'session' | 'once';

export interface BackendInitResult {
  sessionId: string;
  sessionRejectionReason?: string;
}

export type ToolApprovalAction = {
  type: UserActionType.SendToolApproval;
  toolId: string;
  // FIXME this should not be necessary in the schema, we use it now as data store for the gitlab backend
  toolName: string;
  agentMode?: AgentMode;
  toolArgs?: Record<string, unknown>;
} & (
  | { approved: true; scope: ApprovalScope; pattern?: string }
  | { approved: false; rejectionReason?: string }
);

export type UserAction = SendPromptAction | ToolApprovalAction;

export interface CliBackend {
  id: BackendId;

  /**
   * Optional pre-initialization for expensive, non-blocking operations.
   * Controllers can call this early in the background to warm up resources.
   *
   * Examples: Preloading MCP servers, warming caches, establishing connections
   *
   * @returns Promise that resolves when pre-initialization completes or fails gracefully
   */
  preinitialize?(): Promise<void>;

  initialize(existingSessionId?: string): Promise<BackendInitResult>;
  sendMessageStream(
    action: UserAction,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent, void, void>;

  /**
   * The session id currently in use. May differ from the id returned by
   * `initialize` when a terminated session is recovered mid-conversation and a
   * fresh one is started in its place, so callers that surface a resumable id
   * (e.g. the resume hint) should read this rather than caching the initial value.
   */
  getSessionId?(): string | undefined;

  dispose(): void;
}

export const CliBackend = createInterfaceId<CliBackend>('CliBackend');
