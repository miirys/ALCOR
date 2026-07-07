import {
  DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
  DUO_NO_NAMESPACE_DETECTED_MESSAGE,
  GitLabApiService,
  InstanceInfo,
  RESTError,
} from '@gitlab-org/core';
import { GraphQLService } from '@gitlab-org/graphql';
import { Logger, TestLogger } from '@gitlab-org/logging';
import {
  AGENT_PRIVILEGES,
  defaultAgentPrivileges,
  DuoWorkflowStatusEvent,
  GET_CONFIGURED_AGENTS,
  GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
  GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
  WorkflowEvent,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';
import { createFakePartial } from '@gitlab-org/test-utils';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { getMockWorkflowToken } from '../executors/test_utils';
import { DefaultWorkflowRailsService, WorkflowRailsService } from './workflow_rails_service';
import { WorkflowGraphqlOperations } from './workflow_graphql_operations';
import { CreateWorkflowOptions } from './types';

describe('WorkflowRailsService', () => {
  let service: WorkflowRailsService;
  let mockGitLabApiService: GitLabApiService;
  let mockInstanceInfo: Partial<InstanceInfo>;
  let mockLogger: Logger;
  let mockGraphqlOperations: WorkflowGraphqlOperations;
  let mockGraphQLService: GraphQLService;
  let mockFetchFromApi: jest.Mock;
  let mockFetchFromApiRaw: jest.Mock;
  let mockContainsQuery: jest.Mock;

  const mockWorkflowId = 'workflow-123';
  const mockGoal = 'Build an app';
  const mockProjectPath = 'gitlab-org/gitlab-vscode-extension';

  const generateTokenResponse = getMockWorkflowToken();

  const mockCreateWorkflowDefaultPayload = {
    agent_privileges: defaultAgentPrivileges,
    project_id: mockProjectPath,
    namespace_id: undefined,
    goal: mockGoal,
    workflow_definition: WorkflowType.SOFTWARE_DEVELOPMENT,
    environment: 'ide',
    ai_catalog_item_version_id: undefined,
    allow_agent_to_request_user: true,
  };

  beforeEach(() => {
    mockFetchFromApi = jest.fn();
    mockFetchFromApiRaw = jest.fn();
    mockContainsQuery = jest.fn();
    mockInstanceInfo = { instanceUrl: new URL('https://gitlab.com'), instanceVersion: '18.4.0' };
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: mockFetchFromApi,
      fetchFromApiRaw: mockFetchFromApiRaw,
      onApiReconfigured: jest.fn(),
      instanceInfo: mockInstanceInfo,
    });
    mockLogger = new TestLogger();
    mockGraphqlOperations = createFakePartial<WorkflowGraphqlOperations>({
      containsQuery: mockContainsQuery,
    });
    mockGraphQLService = createFakePartial<GraphQLService>({
      execute: jest.fn(),
    });

    service = new DefaultWorkflowRailsService(
      mockLogger,
      mockGitLabApiService,
      mockGraphqlOperations,
      mockGraphQLService,
    );
  });

  describe('updateStatus', () => {
    it('calls the workflow status update API with correct parameters', async () => {
      const statusEvent = DuoWorkflowStatusEvent.PAUSE;
      mockFetchFromApi.mockResolvedValueOnce({ status: 'success' });

      await service.updateStatus({ workflowId: mockWorkflowId, statusEvent });

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        path: `/api/v4/ai/duo_workflows/workflows/${mockWorkflowId}`,
        method: 'PATCH',
        body: {
          status_event: statusEvent,
        },
      });
    });
  });

  describe('sendEvent', () => {
    const expectedParams = {
      body: {
        event_type: WorkflowEvent.STOP,
        message: '',
      },
      method: 'POST',
      path: `/api/v4/ai/duo_workflows/workflows/${mockWorkflowId}/events`,
      supportedSinceInstanceVersion: {
        resourceName: 'create a workflow event',
        version: '17.5.0',
      },
      type: 'rest',
    };

    it('sends an event with empty message when no message is provided', async () => {
      mockFetchFromApi.mockResolvedValueOnce({
        id: 'event-123',
        event_type: WorkflowEvent.STOP,
        event_status: 'created',
        message: '',
      });

      await service.sendEvent(mockWorkflowId, WorkflowEvent.STOP);

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        ...expectedParams,
        body: {
          event_type: WorkflowEvent.STOP,
          message: '',
        },
      });
    });

    it('sends an event with provided message details', async () => {
      const message = {
        correlation_id: 'corr-123',
        message: 'Hello world',
      };

      mockFetchFromApi.mockResolvedValueOnce({
        id: 'event-123',
        event_type: WorkflowEvent.MESSAGE,
        event_status: 'created',
        message: 'Hello world',
      });

      await service.sendEvent(mockWorkflowId, WorkflowEvent.MESSAGE, message);

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        ...expectedParams,
        body: {
          event_type: WorkflowEvent.MESSAGE,
          correlation_id: 'corr-123',
          message: 'Hello world',
        },
        path: `/api/v4/ai/duo_workflows/workflows/${mockWorkflowId}/events`,
      });
    });

    it('throws an error when the API response is null', async () => {
      mockFetchFromApi.mockResolvedValueOnce(null);

      await expect(service.sendEvent(mockWorkflowId, WorkflowEvent.STOP)).rejects.toThrow(
        'Failed to create event',
      );
    });
  });

  describe('createWorkflow', () => {
    it('creates a workflow with default type when no type is provided', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(mockGoal, {
        project_id: mockProjectPath,
        namespace_id: undefined,
      });

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });
    });

    it('creates a workflow with specified type', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(
        mockGoal,
        { project_id: mockProjectPath, namespace_id: undefined },
        WorkflowType.SEARCH_AND_REPLACE,
      );

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
          workflow_definition: WorkflowType.SEARCH_AND_REPLACE,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });
    });

    it('logs and rethrows errors', async () => {
      mockLogger.error = jest.fn();
      const error = new Error('API error');
      mockFetchFromApiRaw.mockRejectedValueOnce(error);

      await expect(
        service.createWorkflow(mockGoal, { project_id: mockProjectPath, namespace_id: undefined }),
      ).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[WorkflowRailsService] Failed to create the workflow',
        error,
      );
    });

    describe('error handling', () => {
      it('throws the not-entitled error when receiving a 403 forbidden to access agentic chat', async () => {
        const mockResponse = {
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: jest
            .fn()
            .mockResolvedValueOnce({ message: '403 Forbidden - forbidden to access agentic chat' }),
        };
        mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

        await expect(
          service.createWorkflow(mockGoal, {
            project_id: mockProjectPath,
            namespace_id: undefined,
          }),
        ).rejects.toThrow(new Error(DUO_NAMESPACE_NOT_ENTITLED_MESSAGE));
      });

      it('throws the no-namespace error when the 403 body reports missing_default_duo_group', async () => {
        const mockResponse = {
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: jest.fn().mockResolvedValueOnce({ error: 'missing_default_duo_group' }),
        };
        mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

        await expect(
          service.createWorkflow(mockGoal, {
            project_id: mockProjectPath,
            namespace_id: undefined,
          }),
        ).rejects.toThrow(new Error(DUO_NO_NAMESPACE_DETECTED_MESSAGE));
      });

      it('throws DuoCliDisabledError when receiving 403 Duo CLI has been disabled', async () => {
        const mockResponse = {
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: jest.fn().mockResolvedValueOnce({
            message: '403 Forbidden - Duo CLI has been disabled by your administrator',
          }),
        };
        mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

        await expect(
          service.createWorkflow(mockGoal, {
            project_id: mockProjectPath,
            namespace_id: undefined,
          }),
        ).rejects.toThrow('403 Forbidden - Duo CLI has been disabled by your administrator');
      });

      it('throws a generic HTTP error for other non-ok responses', async () => {
        mockLogger.error = jest.fn();
        const mockResponse = {
          ok: false,
          status: 500,
          headers: { get: () => null },
          json: jest.fn().mockResolvedValueOnce({ error: 'Internal server error' }),
        };
        mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

        await expect(
          service.createWorkflow(mockGoal, {
            project_id: mockProjectPath,
            namespace_id: undefined,
          }),
        ).rejects.toThrow('Failed to create workflow: HTTP 500');
      });

      it('treats any other 403 as a not-entitled access error', async () => {
        const message = '403 Forbidden - other reason';
        mockLogger.error = jest.fn();
        const mockResponse = {
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: jest.fn().mockResolvedValueOnce({ message }),
        };
        mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

        await expect(
          service.createWorkflow(mockGoal, {
            project_id: mockProjectPath,
            namespace_id: undefined,
          }),
        ).rejects.toThrow(new Error(DUO_NAMESPACE_NOT_ENTITLED_MESSAGE));
      });
    });

    it('ensures workflowId is returned as a string type', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: 1234 }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(
        mockGoal,
        { project_id: mockProjectPath, namespace_id: undefined },
        WorkflowType.SEARCH_AND_REPLACE,
      );

      expect(result).toEqual('1234');
    });

    it('extracts feature flags from the response headers when present', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('flag1,flag2,flag3'),
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(mockGoal, {
        project_id: mockProjectPath,
        namespace_id: undefined,
      });

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });

      const featureFlags = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);
      expect(featureFlags).toEqual(['flag1', 'flag2', 'flag3']);
      // Verify that fetchFromApiRaw was only called once (for createWorkflow, not for getEnabledWorkflowFeatureFlags)
      expect(mockFetchFromApiRaw).toHaveBeenCalledTimes(1);
    });

    it('creates a workflow with aiCatalogItemVersionId parameter', async () => {
      const mockAiCatalogItemVersionId = 456;
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(
        mockGoal,
        {
          project_id: mockProjectPath,
          namespace_id: undefined,
        },
        WorkflowType.SOFTWARE_DEVELOPMENT,
        undefined,
        mockAiCatalogItemVersionId,
      );

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
          ai_catalog_item_version_id: mockAiCatalogItemVersionId,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });
    });

    it('creates a workflow with workflowDefinition parameter', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.createWorkflow(
        mockGoal,
        {
          project_id: mockProjectPath,
          namespace_id: undefined,
        },
        WorkflowType.SOFTWARE_DEVELOPMENT,
        'test_agent/v1',
        undefined,
      );

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
          workflow_definition: 'test_agent/v1',
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });
    });

    it('creates a workflow with additional creation options', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValueOnce({ id: mockWorkflowId }),
      };
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const additionalOptions: CreateWorkflowOptions = {
        allowAgentToRequestUser: false,
        agentPrivileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
        preApprovedAgentPrivileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
      };
      const result = await service.createWorkflow(
        mockGoal,
        {
          project_id: mockProjectPath,
          namespace_id: undefined,
        },
        WorkflowType.SOFTWARE_DEVELOPMENT,
        undefined,
        undefined,
        additionalOptions,
      );

      expect(result).toEqual(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body: {
          ...mockCreateWorkflowDefaultPayload,
          agent_privileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
          pre_approved_agent_privileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
          allow_agent_to_request_user: false,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });
    });

    describe('version-specific privilege parameter handling', () => {
      const containerParams = { project_id: mockProjectPath, namespace_id: undefined };
      const additionalOptions: CreateWorkflowOptions = {
        agentPrivileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
        preApprovedAgentPrivileges: [AGENT_PRIVILEGES.READ_ONLY_GITLAB],
      };

      let mockResponse: Partial<Response>;

      beforeEach(() => {
        mockResponse = createFakePartial<Response>({
          ok: true,
          headers: createFakePartial<Headers>({ get: () => null }),
          json: jest.fn().mockResolvedValue({ id: mockWorkflowId }),
        });
        mockFetchFromApiRaw.mockResolvedValue(mockResponse);
      });

      describe('GitLab 18.4.0+', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '18.4.0';
        });

        it('includes both privilege parameters and ai_catalog_item_version_id', async () => {
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            123,
            additionalOptions,
          );

          expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
            type: 'rest',
            method: 'POST',
            path: '/api/v4/ai/duo_workflows/workflows',
            body: expect.objectContaining({
              agent_privileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
              pre_approved_agent_privileges: [AGENT_PRIVILEGES.READ_ONLY_GITLAB],
              ai_catalog_item_version_id: 123,
            }),
            supportedSinceInstanceVersion: {
              resourceName: 'create a workflow',
              version: '17.3.0',
            },
          });
        });
      });

      describe('GitLab 18.0.0-18.3.x', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '18.0.0';
        });

        it('includes both privilege parameters but excludes ai_catalog_item_version_id', async () => {
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            123,
            additionalOptions,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).toMatchObject({
            agent_privileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
            pre_approved_agent_privileges: [AGENT_PRIVILEGES.READ_ONLY_GITLAB],
          });
          expect(callArgs.body).not.toHaveProperty('ai_catalog_item_version_id');
        });
      });

      describe('GitLab 17.6.0-17.9.x', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '17.6.0';
        });

        it('includes only agent_privileges, excludes pre_approved and ai_catalog_item_version_id', async () => {
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            123,
            additionalOptions,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).toMatchObject({
            agent_privileges: [AGENT_PRIVILEGES.READ_WRITE_FILES],
          });
          expect(callArgs.body).not.toHaveProperty('pre_approved_agent_privileges');
          expect(callArgs.body).not.toHaveProperty('ai_catalog_item_version_id');
        });
      });

      describe('GitLab < 17.6.0', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '17.5.0';
        });

        it('excludes all privilege parameters and ai_catalog_item_version_id', async () => {
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            123,
            additionalOptions,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).not.toHaveProperty('agent_privileges');
          expect(callArgs.body).not.toHaveProperty('pre_approved_agent_privileges');
          expect(callArgs.body).not.toHaveProperty('ai_catalog_item_version_id');
        });
      });
    });

    describe('version-specific requiresDuoCliEnabled parameter handling', () => {
      const containerParams = { project_id: mockProjectPath, namespace_id: undefined };
      let mockResponse: Partial<Response>;

      beforeEach(() => {
        mockResponse = createFakePartial<Response>({
          ok: true,
          headers: createFakePartial<Headers>({ get: () => null }),
          json: jest.fn().mockResolvedValue({ id: mockWorkflowId }),
        });
        mockFetchFromApiRaw.mockResolvedValue(mockResponse);
      });

      describe('GitLab 19.1.0+', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '19.1.0';
        });

        it('does not include requires_duo_cli_enabled when not provided', async () => {
          await service.createWorkflow(mockGoal, containerParams);

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).not.toHaveProperty('requires_duo_cli_enabled');
        });

        it('includes requires_duo_cli_enabled: false when explicitly set to false', async () => {
          const options: CreateWorkflowOptions = { requiresDuoCliEnabled: false };
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            undefined,
            options,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).toHaveProperty('requires_duo_cli_enabled', false);
        });

        it('includes requires_duo_cli_enabled: true when explicitly set to true', async () => {
          const options: CreateWorkflowOptions = { requiresDuoCliEnabled: true };
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            undefined,
            options,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).toHaveProperty('requires_duo_cli_enabled', true);
        });
      });

      describe('GitLab 19.0.0 (< 19.1.0)', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '19.0.0';
        });

        it('excludes requires_duo_cli_enabled even when provided', async () => {
          const options: CreateWorkflowOptions = { requiresDuoCliEnabled: false };
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            undefined,
            options,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).not.toHaveProperty('requires_duo_cli_enabled');
        });
      });

      describe('GitLab 18.4.0 (< 19.1.0)', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '18.4.0';
        });

        it('excludes requires_duo_cli_enabled even when provided', async () => {
          const options: CreateWorkflowOptions = { requiresDuoCliEnabled: false };
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            undefined,
            options,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).not.toHaveProperty('requires_duo_cli_enabled');
        });
      });

      describe('GitLab < 18.0.0', () => {
        beforeEach(() => {
          mockInstanceInfo.instanceVersion = '17.5.0';
        });

        it('excludes requires_duo_cli_enabled even when provided', async () => {
          const options: CreateWorkflowOptions = { requiresDuoCliEnabled: false };
          await service.createWorkflow(
            mockGoal,
            containerParams,
            undefined,
            undefined,
            undefined,
            options,
          );

          const callArgs = mockFetchFromApiRaw.mock.calls[0][0];
          expect(callArgs.body).not.toHaveProperty('requires_duo_cli_enabled');
        });
      });
    });
  });

  describe('getWorkflowToken', () => {
    it('returns workflow token data', async () => {
      mockFetchFromApi.mockResolvedValueOnce(generateTokenResponse);

      const result = await service.getWorkflowToken();

      expect(result).toEqual(generateTokenResponse);
      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/direct_access',
        body: {
          workflow_definition: 'software_development',
        },
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow direct access',
          version: '18.1.0',
        },
      });
    });

    it('includes root_namespace_id when provided', async () => {
      mockFetchFromApi.mockResolvedValueOnce(generateTokenResponse);

      const result = await service.getWorkflowToken(
        WorkflowType.SOFTWARE_DEVELOPMENT,
        'gid://gitlab/Group/123',
      );

      expect(result).toEqual(generateTokenResponse);
      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/direct_access',
        body: {
          workflow_definition: 'software_development',
          root_namespace_id: 'gid://gitlab/Group/123',
        },
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow direct access',
          version: '18.1.0',
        },
      });
    });

    it('includes project_id when provided', async () => {
      mockFetchFromApi.mockResolvedValueOnce(generateTokenResponse);

      const result = await service.getWorkflowToken(
        WorkflowType.SOFTWARE_DEVELOPMENT,
        undefined,
        'mynamespace/myproject',
      );

      expect(result).toEqual(generateTokenResponse);
      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/direct_access',
        body: {
          workflow_definition: 'software_development',
          project_id: 'mynamespace/myproject',
        },
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow direct access',
          version: '18.1.0',
        },
      });
    });

    it('does not include root_namespace_id when not provided', async () => {
      mockFetchFromApi.mockResolvedValueOnce(generateTokenResponse);

      const result = await service.getWorkflowToken(WorkflowType.SEARCH_AND_REPLACE);

      expect(result).toEqual(generateTokenResponse);
      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/direct_access',
        body: {
          workflow_definition: 'search_and_replace',
        },
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow direct access',
          version: '18.1.0',
        },
      });
    });

    it('logs and rethrows errors', async () => {
      mockLogger.error = jest.fn();
      const error = new Error('API error');
      mockFetchFromApi.mockRejectedValueOnce(error);

      await expect(service.getWorkflowToken()).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[WorkflowRailsService] Failed to fetch the workflow token',
        error,
      );
    });

    it('throws the not-entitled error on a 403 from direct_access', async () => {
      mockLogger.error = jest.fn();
      const response = createFakePartial<Response>({
        status: 403,
        url: 'https://gitlab.example/api/v4/ai/duo_workflows/direct_access',
      });
      const restError = new RESTError(
        createFakePartial<ConstructorParameters<typeof RESTError>[0]>({ type: 'rest' }),
        response,
        'get workflow direct access',
        JSON.stringify({ message: 'forbidden' }),
      );
      mockFetchFromApi.mockRejectedValueOnce(restError);

      await expect(service.getWorkflowToken()).rejects.toThrow(
        new Error(DUO_NAMESPACE_NOT_ENTITLED_MESSAGE),
      );
    });
  });

  describe('revokeWorkflowToken', () => {
    const gitlabVersionTestCases = [
      {
        name: 'calls the new revoke endpoint for GitLab 18.4+',
        instanceInfo: { instanceVersion: '18.4.0', instanceUrl: new URL('https://gitlab.com') },
        expectedPath: '/api/v4/ai/duo_workflows/revoke_token',
        expectedVersion: '18.4.0',
      },
      {
        name: 'calls the OAuth revoke endpoint for GitLab 18.3 and earlier',
        instanceInfo: { instanceVersion: '18.3.0', instanceUrl: new URL('https://gitlab.com') },
        expectedPath: '/oauth/revoke',
        expectedVersion: '15.1.0',
      },
      {
        name: 'calls the OAuth revoke endpoint when no instance version is available',
        instanceInfo: undefined,
        expectedPath: '/oauth/revoke',
        expectedVersion: '15.1.0',
      },
    ];

    gitlabVersionTestCases.forEach(({ name, instanceInfo, expectedPath, expectedVersion }) => {
      it(name, async () => {
        // Recreate the mock service with a version of instanceInfo because it is otherwise read only
        mockGitLabApiService = createFakePartial<GitLabApiService>({
          fetchFromApi: mockFetchFromApi,
          fetchFromApiRaw: mockFetchFromApiRaw,
          onApiReconfigured: jest.fn(),
          instanceInfo,
        });

        service = new DefaultWorkflowRailsService(
          mockLogger,
          mockGitLabApiService,
          mockGraphqlOperations,
          mockGraphQLService,
        );

        mockFetchFromApi.mockResolvedValueOnce({});

        await service.revokeWorkflowToken(generateTokenResponse);

        expect(mockFetchFromApi).toHaveBeenCalledWith({
          type: 'rest',
          method: 'POST',
          path: expectedPath,
          body: { token: generateTokenResponse.gitlab_rails.token },
          supportedSinceInstanceVersion: {
            resourceName: 'revoke workflow token',
            version: expectedVersion,
          },
        });
      });
    });

    it('throws error on failure', async () => {
      mockLogger.error = jest.fn();
      const error = new Error('API error');
      mockFetchFromApi.mockRejectedValueOnce(error);

      await expect(service.revokeWorkflowToken(generateTokenResponse)).rejects.toThrow(
        'Could not revoke workflow token',
      );
    });
  });

  describe('getGraphqlData', () => {
    const testQuery = 'query { duoWorkflowEvents { nodes } }';
    const testFragment = { gte: 'yes fragment', lt: 'no fragment', version: '18.5.0' };
    const mockVariables = { workflowId: mockWorkflowId };
    const mockResponse = {
      duoWorkflowEvents: {
        nodes: [
          { id: 'event-1', type: 'user' },
          { id: 'event-2', type: 'system' },
        ],
      },
    };

    it('returns GraphQL data when the request succeeds', async () => {
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);

      const result = await service.getGraphqlData({
        query: testQuery,
        variables: mockVariables,
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining(testQuery),
        variables: mockVariables,
        supportedSinceInstanceVersion: undefined,
      });
    });

    it('returns error when GraphQL query is not known', async () => {
      mockContainsQuery.mockReturnValueOnce(false);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);

      await expect(
        service.getGraphqlData({
          query: 'query { duoWorkflowEvents { nodes { thisQueryIsNotKnown: id } } }',
          variables: mockVariables,
        }),
      ).rejects.toThrow('Provided Graphql query is not meeting performance standards.');
    });

    it('includes supportedSinceInstanceVersion when provided', async () => {
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);
      const supportedVersion = {
        resourceName: 'workflow events',
        version: '17.5.0',
      };

      await service.getGraphqlData({
        query: testQuery,
        variables: mockVariables,
        supportedSinceInstanceVersion: supportedVersion,
      });

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining(testQuery),
        variables: mockVariables,
        supportedSinceInstanceVersion: supportedVersion,
      });
    });

    it('adds the fragment when the version is supported', async () => {
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);
      const supportedVersion = {
        resourceName: 'workflow events',
        version: '17.5.0',
      };

      await service.getGraphqlData({
        query: testQuery,
        variables: mockVariables,
        fragment: { ...testFragment, version: '18.3.0' },
        supportedSinceInstanceVersion: supportedVersion,
      });

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining(testFragment.gte),
        variables: mockVariables,
        supportedSinceInstanceVersion: supportedVersion,
      });
    });

    it('adds the fragment when the version is supported', async () => {
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);
      const supportedVersion = {
        resourceName: 'workflow events',
        version: '17.5.0',
      };

      await service.getGraphqlData({
        query: testQuery,
        variables: mockVariables,
        fragment: { ...testFragment, version: '18.5.0' },
        supportedSinceInstanceVersion: supportedVersion,
      });

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining(testFragment.lt),
        variables: mockVariables,
        supportedSinceInstanceVersion: supportedVersion,
      });
    });

    describe('fetching agent catalog items', () => {
      it('throws an invalid version error for an 18.3.2 instance', async () => {
        const expectedError = new InvalidInstanceVersionError("Unsupported version: '18.3.2'");
        mockContainsQuery.mockReturnValueOnce(true);
        mockFetchFromApi.mockRejectedValueOnce(expectedError);

        await expect(
          service.getGraphqlData({
            query: GET_CONFIGURED_AGENTS,
            variables: { projectId: 'project-123' },
            fragment: {
              version: '18.4.2',
              lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
              gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
            },
          }),
        ).rejects.toThrow(expectedError);
      });

      it.each`
        instanceVersion | result                  | expectedFragment
        ${'18.4.0'}     | ${'18.4.1 and earlier'} | ${GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER}
        ${'18.4.1'}     | ${'18.4.1 and earlier'} | ${GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER}
        ${'18.4.2'}     | ${'18.4.2 and later'}   | ${GET_CONFIGURED_AGENTS_18_4_2_AND_LATER}
        ${'18.5.0'}     | ${'18.4.2 and later'}   | ${GET_CONFIGURED_AGENTS_18_4_2_AND_LATER}
      `(
        'uses resolves $result fragment for GitLab $instanceVersion',
        async ({ instanceVersion, expectedFragment }) => {
          const expectedResponse = {
            aiCatalogConfiguredItems: {
              nodes: [
                {
                  pinnedItemVersion: { id: 'version-1' },
                  item: {
                    id: 'agent-1',
                    name: 'Test Agent',
                    description: 'A test agent',
                  },
                },
              ],
            },
          };
          mockInstanceInfo.instanceVersion = instanceVersion;
          mockContainsQuery.mockReturnValueOnce(true);
          mockFetchFromApi.mockResolvedValueOnce(expectedResponse);

          const actual = await service.getGraphqlData({
            query: GET_CONFIGURED_AGENTS,
            variables: { projectId: 'project-123' },
            fragment: {
              version: '18.4.2',
              lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
              gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
            },
          });

          expect(mockFetchFromApi).toHaveBeenCalledWith({
            type: 'graphql',
            query: expect.stringContaining(expectedFragment),
            variables: { projectId: 'project-123' },
            supportedSinceInstanceVersion: undefined,
          });
          expect(actual).toEqual(expectedResponse);
        },
      );

      it('handles missing instance version by defaulting to newer fragment', async () => {
        mockInstanceInfo.instanceVersion = undefined;
        mockContainsQuery.mockReturnValueOnce(true);
        mockFetchFromApi.mockResolvedValueOnce({
          aiCatalogConfiguredItems: {
            nodes: [],
          },
        });

        await service.getGraphqlData({
          query: GET_CONFIGURED_AGENTS,
          variables: { projectId: 'project-123' },
          fragment: {
            version: '18.4.2',
            lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
            gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
          },
        });

        // When instance version is undefined, ifVersionGte defaults to the 'then' branch (newer fragment)
        expect(mockFetchFromApi).toHaveBeenCalledWith({
          type: 'graphql',
          query: expect.stringContaining(GET_CONFIGURED_AGENTS_18_4_2_AND_LATER),
          variables: { projectId: 'project-123' },
          supportedSinceInstanceVersion: undefined,
        });
      });
    });

    it('logs and throws with error message when GraphQL request fails', async () => {
      mockLogger.info = jest.fn();
      mockLogger.error = jest.fn();
      const error = new Error('GraphQL error');
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockRejectedValueOnce(error);

      await expect(
        service.getGraphqlData({
          query: testQuery,
          variables: mockVariables,
        }),
      ).rejects.toThrow('GraphQL error');

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[WorkflowRailsService] Graphql fetch failed:',
        error,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(error);
    });

    it('handles empty variables gracefully', async () => {
      mockContainsQuery.mockReturnValueOnce(true);
      mockFetchFromApi.mockResolvedValueOnce(mockResponse);

      await service.getGraphqlData({
        query: testQuery,
      });

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining(testQuery),
        variables: {},
        supportedSinceInstanceVersion: undefined,
      });
    });
  });

  describe('getEnabledWorkflowFeatureFlags', () => {
    const mockHeaders = new Map<string, string>();
    let mockResponse: Response;

    beforeEach(() => {
      mockHeaders.clear();
      mockResponse = {
        headers: {
          get: (name: string) => mockHeaders.get(name) || null,
        },
      } as unknown as Response;
    });

    it('extracts feature flags from the response headers when present', async () => {
      mockHeaders.set('x-gitlab-enabled-feature-flags', 'flag1,flag2,flag3');
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);

      expect(result).toEqual(['flag1', 'flag2', 'flag3']);
      expect(mockFetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method: 'HEAD',
        path: `/api/v4/ai/duo_workflows/workflows/${mockWorkflowId}`,
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow',
          version: '17.3.0',
        },
      });
    });

    it('returns an empty array when no feature flags header is present', async () => {
      mockHeaders.clear();
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);

      expect(result).toEqual([]);
    });

    it('filters out empty strings from feature flags header', async () => {
      mockHeaders.set('x-gitlab-enabled-feature-flags', 'flag1,,flag2,flag3,');
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);

      expect(result).toEqual(['flag1', 'flag2', 'flag3']);
    });

    it('returns cached values on subsequent calls without making additional API requests', async () => {
      mockHeaders.set('x-gitlab-enabled-feature-flags', 'flag1,flag2,flag3');
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const result1 = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);
      expect(result1).toEqual(['flag1', 'flag2', 'flag3']);
      expect(mockFetchFromApiRaw).toHaveBeenCalledTimes(1);

      const result2 = await service.getEnabledWorkflowFeatureFlags('different-workflow-id');
      expect(result2).toEqual(['flag1', 'flag2', 'flag3']);
      expect(mockFetchFromApiRaw).toHaveBeenCalledTimes(1);
    });

    it('clears the cache when API is reconfigured', async () => {
      mockHeaders.set('x-gitlab-enabled-feature-flags', 'flag1,flag2');
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);
      await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);
      expect(mockFetchFromApiRaw).toHaveBeenCalledTimes(1);

      mockHeaders.set('x-gitlab-enabled-feature-flags', 'new-flag1,new-flag2');
      mockFetchFromApiRaw.mockResolvedValueOnce(mockResponse);

      const apiReconfigurationCallback = (mockGitLabApiService.onApiReconfigured as jest.Mock).mock
        .calls[0][0];
      apiReconfigurationCallback();

      const result = await service.getEnabledWorkflowFeatureFlags(mockWorkflowId);
      expect(result).toEqual(['new-flag1', 'new-flag2']);
      expect(mockFetchFromApiRaw).toHaveBeenCalledTimes(2);
    });

    it('logs and rethrows errors', async () => {
      mockLogger.error = jest.fn();
      const error = new Error('API error');
      mockFetchFromApiRaw.mockRejectedValueOnce(error);

      await expect(service.getEnabledWorkflowFeatureFlags(mockWorkflowId)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[WorkflowRailsService] Failed to get enabled feature flags header',
        error,
      );
    });
  });

  describe('getAiChatAvailableModels', () => {
    const mockModelsResponse = {
      aiChatAvailableModels: {
        defaultModel: { name: 'Default', ref: 'default-model-id' },
        pinnedModel: null,
        selectableModels: [{ name: 'Default', ref: 'default-model-id' }],
      },
      metadata: { featureFlags: [], version: '18.5.0-ee' },
    };

    describe('when rootNamespaceId is missing', () => {
      it.each`
        description       | rootNamespaceId
        ${'empty string'} | ${''}
        ${'undefined'}    | ${undefined}
      `('skips the query when rootNamespaceId is $description', async ({ rootNamespaceId }) => {
        const result = await service.getAiChatAvailableModels({ rootNamespaceId });

        expect(result).toBeNull();
        expect(mockGraphQLService.execute).not.toHaveBeenCalled();
      });
    });

    describe('when rootNamespaceId is provided', () => {
      it('queries available models with the namespace GID', async () => {
        jest.mocked(mockGraphQLService.execute).mockResolvedValueOnce(mockModelsResponse);

        const result = await service.getAiChatAvailableModels({ rootNamespaceId: '42' });

        expect(result).toEqual(mockModelsResponse);
        expect(mockGraphQLService.execute).toHaveBeenCalledWith(
          expect.anything(),
          { rootNamespaceId: 'gid://gitlab/Group/42' },
          undefined,
        );
      });

      describe('when the query fails', () => {
        const error = new Error('GraphQL request failed');

        beforeEach(() => {
          jest.mocked(mockGraphQLService.execute).mockRejectedValueOnce(error);
        });

        it('returns null', async () => {
          const result = await service.getAiChatAvailableModels({ rootNamespaceId: '42' });

          expect(result).toBeNull();
        });
      });
    });
  });
});
