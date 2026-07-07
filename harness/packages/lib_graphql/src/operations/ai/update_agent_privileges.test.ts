import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../service';
import {
  UpdateAgentPrivilegesMutation,
  UpdateAgentPrivilegesData,
  UpdateAgentPrivilegesVariables,
} from './update_agent_privileges';

describe('UpdateAgentPrivilegesMutation', () => {
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
  const agentPrivileges = [8];
  const preApprovedAgentPrivileges = [8];

  describe('version compatibility', () => {
    it('bubbles up unexpected errors for supported versions', async () => {
      const originalError = new Error('Network error');
      mockFetchFromApi.mockRejectedValueOnce(originalError);

      await expect(
        subject({ instanceVersion: '19.2.0-ee' }).execute<
          UpdateAgentPrivilegesData,
          UpdateAgentPrivilegesVariables
        >(UpdateAgentPrivilegesMutation, {
          workflowId,
          agentPrivileges,
          preApprovedAgentPrivileges,
        }),
      ).rejects.toThrow(
        new Error(`Error updating agent privileges: ${originalError}`, {
          cause: originalError,
        }),
      );
    });

    it('falls back to a no-op (no errors) for earlier instance versions', async () => {
      const result = await subject({ instanceVersion: '19.1.0-ee' }).execute<
        UpdateAgentPrivilegesData,
        UpdateAgentPrivilegesVariables
      >(UpdateAgentPrivilegesMutation, {
        workflowId,
        agentPrivileges,
        preApprovedAgentPrivileges,
      });

      // The mutation is never sent on unsupported instances; surface this as a
      // no-op rather than an error so mode switching degrades gracefully.
      expect(result).toEqual({
        updateDuoWorkflowAgentPrivileges: {
          workflow: null,
          errors: [],
        },
      });

      expect(mockFetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('supported versions (19.2.0+)', () => {
    it('resolves expected response on success', async () => {
      const expected: UpdateAgentPrivilegesData = {
        updateDuoWorkflowAgentPrivileges: {
          workflow: { id: workflowId },
          errors: [],
        },
      };

      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '19.2.0-ee' }).execute<
          UpdateAgentPrivilegesData,
          UpdateAgentPrivilegesVariables
        >(UpdateAgentPrivilegesMutation, {
          workflowId,
          agentPrivileges,
          preApprovedAgentPrivileges,
        }),
      ).resolves.toEqual(expected);
    });

    it('handles mutation errors from backend', async () => {
      const expected: UpdateAgentPrivilegesData = {
        updateDuoWorkflowAgentPrivileges: {
          workflow: null,
          errors: ['Workflow not found'],
        },
      };

      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '19.2.0-ee' }).execute<
          UpdateAgentPrivilegesData,
          UpdateAgentPrivilegesVariables
        >(UpdateAgentPrivilegesMutation, {
          workflowId,
          agentPrivileges,
          preApprovedAgentPrivileges,
        }),
      ).resolves.toEqual(expected);
    });
  });
});
