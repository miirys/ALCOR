import { createInterfaceId } from '@gitlab/needle';
import { TelemetryService } from '../service';

export const DUO_AGENT_PLATFORM_CATEGORY = 'duo_agent_platform';

export enum DuoAgentPlatformEvent {
  WorkflowStopped = 'workflow_stopped',
  TimeToFirstTokenStreamed = 'time_to_first_token_streamed',
  TimeToAwaitingUserInput = 'time_to_awaiting_user_input',
  StreamingTime = 'streaming_time',
  UserFeedback = 'ai_duo_agentic_chat_feedback_submitted',
  ToolApprovalSubmitted = 'ai_duo_agentic_tool_approval_submitted',
}

export type WorkflowEventSource = 'chat' | 'flows';

export type WorkflowStopReason =
  | 'stop_button_click'
  | 'navigation'
  | 'chat_closed'
  | 'editor_closed';

export enum PerformanceInteractionType {
  InitialRequest = 'initial_request',
  Continuation = 'continuation',
  ToolApproval = 'tool_approval',
  ToolRejection = 'tool_rejection',
  PlanApproval = 'plan_approval',
}

interface BaseDuoAgentPlatformContext {
  source: WorkflowEventSource;
  workflowId: string | number;
}

export interface WorkflowStoppedContext extends BaseDuoAgentPlatformContext {
  reason?: WorkflowStopReason;
}
export interface WorkflowFeedbackContext extends BaseDuoAgentPlatformContext {
  feedbackType: 'thumbs_up' | 'thumbs_down';
  reason: string;
}

export interface WorkflowPerformanceMetricContext extends BaseDuoAgentPlatformContext {
  duration: number;
  selectedModel?: string;
  agentVersionOrWorkflowDefinition?: string;
  interactionType: PerformanceInteractionType;
}

export interface ToolApprovalContext {
  source: 'chat' | 'cli';
  toolName: string;
  approvalScope: 'once' | 'session' | 'pattern';
  workflowId?: string | number;
}

export type DuoAgentPlatformContext =
  | WorkflowStoppedContext
  | WorkflowPerformanceMetricContext
  | WorkflowFeedbackContext
  | ToolApprovalContext;

export interface DuoAgentPlatformTracker
  extends TelemetryService<DuoAgentPlatformEvent, DuoAgentPlatformContext, null> {}

export const DuoAgentPlatformTracker =
  createInterfaceId<DuoAgentPlatformTracker>('DuoAgentPlatformTracker');
