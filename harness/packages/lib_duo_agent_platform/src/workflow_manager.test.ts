import { createFakePartial } from '@gitlab-org/test-utils';
import {
  WorkflowRunner,
  WorkflowType,
  WorkflowEvent,
  DuoWorkflowEvent,
  DuoWorkflowStatus,
  RunWorkflowPayload,
  GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
  HealthCheckResponse,
} from '@gitlab-lsp/workflow-api';
import type { AiChatAvailableModelsData } from '@gitlab-org/graphql';
import { WorkflowManager } from './workflow_manager';

const MOCK_AVAILABLE_MODELS_DATA: AiChatAvailableModelsData = {
  aiChatAvailableModels: {
    defaultModel: { ref: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet - Anthropic' },
    selectableModels: [
      { ref: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet - Anthropic' },
      { ref: 'claude-3-haiku', name: 'Claude 3 Haiku - Anthropic' },
      { ref: 'gpt-4o', name: 'GPT-4o - OpenAI' },
      { ref: 'gpt-4o-mini', name: 'GPT-4o Mini - OpenAI' },
    ],
    pinnedModel: null,
  },
  metadata: { version: '18.5.0', featureFlags: [] },
};

describe('WorkflowManager', () => {
  let workflowManager: WorkflowManager;
  let mockWorkflowApi: jest.Mocked<WorkflowRunner>;

  beforeEach(() => {
    mockWorkflowApi = createFakePartial<jest.Mocked<WorkflowRunner>>({
      getGraphqlData: jest.fn(),
      createWorkflow: jest.fn(),
      runWorkflow: jest.fn(),
      stopWorkflow: jest.fn(),
      sendEvent: jest.fn(),
    });
    workflowManager = new WorkflowManager(mockWorkflowApi);
  });

  describe('getUserWorkflows', () => {
    it('fetches workflows via graphql', async () => {
      const mockData = { duoWorkflows: { nodes: [] } };
      mockWorkflowApi.getGraphqlData.mockResolvedValue(mockData);

      const variables = {
        first: 10,
        last: null,
        after: null,
        before: null,
        type: 'chat',
        search: null,
      };
      const result = await workflowManager.getUserWorkflows(variables);

      expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
        operationName: 'duoWorkflows',
        query: null,
        variables,
      });
      expect(result).toBe(mockData);
    });
  });

  describe('deleteDuoWorkflow', () => {
    it('deletes a workflow via graphql', async () => {
      const mockResponse = { deleteWorkflow: { errors: [] } };
      mockWorkflowApi.getGraphqlData.mockResolvedValue(mockResponse);

      const result = await workflowManager.deleteDuoWorkflow({ workflowId: 'wf-123' });

      expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
        operationName: 'deleteWorkflow',
        query: null,
        variables: { input: { workflowId: 'wf-123' } },
      });
      expect(result).toBe(mockResponse);
    });
  });

  describe('createWorkflow', () => {
    it('delegates to workflowApi.createWorkflow', async () => {
      mockWorkflowApi.createWorkflow.mockResolvedValue('new-wf-id');

      const result = await workflowManager.createWorkflow(
        'my goal',
        WorkflowType.CHAT,
        'definition',
        'catalog-v1',
        { projectPath: 'my/project' },
      );

      expect(mockWorkflowApi.createWorkflow).toHaveBeenCalledWith(
        'my goal',
        WorkflowType.CHAT,
        'definition',
        'catalog-v1',
        { projectPath: 'my/project' },
      );
      expect(result).toBe('new-wf-id');
    });
  });

  describe('startWorkflow', () => {
    const basePayload: RunWorkflowPayload = {
      goal: 'test goal',
      type: WorkflowType.CHAT,
      metadata: { projectPath: 'my/project', selectedModelIdentifier: 'model-1' },
      additionalContext: [],
    };

    async function* fakeEvents(): AsyncGenerator<DuoWorkflowEvent> {
      yield {
        checkpoint: 'cp1',
        errors: [],
        workflowGoal: 'test goal',
        workflowStatus: DuoWorkflowStatus.RUNNING,
      };
    }

    describe('when existingWorkflowId is provided', () => {
      it('does not create a new workflow', async () => {
        const payload = { ...basePayload, existingWorkflowId: 'existing-id' };
        mockWorkflowApi.runWorkflow.mockReturnValue(fakeEvents());

        const result = await workflowManager.startWorkflow(payload);

        expect(mockWorkflowApi.createWorkflow).not.toHaveBeenCalled();
        expect(result.workflowId).toBe('existing-id');
      });

      it('passes the existingWorkflowId to runWorkflow', async () => {
        const payload = { ...basePayload, existingWorkflowId: 'existing-id' };
        mockWorkflowApi.runWorkflow.mockReturnValue(fakeEvents());

        await workflowManager.startWorkflow(payload);

        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ existingWorkflowId: 'existing-id' }),
        );
      });
    });

    describe('when preCreatedWorkflowId is provided', () => {
      it('does not create a new workflow', async () => {
        const payload = { ...basePayload, preCreatedWorkflowId: 'pre-created-id' };
        mockWorkflowApi.runWorkflow.mockReturnValue(fakeEvents());

        const result = await workflowManager.startWorkflow(payload);

        expect(mockWorkflowApi.createWorkflow).not.toHaveBeenCalled();
        expect(result.workflowId).toBe('pre-created-id');
      });
    });

    describe('when no existing workflow ID is provided', () => {
      it('creates a new workflow and uses the returned ID', async () => {
        mockWorkflowApi.createWorkflow.mockResolvedValue('created-wf-id');
        mockWorkflowApi.runWorkflow.mockReturnValue(fakeEvents());

        const result = await workflowManager.startWorkflow(basePayload);

        expect(mockWorkflowApi.createWorkflow).toHaveBeenCalledWith(
          'test goal',
          WorkflowType.CHAT,
          undefined,
          undefined,
          { projectPath: 'my/project', selectedModelIdentifier: 'model-1' },
        );
        expect(result.workflowId).toBe('created-wf-id');
        expect(mockWorkflowApi.runWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({ existingWorkflowId: 'created-wf-id' }),
        );
      });
    });

    it('returns an async generator of events', async () => {
      const payload = { ...basePayload, existingWorkflowId: 'wf-1' };
      mockWorkflowApi.runWorkflow.mockReturnValue(fakeEvents());

      const result = await workflowManager.startWorkflow(payload);
      const events: DuoWorkflowEvent[] = [];
      for await (const event of result.events) {
        events.push(event as DuoWorkflowEvent);
      }

      expect(events).toHaveLength(1);
      expect(events[0].workflowStatus).toBe(DuoWorkflowStatus.RUNNING);
    });
  });

  describe('stopWorkflow', () => {
    it('delegates to the workflow runner', () => {
      workflowManager.stopWorkflow('wf-1');

      expect(mockWorkflowApi.stopWorkflow).toHaveBeenCalledWith('wf-1');
    });
  });

  describe('sendEvent', () => {
    it('delegates to the workflow runner with the event type and message', async () => {
      mockWorkflowApi.sendEvent.mockResolvedValue(undefined);
      const message = { correlation_id: 'c1', message: 'continue' };

      await workflowManager.sendEvent('wf-1', WorkflowEvent.RESUME, message);

      expect(mockWorkflowApi.sendEvent).toHaveBeenCalledWith('wf-1', WorkflowEvent.RESUME, message);
    });

    it('forwards calls without a message', async () => {
      mockWorkflowApi.sendEvent.mockResolvedValue(undefined);

      await workflowManager.sendEvent('wf-1', WorkflowEvent.RESUME);

      expect(mockWorkflowApi.sendEvent).toHaveBeenCalledWith(
        'wf-1',
        WorkflowEvent.RESUME,
        undefined,
      );
    });
  });

  describe('getHealthCheck', () => {
    it('fetches the enablement checks for a project and unwraps the status', async () => {
      const healthCheck = {
        enabled: false,
        checks: [{ name: 'feature_flag', value: false, message: '' }],
      };
      const response: HealthCheckResponse = {
        project: { id: 'gid://gitlab/Project/1', duoWorkflowStatusCheck: healthCheck },
      };
      mockWorkflowApi.getGraphqlData.mockResolvedValue(response);

      const result = await workflowManager.getHealthCheck('my/project');

      expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
        query: GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
        variables: { projectPath: 'my/project' },
        supportedSinceInstanceVersion: {
          version: '17.7.0',
          resourceName: 'Get Duo Agent Platform permissions',
        },
      });
      expect(result).toBe(healthCheck);
    });
  });

  describe('fetchAvailableModels', () => {
    it('fetches available models via graphql', async () => {
      mockWorkflowApi.getGraphqlData.mockResolvedValue(MOCK_AVAILABLE_MODELS_DATA);

      const result = await workflowManager.fetchAvailableModels('1234');

      expect(mockWorkflowApi.getGraphqlData).toHaveBeenCalledWith({
        operationName: 'aiChatAvailableModels',
        query: null,
        variables: { rootNamespaceId: 'gid://gitlab/Group/1234' },
      });
      expect(result).toBe(MOCK_AVAILABLE_MODELS_DATA);
    });
  });
});
