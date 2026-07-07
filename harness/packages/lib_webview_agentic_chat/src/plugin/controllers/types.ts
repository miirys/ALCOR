import {
  WorkflowGraphqlPayload,
  DuoWorkflowStatus,
  ParsedDuoWorkflowEvent,
  WorkflowEvent,
  DuoWorkflowMessage,
} from '@gitlab-lsp/workflow-api';
import { AIContextCategory, type AIContextItem } from '@gitlab-org/ai-context';
import type { AgentSkillSlashCommand } from '@gitlab-org/ai-context/node';
import { AgentPlatformRepositories } from '@gitlab-lsp/workflow-api/node';
import { NO_REPLY } from './constants';

export type getWorkflowParams = { workflowId: string; isRefetch?: boolean };

export type sendWorkflowEventParams = {
  eventType: WorkflowEvent;
  workflowId: string;
  message?: DuoWorkflowMessage;
};

export type openUrlParams = { url: string };
export type openFileParams = { filePath: string };
export type codeSnippetParams = { snippet: string };
export type messageParams = { message: string };
export type copyTextParams = { text: string };
type UserInfo = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
};

export type ControllerResponse =
  | { eventName: 'workflowStatus'; data: DuoWorkflowStatus }
  | { eventName: 'dockerConfigured'; data: boolean }
  | { eventName: 'isDockerImageAvailable'; data: boolean }
  | { eventName: 'workflowCheckpoint'; data: ParsedDuoWorkflowEvent }
  | { eventName: 'pullDockerImageCompleted'; data: { success: boolean } }
  | { eventName: 'workflowError'; data: string | { message: string; statusCode?: number } }
  | { eventName: 'workflowStarted'; data: string }
  | { eventName: 'workflowPreCreated'; data: string }
  | { eventName: 'workflowPreCreationError'; data: null }
  | { eventName: 'workflowGoal'; data: string }
  | { eventName: 'setProjectPath'; data: string }
  | { eventName: 'setNamespacePath'; data: string }
  | { eventName: 'setUsageQuotaExceeded'; data: { exceeded: boolean; isMidStream?: boolean } }
  | { eventName: 'setRepositories'; data: AgentPlatformRepositories }
  | { eventName: 'setRepoToProjectPathMap'; data: Record<string, string> }
  | { eventName: 'setWorkflowProject'; data: string }
  | {
      eventName: 'setContextItemSearchResult';
      data: { results?: AIContextItem[]; errorMessage?: string };
    }
  | { eventName: 'setContextCategoriesResult'; data: AIContextCategory[] }
  | { eventName: 'setContextCurrentItemsResult'; data: AIContextItem[] }
  | { eventName: 'getSelectedContextItemContent'; data: AIContextItem[] }
  | { eventName: 'setSlashCommandsEnabled'; data: boolean }
  | { eventName: 'setSkillSlashCommands'; data: AgentSkillSlashCommand[] }
  | { eventName: 'setUserInfo'; data: UserInfo | null }
  | { eventName: 'setPersistedSelectedModel'; data: string | null }
  | { eventName: 'setFeatureFlags'; data: { softwareDevelopmentFlowRegistry: boolean } };

export interface WorkflowGraphqlPayloadClient extends WorkflowGraphqlPayload {
  eventName: ControllerResponse['eventName'];
}

export type ControllerNoReply = typeof NO_REPLY;

export type ControllerData =
  | ControllerResponse
  | (Promise<ControllerResponse | ControllerNoReply | ControllerResponse[]> | ControllerResponse)[]
  | ControllerNoReply;

export type ControllerResponseEnum = Promise<ControllerData> | ControllerData;
