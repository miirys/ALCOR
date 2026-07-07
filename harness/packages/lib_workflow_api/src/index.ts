import { SupportedSinceInstanceVersion } from '@gitlab-org/core';
import { createInterfaceId } from '@gitlab/needle';
import {
  DuoWorkflowMessage,
  DuoWorkflowStatusUpdate,
  DuoWorkflowStatusUpdateResponse,
  RunWorkflowPayload,
  WorkflowEvent,
  WorkflowType,
  WorkflowMetadata,
  CreateWorkflowOptions,
  WorkflowStreamEvent,
} from './workflow_message_types';

export * from './agent_privileges';
export * from './graphql/queries';
export * from './workflow_message_types';
export * from './checkpoint_utils';
export * from './workflow_event_utils';
export * from './workflow_executor_error';
export * from './ui_chat_log';
export type * from './display_types';
export * from './flow_config';
export { UsageQuotaService } from './usage_quota_service';

export type WorkflowGraphqlPayload = {
  query: string | null;
  variables?: Record<string, unknown>;
  supportedSinceInstanceVersion?: SupportedSinceInstanceVersion;
  fragment?: { gte: string; lt: string; version: string };
  operationName?: string;
  signal?: AbortSignal;
};

export interface WorkflowRunner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getGraphqlData<T = any>(payload: WorkflowGraphqlPayload): Promise<T>;
  getProjectPath(): string;
  getNamespacePath(): string;
  getServerCapabilities(workflowId: string, workflowType: WorkflowType): string[] | null;
  preCreateWorkflow(
    draftGoal: string,
    type: WorkflowType,
    workflowDefinition?: string,
    aiCatalogVersionItemId?: string,
    metadata?: Partial<WorkflowMetadata>,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<string>;
  createWorkflow(
    goal: string,
    type: WorkflowType,
    workflowDefinition?: string,
    aiCatalogVersionItemId?: string,
    metadata?: Partial<WorkflowMetadata>,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<string>;
  runWorkflow(payload: RunWorkflowPayload): AsyncGenerator<WorkflowStreamEvent, void, unknown>;
  stopWorkflow(workflowId: string): void;
  interruptRunningCommand(workflowId: string): void;
  isCommandRunning(workflowId: string): boolean;
  sendEvent(
    workflowID: string,
    eventType: WorkflowEvent,
    message?: DuoWorkflowMessage,
  ): Promise<void>;
  updateStatus(statusUpdate: DuoWorkflowStatusUpdate): Promise<DuoWorkflowStatusUpdateResponse>;
  /**
   * Replaces the agent privileges (and pre-approved privileges) on a running
   * workflow via the `UpdateDuoWorkflowAgentPrivileges` mutation. Returns the
   * errors reported by the mutation (empty when the update succeeded).
   */
  updateAgentPrivileges(
    workflowId: string,
    agentPrivileges: number[],
    preApprovedAgentPrivileges: number[],
  ): Promise<string[]>;
  /**
   * Resolves the effective model ref against the models available on the instance.
   * Returns undefined if no model information is available.
   */
  resolveModel(requestedModel: string, rootNamespaceId?: string): Promise<string | undefined>;
}

export const WorkflowRunner = createInterfaceId<WorkflowRunner>('WorkflowRunner');

export type {
  AgentPlatformProjectService,
  AgentPlatformRepository,
  AgentPlatformRepositories,
} from './agent_platform_project_service';
