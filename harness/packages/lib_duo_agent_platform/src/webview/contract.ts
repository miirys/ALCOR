import { CreateWebviewMessages, WebviewId } from '@gitlab-org/webview-plugin';
import type {
  DeleteDuoWorkflowsWorkflowData,
  DeleteDuoWorkflowsWorkflowVariables,
  DuoWorkflowData,
  getWorkflowsVariables,
  AiChatAvailableModelsData,
  DuoMessage,
} from '@gitlab-org/graphql';
import type {
  DuoWorkflowStatus,
  RunWorkflowPayload,
  AgentPlatformRepository,
  WorkflowEvent,
  DuoWorkflowMessage,
  HealthCheckData,
} from '@gitlab-lsp/workflow-api';
import type { AIContextCategory, AIContextItem } from '@gitlab-org/ai-context';
import type { AgentSkillSlashCommand } from '@gitlab-org/ai-context/node';
import type { WorkflowEventSource } from '@gitlab-org/telemetry';
import { UserFeedbackContext } from './feedback_types';

export const DUO_AGENT_PLATFORM_WEBVIEW_ID =
  'root/duoAgentPlatform' as WebviewId<DuoAgentPlatformMessages>;

export interface WorkflowEventPayload {
  workflowId: string;
  checkpoint: string;
  errors: string[];
  workflowGoal: string;
  workflowStatus: DuoWorkflowStatus;
  messages: DuoMessage[];
}

export interface WorkflowStartedPayload {
  workflowId: string;
}

export interface WorkflowCompletedPayload {
  workflowId: string;
  status: Extract<
    DuoWorkflowStatus,
    DuoWorkflowStatus.FINISHED | DuoWorkflowStatus.FAILED | DuoWorkflowStatus.STOPPED
  >;
  error?: string;
}

export interface WorkflowErrorPayload {
  message: string;
  workflowId?: string;
}

export interface UsageQuotaExceededPayload {
  exceeded: boolean;
  isMidStream?: boolean;
}

export interface CheckUsageQuotaPayload {
  rootNamespaceId?: string;
  workflowDefinition?: string;
  projectId?: string;
}

export type SelectProjectForWorkflow = {
  repositoryPath: string;
  projectPath: string;
};

export interface StopWorkflowPayload {
  workflowId: string;
  source: WorkflowEventSource;
}

export interface SendWorkflowEventPayload {
  workflowId: string;
  eventType: WorkflowEvent;
  message?: DuoWorkflowMessage;
}

export type AiChatAvailableModels = AiChatAvailableModelsData & {
  userModelSwitchingEnabled: boolean;
};

export interface Agent {
  id: string;
  name: string;
  description: string;
  foundational: boolean;
  referenceWithVersion?: string;
  pinnedItemVersionId?: string;
}

export interface FetchAgentsResult {
  agents: Agent[];
}

export type SearchContextItemsResult =
  | { success: true; results: AIContextItem[] }
  | { success: false; error: string };

export type ContextItemsMutationResult =
  | { success: true; items: AIContextItem[] }
  | { success: false; error: string };

export type { AIContextItem, AIContextCategory };

export type DuoAgentPlatformMessages = CreateWebviewMessages<{
  // Frontend → Backend
  fromWebview: {
    notifications: {
      appReady: undefined;
      copyMessage: {
        message: string;
      };
      copyCodeSnippet: {
        snippet: string;
      };
      insertCodeSnippet: {
        snippet: string;
      };
      startWorkflow: RunWorkflowPayload;
      stopWorkflow: StopWorkflowPayload;
      sendWorkflowEvent: SendWorkflowEventPayload;
      submitFeedback: UserFeedbackContext;
      selectProjectForWorkflow: SelectProjectForWorkflow;
      persistSelectedModel: { modelRef: string | null };
      checkUsageQuota: CheckUsageQuotaPayload;
      openUrl: { url: string };
    };
    requests: {
      getUserWorkflows: {
        params: getWorkflowsVariables;
        result: DuoWorkflowData;
      };
      deleteWorkflow: {
        params: DeleteDuoWorkflowsWorkflowVariables;
        result: DeleteDuoWorkflowsWorkflowData;
      };
      fetchAvailableModels: {
        params: { rootNamespaceId: string };
        result: AiChatAvailableModels;
      };
      getPersistedSelectedModel: {
        params: undefined;
        result: string | null;
      };
      fetchAgents: {
        params: { projectId: string; namespaceId: string };
        result: FetchAgentsResult;
      };
      getAgentFlowConfig: {
        params: { agentVersionId: string };
        result: string;
      };
      checkHealth: {
        params: { projectPath: string };
        result: HealthCheckData;
      };
      getContextCategories: {
        params: undefined;
        result: AIContextCategory[];
      };
      searchContextItems: {
        params: { query: string; category: AIContextCategory };
        result: SearchContextItemsResult;
      };
      addContextItem: {
        params: AIContextItem;
        result: ContextItemsMutationResult;
      };
      removeContextItem: {
        params: AIContextItem;
        result: ContextItemsMutationResult;
      };
      clearSelectedContextItems: {
        params: undefined;
        result: ContextItemsMutationResult;
      };
    };
  };
  // Backend → Frontend
  toWebview: {
    notifications: {
      copyMessage: {
        message: string;
      };
      workflowStarted: WorkflowStartedPayload;
      workflowEvent: WorkflowEventPayload;
      workflowCompleted: WorkflowCompletedPayload;
      workflowError: WorkflowErrorPayload;
      setRepositories: {
        repositories: AgentPlatformRepository[];
      };
      initialState: {
        repositories: AgentPlatformRepository[];
      };
      /** Out-of-band push when the backend changes the selection set itself (e.g., on workflow start). */
      setContextCurrentItemsResult: AIContextItem[];
      setUsageQuotaExceeded: UsageQuotaExceededPayload;
      setSkillSlashCommands: AgentSkillSlashCommand[];
      setAuthenticationStatus: boolean;
    };
  };
}>;

export type { AgentSkillSlashCommand };
