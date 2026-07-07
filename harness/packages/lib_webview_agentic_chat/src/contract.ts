import type { CreatePluginMessageMap, WebviewId } from '@gitlab-org/webview-plugin';
import type { AIContextCategory, AIContextItem } from '@gitlab-org/ai-context';
import type { AgentSkillSlashCommand } from '@gitlab-org/ai-context/node';
import type { GetRepositoriesResponse } from '@gitlab-org/core';
import {
  ParsedDuoWorkflowEvent,
  DuoWorkflowInfo,
  DuoWorkflowStatus,
  ProjectInfo,
  HealthCheckData,
  RunWorkflowPayload,
  PreCreateWorkflowPayload,
  WorkflowEvent,
  AiCatalogItemResult,
  WorkflowStatusCode,
} from '@gitlab-lsp/workflow-api';
import { DuoAgentPlatformContext } from '@gitlab-org/telemetry';
import {
  codeSnippetParams,
  openFileParams,
  openUrlParams,
  messageParams,
  WorkflowGraphqlPayloadClient,
  copyTextParams,
} from './plugin/controllers/types';

export type DuoAgenticChatView = 'conversation' | 'newConversation' | 'history';

export type DuoWorkflowInitialState = Record<string, unknown>;

export type getWorkflowsParams = { projectPath: string; startCursor?: string; endCursor?: string };

export type DuoWorkflowMessages = CreatePluginMessageMap<{
  extensionToPlugin: {
    notifications: {
      setInitialState: DuoWorkflowInitialState;
      switchView: {
        view: DuoAgenticChatView;
      };
    };
  };
  webviewToPlugin: {
    notifications: {
      webviewReady: undefined;
      log: { message: string; level: string };
      getUserInfo: undefined;
      checkHealth: { projectPath: string };
      checkUsageQuota: { rootNamespaceId?: string; workflowDefinition?: string };
      getGraphqlData: WorkflowGraphqlPayloadClient;
      getProjectPath: null;
      getNamespacePath: null;
      getUserWorkflows: getWorkflowsParams;
      getWorkflowById: {
        workflowId: string;
        isRefetch?: boolean;
      };
      preCreateWorkflow: PreCreateWorkflowPayload;
      pullDockerImage: string;
      stopSubscriptions: null;
      startWorkflow: RunWorkflowPayload;
      stopWorkflow: { workflowId: string };
      interruptRunningCommand: { workflowId: string };
      sendWorkflowEvent: {
        eventType: WorkflowEvent;
        workflowId: string;
        message?: string;
        correlation_id?: string;
      };
      verifyDockerImage: string;
      openFile: openFileParams;
      openUrl: openUrlParams;
      insertCodeSnippet: codeSnippetParams;
      copyCodeSnippet: codeSnippetParams;
      copyMessage: messageParams;
      copyText: copyTextParams;
      searchContextItems: {
        query: {
          query: string;
          category: AIContextCategory;
        };
      };
      addContextItem: {
        item: AIContextItem;
      };
      removeContextItem: {
        item: AIContextItem;
      };
      getSelectedContextItemContent: {
        item: AIContextItem;
        messageId?: string;
      };
      getContextCategories: AIContextCategory[];
      startSubscriptions: { workflowId: string };
      trackEvent: { event: WorkflowEvent; context: DuoAgentPlatformContext };
      persistSelectedModel: { modelRef: string | null };
      getPersistedSelectedModel: undefined;
    };
  };
  pluginToWebview: {
    notifications: {
      refetchWorkflowData: string;
      setHealthChecks: HealthCheckData;
      setUsageQuotaExceeded: {
        exceeded: boolean;
        isMidStream?: boolean;
      };
      setUserInfo: {
        id: string;
        username: string;
        name: string;
        avatarUrl: string;
      };
      setAuthenticationStatus: boolean;
      isDockerImageAvailable: boolean;
      pullDockerImageCompleted: {
        message: string;
      };
      dockerConfigured: boolean;
      setProjectPath: string;
      setNamespacePath: string;
      setRepositories: GetRepositoriesResponse;
      setRepoToProjectPathMap: Record<string, string>;
      updateProjects: ProjectInfo[];
      updateWorkflows: DuoWorkflowInfo[];
      workflowCheckpoint: ParsedDuoWorkflowEvent;
      workflowError: { message: string; statusCode?: WorkflowStatusCode };
      clearLockedError: null;
      workflowGoal: string;
      workflowPreCreated: string;
      workflowStarted: string;
      workflowStatus: DuoWorkflowStatus;
      setWorkflowProject: string;
      switchView: {
        view: DuoAgenticChatView;
      };
      setCatalogAgents: AiCatalogItemResult;
      setFlowConfig: string;
      setPersistedSelectedModel: string | null;
      setSkillSlashCommands: AgentSkillSlashCommand[];
      setFeatureFlags: { softwareDevelopmentFlowRegistry: boolean };
    };
  };
  pluginToExtension: {
    // duo chat messages
    notifications: {
      appReady: undefined;
      insertCodeSnippet: codeSnippetParams;
      copyCodeSnippet: codeSnippetParams;
      openUrl: openUrlParams;
      copyMessage: messageParams;
    };
  };
}>;

export const WEBVIEW_ID = 'agentic-duo-chat' as WebviewId;
export const WEBVIEW_TITLE = 'GitLab Duo Agentic Chat';
