import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../service';
import {
  UpdateToolCallApprovalsMutation,
  UpdateToolCallApprovalsData,
  UpdateToolCallApprovalsVariables,
} from './update_tool_call_approvals';

describe('UpdateToolCallApprovalsMutation', () => {
  const mockFetchFromApi = jest.fn();
  let mockApi: GitLabApiService;

  const subject = ({ instanceVersion }: { instanceVersion: string }): GraphQLService => {
    mockApi = createFakePartial<GitLabApiService>({
      instanceInfo: { instanceVersion },
      fetchFromApi: mockFetchFromApi,
      onApiReconfigured: jest.fn(),
    });
    const logger = createFakePartial<Logger>({ debug: jest.fn() });
    return new DefaultGraphQLService(mockApi, logger);
  };

  const workflowId = 'gid://gitlab/Ai::DuoWorkflows::Workflow/123';
  const toolName = 'test_tool';
  const toolCallArgs = JSON.stringify({ arg1: 'value1' });

  describe('version compatibility', () => {
    it('bubbles up unexpected errors for supported versions', async () => {
      const originalError = new Error('Network error');
      mockFetchFromApi.mockRejectedValueOnce(originalError);

      await expect(
        subject({ instanceVersion: '18.9.0-ee' }).execute<
          UpdateToolCallApprovalsData,
          UpdateToolCallApprovalsVariables
        >(UpdateToolCallApprovalsMutation, {
          workflowId,
          toolName,
          toolCallArgs,
        }),
      ).rejects.toThrow(
        new Error(`Error updating tool call approvals: ${originalError}`, {
          cause: originalError,
        }),
      );
    });

    it('falls back to a no-op (no errors) for earlier instance versions', async () => {
      const result = await subject({ instanceVersion: '18.8.0-ee' }).execute<
        UpdateToolCallApprovalsData,
        UpdateToolCallApprovalsVariables
      >(UpdateToolCallApprovalsMutation, {
        workflowId,
        toolName,
        toolCallArgs,
      });

      expect(result).toEqual({
        updateDuoWorkflowToolCallApprovals: {
          workflow: null,
          errors: [],
        },
      });

      expect(mockFetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('supported versions (18.9.0+)', () => {
    it('resolves expected response on success', async () => {
      const expected: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: workflowId,
            toolCallApprovals: '{"test_tool":{"arg1":"value1"}}',
          },
          errors: [],
        },
      };

      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.9.0-ee' }).execute<
          UpdateToolCallApprovalsData,
          UpdateToolCallApprovalsVariables
        >(UpdateToolCallApprovalsMutation, {
          workflowId,
          toolName,
          toolCallArgs,
        }),
      ).resolves.toEqual(expected);
    });

    it('handles mutation errors from backend', async () => {
      const expected: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: null,
          errors: ['Workflow not found', 'Invalid tool_call_approvals format'],
        },
      };

      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.9.0-ee' }).execute<
          UpdateToolCallApprovalsData,
          UpdateToolCallApprovalsVariables
        >(UpdateToolCallApprovalsMutation, {
          workflowId,
          toolName,
          toolCallArgs,
        }),
      ).resolves.toEqual(expected);
    });

    it('handles null toolCallApprovals in response', async () => {
      const expected: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: workflowId,
            toolCallApprovals: null,
          },
          errors: [],
        },
      };

      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.9.0-ee' }).execute<
          UpdateToolCallApprovalsData,
          UpdateToolCallApprovalsVariables
        >(UpdateToolCallApprovalsMutation, {
          workflowId,
          toolName,
          toolCallArgs,
        }),
      ).resolves.toEqual(expected);
    });
  });
});
