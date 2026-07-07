import { type AIContextItem } from '@gitlab-org/ai-context';
import { DUO_NAMESPACE_NOT_ENTITLED_MESSAGE, PaginationInfo } from '@gitlab-org/core';
import { WorkflowExecutorError } from './workflow_executor_error';
import { AGENT_PRIVILEGES } from './agent_privileges';

// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum DuoWorkflowStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
  FAILED = 'FAILED',
  STOPPED = 'STOPPED',
  INPUT_REQUIRED = 'INPUT_REQUIRED',
  PLAN_APPROVAL = 'PLAN_APPROVAL_REQUIRED',
  TOOL_APPROVAL = 'TOOL_CALL_APPROVAL_REQUIRED',
}
/* eslint-enable @typescript-eslint/naming-convention */

export const isTerminated = (
  status: DuoWorkflowStatus,
): status is DuoWorkflowStatus.FINISHED | DuoWorkflowStatus.FAILED | DuoWorkflowStatus.STOPPED =>
  [DuoWorkflowStatus.FINISHED, DuoWorkflowStatus.FAILED, DuoWorkflowStatus.STOPPED].includes(
    status,
  );

export const isInProgressState = (status: DuoWorkflowStatus) =>
  [DuoWorkflowStatus.CREATED, DuoWorkflowStatus.RUNNING].includes(status);

export const isRunning = (status: DuoWorkflowStatus) => !isTerminated(status);

export const isApprovingPlan = (status: DuoWorkflowStatus) =>
  status === DuoWorkflowStatus.PLAN_APPROVAL;
export const isNeedsInput = (status: DuoWorkflowStatus) =>
  status === DuoWorkflowStatus.INPUT_REQUIRED;
export const isAwaitingToolApproval = (status: DuoWorkflowStatus) =>
  status === DuoWorkflowStatus.TOOL_APPROVAL || (status as string) === 'REQUIRE_TOOL_CALL_APPROVAL';
export const isAwaitingUserInput = (status: DuoWorkflowStatus) =>
  isApprovingPlan(status) || isNeedsInput(status);

export enum MessageType {
  User = 'user',
  Agent = 'agent',
  Tool = 'tool',
}

export interface Message {
  message_type: MessageType;
}

export const isUserMessage = (message: Message) => message.message_type === MessageType.User;

export enum WorkflowEvent {
  PAUSE = 'pause',
  RESUME = 'resume',
  STOP = 'stop',
  MESSAGE = 'message',
}

export enum WorkflowType {
  CHAT = 'chat',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SOFTWARE_DEVELOPMENT = 'software_development',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SOFTWARE_DEVELOPMENT_V1 = 'software_development/v1',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SEARCH_AND_REPLACE = 'search_and_replace',
}

export enum WorkflowFilter {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  FOUNDATIONAL_CHAT_AGENTS = 'foundational_chat_agents',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NON_FOUNDATIONAL_CHAT_AGENTS = 'non_foundational_chat_agents',
}

export type WorkflowMetadata = {
  projectId: string;
  projectPath: string;
  namespaceId: string;
  rootNamespaceId: string;
  rootFsPath: string;
  selectedModelIdentifier: string;
};

export type CreateWorkflowOptions = {
  allowAgentToRequestUser?: boolean;
  agentPrivileges?: AGENT_PRIVILEGES[];
  preApprovedAgentPrivileges?: AGENT_PRIVILEGES[];
  requiresDuoCliEnabled?: boolean;
};

export enum ToolApprovalType {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  APPROVE_ONCE = 'approve_once',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  APPROVE_FOR_SESSION = 'approve-for-session',
  // follows existing enum naming convention
  // eslint-disable-next-line @typescript-eslint/naming-convention
  APPROVE_PATTERN_FOR_SESSION = 'approve-pattern-for-session',
}

/**
 * Represents approval for a single tool invocation.
 * toolArgs are optional since persistence is not required.
 */
export interface ToolApprovalApprovedOnce {
  userApproved: true;
  toolName: string;
  type: ToolApprovalType.APPROVE_ONCE;
  toolArgs?: Record<string, unknown>;
}

/**
 * Represents approval for all future invocations of a tool in this session.
 * toolArgs are required to enable backend persistence and matching.
 */
export interface ToolApprovalApprovedSession {
  userApproved: true;
  toolName: string;
  type: ToolApprovalType.APPROVE_FOR_SESSION;
  toolArgs: Record<string, unknown>; // Required for session approvals!
}

/**
 * Represents approval for future invocations of a tool matching a glob pattern.
 * pattern is the glob string (e.g. "git checkout *") sent to the backend for matching.
 */
export interface ToolApprovalApprovedPatternSession {
  userApproved: true;
  toolName: string;
  type: ToolApprovalType.APPROVE_PATTERN_FOR_SESSION;
  pattern: string;
}

/**
 * Union of all tool approval types.
 * Use discriminated union on `type` field for type narrowing.
 */
export type ToolApprovalApproved =
  | ToolApprovalApprovedOnce
  | ToolApprovalApprovedSession
  | ToolApprovalApprovedPatternSession;

export interface ToolApprovalRejected {
  userApproved: false;
  message?: string;
}

export type ToolApproval = ToolApprovalApproved | ToolApprovalRejected;

export type RunWorkflowPayload = {
  goal: string;
  type?: WorkflowType;
  metadata: Partial<WorkflowMetadata>;
  existingWorkflowId?: string;
  preCreatedWorkflowId?: string;
  additionalContext: AIContextItem[];
  toolApproval?: ToolApproval;
  flowConfig?: string;
  aiCatalogItemVersionId?: string;
  flowConfigSchemaVersion?: string;
  flowConfigId?: string;
  flowVersion?: string;
  workflowDefinition?: string;
  agentPlatformFeatureSettingName?: string;
  excludeMcpTools?: boolean;
  additionalOptions?: CreateWorkflowOptions;
  langsmithTrace?: string;
  /** Enable UI response streaming (token-by-token) for this workflow session. */
  streaming?: boolean;
};

export type PreCreateWorkflowPayload = {
  draftGoal: string;
  type: WorkflowType;
  metadata: Partial<WorkflowMetadata>;
  workflowDefinition?: string;
  aiCatalogItemVersionId?: string;
};

export type DuoWorkflowEvent = {
  checkpoint: string;
  errors: string[];
  workflowGoal: string;
  workflowStatus: DuoWorkflowStatus;
  /**
   * Per-agent context-window usage, keyed by agent name. Carried on the
   * `NewCheckpoint` event from the workflow service. Absent when the service
   * does not report usage for this checkpoint.
   */
  agentContextUsage?: Record<string, { totalTokens: number; maxTokens: number }>;
};

export function isWorkflowExecutorErrorEvent(event: unknown): event is WorkflowExecutorError {
  return event instanceof WorkflowExecutorError;
}

/**
 * Type guard for `DuoWorkflowEvent`. Discriminates on `workflowStatus`, which
 * other stream events (`WorkflowExecutorError`, `WorkflowRetryEvent`) do not carry.
 */
export function isDuoWorkflowEvent(event: unknown): event is DuoWorkflowEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'workflowStatus' in event &&
    Object.values(DuoWorkflowStatus).includes(
      (event as { workflowStatus: unknown }).workflowStatus as DuoWorkflowStatus,
    )
  );
}

export type WorkflowRetryEvent = {
  kind: 'retry';
  attempt: number;
  maxAttempts: number;
  backoffMs: number;
};

export function isWorkflowRetryEvent(event: unknown): event is WorkflowRetryEvent {
  if (typeof event !== 'object' || event === null || !('kind' in event)) {
    return false;
  }
  const candidate = event as Partial<WorkflowRetryEvent>;
  return (
    candidate.kind === 'retry' &&
    typeof candidate.attempt === 'number' &&
    typeof candidate.maxAttempts === 'number' &&
    typeof candidate.backoffMs === 'number'
  );
}

/** Union of everything an executor can yield over the workflow stream.
 * Server originating DuoWorkflowEvent, and client synthesized WorkflowExecutorError + WorkflowRetryEvent */
export type WorkflowStreamEvent = DuoWorkflowEvent | WorkflowExecutorError | WorkflowRetryEvent;

export type DuoWorkflowEvents = {
  nodes: DuoWorkflowEvent[];
};

export type DuoWorkflowsStatusNode = {
  id: string;
  status: DuoWorkflowStatus;
};

export type DuoWorkflowProjectNode = {
  project?: {
    fullPath: string;
  };
};

export type DuoWorkflowEventConnection = {
  duoWorkflowEvents: DuoWorkflowEvents;
  duoWorkflowWorkflows: {
    nodes: (DuoWorkflowsStatusNode & DuoWorkflowProjectNode)[];
  };
};

export type DuoWorkflowLatestCheckpoint = {
  duoWorkflowWorkflows: {
    nodes: (DuoWorkflowNodeLatestCheckpoint & DuoWorkflowProjectNode)[];
  };
};

type DuoWorkflowNodeLatestCheckpoint = {
  latestCheckpoint: DuoWorkflowEvent;
};

export type CheckpointStatus = 'Planning' | 'Execution' | 'Completed' | 'Error';

export type ChannelValue = {
  status: CheckpointStatus;
};

export type DuoWorkflowCheckpoint = {
  ts: string;
  channel_values: ChannelValue;
};

export type ParsedDuoWorkflowEvent = {
  checkpoint: DuoWorkflowCheckpoint;
  errors: string[];
  workflowGoal: string;
  workflowStatus: DuoWorkflowStatus;
  supportsSessionApprovals?: boolean; // Whether full stack supports session-wide tool approvals
  supportsPatternApprovals?: boolean; // Whether full stack supports pattern-based tool approvals
};

export type DuoWorkflowInfo = {
  id: string;
  projectId: string;
  humanStatus: string;
  createdAt: string;
  updatedAt: string;
  goal?: string;
  firstCheckpoint?: DuoWorkflowEvent;
};

export type DuoWorkflowsNode = {
  node: DuoWorkflowInfo;
};

export type DuoWorkflowsEdge = {
  node: DuoWorkflowInfo;
};

export type DuoWorkflowConnection = {
  edges: DuoWorkflowsEdge[];
  pageInfo: PaginationInfo;
};

export type DuoWorkflowsPayload = {
  duoWorkflowWorkflows: DuoWorkflowConnection;
};

export type ProjectInfo = {
  id: string;
  fullPath: string;
};

export enum DuoWorkflowStatusEvent {
  START = 'start',
  PAUSE = 'pause',
  RESUME = 'resume',
  FINISH = 'finish',
  DROP = 'drop',
}

export type DuoWorkflowMessage = {
  correlation_id: string;
  message: string;
};

export type ContainerParams = {
  project_id: string | undefined;
  namespace_id: string | undefined;
};

export type DuoWorkflowStatusUpdate = {
  workflowId: string;
  statusEvent: DuoWorkflowStatusEvent;
};

export type DuoWorkflowStatusUpdateResponse = {
  workflow: {
    id: string;
    status: DuoWorkflowStatus;
  };
};

export type EnablementCheckType = {
  name: string;
  value: boolean;
  message: string;
};

export type HealthCheckData = {
  enabled: boolean;
  checks: EnablementCheckType[];
};

export type HealthCheckResponse = {
  project: {
    id: string;
    duoWorkflowStatusCheck: HealthCheckData;
  } | null;
};

type AiCatalogItem = {
  id: string;
  name: string;
  description: string;
  latestVersion: {
    id: string;
  };
  pinnedItemVersionId?: string;
};

type AiCatalogItemNode = {
  id: string;
  pinnedItemVersion?: { id: string };
  item: AiCatalogItem;
};

export type AiCatalogItemResult = {
  aiCatalogConfiguredItems: {
    nodes: AiCatalogItemNode[];
  };
  metadata: {
    version: string;
  };
};

export const WorkflowSuccessCode = 0 as const;

// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum WorkflowStatusCode {
  GENERAL_FAILURE = 1,
  FAILED_TO_START = 2,
  AUTH_TOKEN_ERROR = 3,
  CREATION_FAILED = 4,
  FAILED_TO_START_ALT = 5, // Same as FAILED_TO_START but different code (?)
  SERVICE_CONNECTION_FAILED = 6,

  // specific error handling added in the node_executor, no equivalents for Go executor
  AUTH_TOKEN_FETCH_ERROR = 50,
  INVALID_API_CONFIGURATION = 51,
  MISSING_CERTIFICATE_SETTINGS = 53,
  SERVICE_CONNECTION_DROPPED = 54,
  SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG = 55,
  SERVICE_CONNECTION_INTERNAL_ERROR = 56,
  SERVICE_CONNECTION_BAD_GATEWAY = 57,
  SERVICE_CONNECTION_TLS_HANDSHAKE = 58,
  SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE = 59,
  LOCKED_SOCKET = 60,
  USAGE_QUOTA_EXCEEDED = 62,
  NO_DUO_ACCESS = 63,
}
/* eslint-enable @typescript-eslint/naming-convention */

export const WorkflowStatusCodeMessages: Record<WorkflowStatusCode, string> = {
  [WorkflowStatusCode.GENERAL_FAILURE]:
    'Your request was valid but Workflow failed to complete it. Please try again.',
  [WorkflowStatusCode.FAILED_TO_START]: 'Workflow failed to start.',
  [WorkflowStatusCode.AUTH_TOKEN_ERROR]:
    'Workflow could not use your token to connect to your GitLab instance.',
  [WorkflowStatusCode.CREATION_FAILED]: 'The service could not create the workflow.',
  [WorkflowStatusCode.FAILED_TO_START_ALT]: 'Workflow failed to start.',
  [WorkflowStatusCode.SERVICE_CONNECTION_FAILED]:
    'Workflow could not connect to the Workflow service. See also https://docs.gitlab.com/user/duo_agent_platform/troubleshooting/#network-issues',
  [WorkflowStatusCode.AUTH_TOKEN_FETCH_ERROR]:
    'An error occurred while fetching an authentication token for this workflow.',
  [WorkflowStatusCode.INVALID_API_CONFIGURATION]:
    'GitLab API configuration details (instanceUrl and token) are unavailable in the extension. Restart your editor and try again.',
  [WorkflowStatusCode.MISSING_CERTIFICATE_SETTINGS]:
    "The client has not been configured to trust the server's SSL certificate. If you are using a proxy or custom certificate authority you must configure this. See also https://docs.gitlab.com/editor_extensions/language_server/#configure-the-language-server-to-use-a-proxy",
  [WorkflowStatusCode.SERVICE_CONNECTION_DROPPED]:
    'The connection to the server was dropped or abnormally closed. This could be due to an intermittent network connectivity issue.',
  [WorkflowStatusCode.SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG]:
    'The connection to the server was closed because the message was too large.',
  [WorkflowStatusCode.SERVICE_CONNECTION_INTERNAL_ERROR]:
    'The connection to the server was closed because the server encountered an internal error.',
  [WorkflowStatusCode.SERVICE_CONNECTION_BAD_GATEWAY]:
    'The connection to the server was closed because the server encountered an error from an upstream service (502 bad gateway).',
  [WorkflowStatusCode.SERVICE_CONNECTION_TLS_HANDSHAKE]:
    'The connection to the server was closed due to a failure to perform a TLS handshake (server certificate cannot be verified).',
  [WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE]:
    'The connection to the server was closed because the message contained an unsupported data type.',
  [WorkflowStatusCode.USAGE_QUOTA_EXCEEDED]: `No credits remain for this billing period.\n\nContact your administrator for more credits, or switch to Non-Agentic Chat to continue.\n\nWhen you have more credits, refresh.`,
  [WorkflowStatusCode.LOCKED_SOCKET]:
    'GitLab Duo is already responding to this chat in another tab or location. Start a new chat, or wait for GitLab Duo to finish before sending a new message.',
  [WorkflowStatusCode.NO_DUO_ACCESS]: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
};

export const generateErrorMessageFromStatusCode = (
  statusCode: WorkflowStatusCode | null,
): string => {
  if (statusCode === null || !(statusCode in WorkflowStatusCodeMessages)) {
    return WorkflowStatusCodeMessages[WorkflowStatusCode.GENERAL_FAILURE];
  }
  return WorkflowStatusCodeMessages[statusCode as WorkflowStatusCode];
};

const TRANSIENT_STATUS_CODES = new Set<WorkflowStatusCode>([
  WorkflowStatusCode.SERVICE_CONNECTION_DROPPED,
  WorkflowStatusCode.SERVICE_CONNECTION_CLOSED_MESSAGE_TOO_BIG,
  WorkflowStatusCode.SERVICE_CONNECTION_BAD_GATEWAY,
  WorkflowStatusCode.SERVICE_CONNECTION_TLS_HANDSHAKE,
  WorkflowStatusCode.SERVICE_CONNECTION_UNSUPPORTED_DATA_TYPE,
  WorkflowStatusCode.LOCKED_SOCKET,
  WorkflowStatusCode.USAGE_QUOTA_EXCEEDED,
]);

/**
 * Whether a failure code leaves the server-side workflow alive and resumable
 * (connection-level drops, locked socket, quota exhaustion) rather than killing
 * it. Callers use this to decide whether to keep reusing the same workflow.
 *
 * Conservative allowlist: any code not listed defaults to "not transient", so a
 * newly added enum member is treated as fatal until explicitly added here. That
 * default favours starting a fresh workflow over silently reusing a dead one;
 * connection-level codes that should preserve the workflow must be added above.
 */
export const isTransientStatusCode = (statusCode: WorkflowStatusCode): boolean =>
  TRANSIENT_STATUS_CODES.has(statusCode);
