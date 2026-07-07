import {
  RunWorkflowPayload,
  WorkflowRunner,
  WorkflowStreamEvent,
  WorkflowType,
  WorkflowEvent,
  DuoWorkflowMessage,
  GET_CONFIGURED_AGENTS,
  GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
  GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
  GET_AGENT_FLOW_CONFIG,
  AiCatalogItemResult,
  GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
  HealthCheckData,
  HealthCheckResponse,
} from '@gitlab-lsp/workflow-api';
import { Service, ServiceLifetime } from '@gitlab/needle';
import {
  DeleteDuoWorkflowsWorkflowData,
  DeleteDuoWorkflowsWorkflowVariables,
  DuoWorkflowData,
  getWorkflowsVariables,
  AiChatAvailableModelsData,
  AiChatFoundationalAgentData,
  ProjectID,
  NamespaceID,
} from '@gitlab-org/graphql';
import { GID_NAMESPACE_GROUP, toGitLabGid } from '@gitlab-org/core';

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [WorkflowRunner],
})
export class WorkflowManager {
  readonly #workflowApi: WorkflowRunner;

  constructor(workflowApi: WorkflowRunner) {
    this.#workflowApi = workflowApi;
  }

  async getUserWorkflows(params: getWorkflowsVariables): Promise<DuoWorkflowData> {
    const response = await this.#workflowApi.getGraphqlData({
      operationName: 'duoWorkflows',
      query: null,
      variables: params,
    });

    return response;
  }

  async deleteDuoWorkflow(
    params: DeleteDuoWorkflowsWorkflowVariables,
  ): Promise<DeleteDuoWorkflowsWorkflowData> {
    const response = await this.#workflowApi.getGraphqlData({
      operationName: 'deleteWorkflow',
      query: null,
      variables: {
        input: {
          workflowId: params.workflowId,
        },
      },
    });

    return response;
  }

  async fetchAvailableModels(rootNamespaceId: string): Promise<AiChatAvailableModelsData> {
    return this.#workflowApi.getGraphqlData<AiChatAvailableModelsData>({
      operationName: 'aiChatAvailableModels',
      query: null,
      variables: { rootNamespaceId: toGitLabGid(GID_NAMESPACE_GROUP, rootNamespaceId) },
    });
  }

  async fetchFoundationalAgents(
    projectId: ProjectID,
    namespaceId: NamespaceID,
  ): Promise<AiChatFoundationalAgentData> {
    return this.#workflowApi.getGraphqlData<AiChatFoundationalAgentData>({
      operationName: 'aiFoundationalAgents',
      query: null,
      variables: { projectId, namespaceId },
    });
  }

  async fetchCatalogAgents(projectId: ProjectID): Promise<AiCatalogItemResult> {
    return this.#workflowApi.getGraphqlData<AiCatalogItemResult>({
      query: GET_CONFIGURED_AGENTS,
      fragment: {
        version: '18.4.2',
        gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
        lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
      },
      variables: { projectId },
      supportedSinceInstanceVersion: {
        version: '18.4.0',
        resourceName: 'AI Catalog Configured Agents',
      },
    });
  }

  async fetchAgentFlowConfig(agentVersionId: string): Promise<string> {
    const result = await this.#workflowApi.getGraphqlData<{
      aiCatalogAgentFlowConfig?: string;
    }>({
      query: GET_AGENT_FLOW_CONFIG,
      variables: { agentVersionId },
      supportedSinceInstanceVersion: {
        version: '18.4.0',
        resourceName: 'AI Catalog Agent Flow Config',
      },
    });
    return result?.aiCatalogAgentFlowConfig ?? '';
  }

  async getHealthCheck(projectPath: string): Promise<HealthCheckData> {
    const response = await this.#workflowApi.getGraphqlData<HealthCheckResponse>({
      query: GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
      variables: { projectPath },
      supportedSinceInstanceVersion: {
        version: '17.7.0',
        resourceName: 'Get Duo Agent Platform permissions',
      },
    });
    if (!response.project) {
      throw new Error(`Project not found or not accessible: ${projectPath}`);
    }
    return response.project.duoWorkflowStatusCheck;
  }

  async createWorkflow(...params: Parameters<WorkflowRunner['createWorkflow']>) {
    return this.#workflowApi.createWorkflow(...params);
  }

  async startWorkflow(params: RunWorkflowPayload): Promise<{
    workflowId: string;
    events: AsyncGenerator<WorkflowStreamEvent, void, unknown>;
  }> {
    let workflowId = params.existingWorkflowId || params.preCreatedWorkflowId;
    if (!workflowId) {
      workflowId = await this.createWorkflow(
        params.goal,
        params.type || WorkflowType.CHAT,
        params.workflowDefinition,
        params.aiCatalogItemVersionId,
        params.metadata,
      );
    }

    const events = this.#workflowApi.runWorkflow({
      ...params,
      existingWorkflowId: workflowId,
    });

    return { workflowId, events };
  }

  stopWorkflow(workflowId: string): void {
    this.#workflowApi.stopWorkflow(workflowId);
  }

  sendEvent(
    workflowId: string,
    eventType: WorkflowEvent,
    message?: DuoWorkflowMessage,
  ): Promise<void> {
    return this.#workflowApi.sendEvent(workflowId, eventType, message);
  }
}
