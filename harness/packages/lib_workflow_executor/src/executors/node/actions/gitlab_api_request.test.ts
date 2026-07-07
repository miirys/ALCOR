import type { GitLabApiService, SimpleApiClient } from '@gitlab-org/core';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { getMockWorkflowToken } from '../../test_utils';
import type { WorkflowAction } from '../clients/types';
import { type GitlabApiRequestAction, GitlabApiRequestActionHandler } from './gitlab_api_request';
import type { WorkflowActionContext } from './index';

describe('GitlabApiRequestActionHandler', () => {
  let gitlabApiRequestHandler: GitlabApiRequestActionHandler;
  let mockLogger: TestLogger;
  let mockGitLabApiService: GitLabApiService;
  let mockSimpleApiClient: SimpleApiClient;
  let workflowActionContext: WorkflowActionContext;
  let abortController: AbortController;

  const mockWorkflowToken = getMockWorkflowToken();

  beforeEach(() => {
    abortController = new AbortController();

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workflowToken: mockWorkflowToken,
      abortSignal: abortController.signal,
    });

    mockLogger = new TestLogger();

    mockSimpleApiClient = createFakePartial<SimpleApiClient>({
      fetchFromApiRaw: jest.fn(),
      getDefaultHeaders: jest.fn(),
      fetchOperation: jest.fn(),
    });

    mockGitLabApiService = createFakePartial<GitLabApiService>({
      getSimpleClient: jest.fn().mockReturnValue(mockSimpleApiClient),
    });

    gitlabApiRequestHandler = new GitlabApiRequestActionHandler(mockLogger, mockGitLabApiService);
  });

  describe('canHandle', () => {
    it('returns true for runHTTPRequest actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runHTTPRequest: {
          method: 'GET',
          path: '/api/v4/projects',
        },
      });

      expect(gitlabApiRequestHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(gitlabApiRequestHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    it('uses workflow token for API requests', async () => {
      const apiResponse = createFakePartial<Response>({
        status: 200,
        async text() {
          return JSON.stringify({ data: 'test data' });
        },
        headers: new Headers([['X-GitLab-Header', 'hello']]),
      });

      jest.mocked(mockSimpleApiClient.fetchFromApiRaw).mockResolvedValue(apiResponse);

      const action = createFakePartial<GitlabApiRequestAction>({
        runHTTPRequest: {
          method: 'GET',
          path: '/api/v4/projects',
        },
      });

      await gitlabApiRequestHandler.execute(action, workflowActionContext);

      expect(mockGitLabApiService.getSimpleClient).toHaveBeenCalledWith(
        mockWorkflowToken.gitlab_rails.base_url,
        mockWorkflowToken.gitlab_rails.token,
      );
    });

    it.each([
      {
        method: 'GET',
        path: '/api/v4/projects',
        body: undefined,
        response: { data: 'test data' },
        expectedBody: undefined,
      },
      {
        method: 'POST',
        path: '/api/v4/projects',
        body: JSON.stringify({ name: 'New Project', path: 'new-project' }),
        response: { id: 123, name: 'New Project' },
        expectedBody: { name: 'New Project', path: 'new-project' },
      },
      {
        method: 'PUT',
        path: '/api/v4/projects/123',
        body: JSON.stringify({ name: 'Updated Project' }),
        response: { id: 123, name: 'Updated Project' },
        expectedBody: { name: 'Updated Project' },
      },
      {
        method: 'PATCH',
        path: '/api/v4/projects/123',
        body: JSON.stringify({ name: 'Patched Project' }),
        response: { id: 123, name: 'Patched Project' },
        expectedBody: { name: 'Patched Project' },
      },
    ])('handles $method requests', async ({ method, path, body, response, expectedBody }) => {
      const apiResponse = createFakePartial<Response>({
        status: 200,
        async text() {
          return JSON.stringify(response);
        },
        headers: new Headers([['X-GitLab-Header', 'hello']]),
      });
      jest.mocked(mockSimpleApiClient.fetchFromApiRaw).mockResolvedValue(apiResponse);

      const action = createFakePartial<GitlabApiRequestAction>({
        runHTTPRequest: {
          method,
          path,
          body,
        },
      });

      const { body: responseBody } = await gitlabApiRequestHandler.execute(
        action,
        workflowActionContext,
      );

      expect(mockSimpleApiClient.fetchFromApiRaw).toHaveBeenCalledWith({
        type: 'rest',
        method,
        path,
        body: expectedBody,
        signal: abortController.signal,
      });

      expect(responseBody).toBe(JSON.stringify(response));
    });

    it('handles API errors properly', async () => {
      const apiResponse = createFakePartial<Response>({
        status: 401,
        async text() {
          return '401 unauthorized';
        },
        headers: new Headers([['X-GitLab-Header', 'hello']]),
      });
      jest.mocked(mockSimpleApiClient.fetchFromApiRaw).mockResolvedValue(apiResponse);

      const action = createFakePartial<GitlabApiRequestAction>({
        runHTTPRequest: {
          method: 'GET',
          path: '/api/v4/projects',
        },
      });

      const { body, headers, statusCode, error } = await gitlabApiRequestHandler.execute(
        action,
        workflowActionContext,
      );

      expect(body).toBe('401 unauthorized');
      expect(headers).toEqual({ 'x-gitlab-header': 'hello' });
      expect(statusCode).toBe(401);
      expect(error).toBe('');
    });

    it('handles invalid JSON in body', async () => {
      const action = createFakePartial<GitlabApiRequestAction>({
        runHTTPRequest: {
          method: 'POST',
          path: '/api/v4/projects',
          body: '{invalid json}',
        },
      });

      const { error, statusCode, headers } = await gitlabApiRequestHandler.execute(
        action,
        workflowActionContext,
      );

      expect(error).toMatch("Expected property name or '}' in JSON at position 1");
      expect(statusCode).toBe(0);
      expect(headers).toEqual({});
    });
  });
});
