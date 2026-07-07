import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../../service';
import {
  AiChatFoundationalAgentData,
  AiChatFoundationalAgentsQuery,
} from './foundational_chat_agents';

describe('AiChatFoundationalAgentsQuery', () => {
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

  it('bubbles up unexpected errors', async () => {
    const originalError = new Error('Uh-oh raichu');
    mockFetchFromApi.mockRejectedValueOnce(originalError);

    await expect(
      subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatFoundationalAgentsQuery, {
        projectId: 'gid://gitlab/Project/1',
        namespaceId: 'gid://gitlab/Group/1',
      }),
    ).rejects.toThrow(
      new Error(`Error querying foundational agents: ${originalError}`, {
        cause: originalError,
      }),
    );
  });

  it('falls back to empty response for earlier instance', async () => {
    await expect(
      subject({ instanceVersion: '18.5.0-ee' }).execute(AiChatFoundationalAgentsQuery, {
        projectId: 'gid://gitlab/Project/1',
        namespaceId: 'gid://gitlab/Group/1',
      }),
    ).resolves.toEqual({ aiFoundationalChatAgents: { nodes: [] } });

    expect(mockFetchFromApi).not.toHaveBeenCalled();
  });

  describe('supported versions', () => {
    let expected: AiChatFoundationalAgentData;

    beforeEach(() => {
      expected = {
        aiFoundationalChatAgents: {
          nodes: [
            {
              id: 'gid://gitlab/Ai::FoundationalChatAgent/1',
              name: 'Code Assistant',
              description: 'Helps with code generation and debugging',
              referenceWithVersion: 'code-assistant@v1.0.0',
            },
            {
              id: 'gid://gitlab/Ai::FoundationalChatAgent/2',
              name: 'Documentation Helper',
              description: 'Assists with writing and improving documentation',
              referenceWithVersion: 'doc-helper@v2.1.0',
            },
            {
              id: 'gid://gitlab/Ai::FoundationalChatAgent/3',
              name: 'Security Advisor',
              description: 'Provides security recommendations and vulnerability analysis',
              referenceWithVersion: 'security-advisor@v1.5.0',
            },
          ],
        },
      };
    });

    it('resolves expected response', async () => {
      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatFoundationalAgentsQuery, {
          projectId: 'gid://gitlab/Project/1',
          namespaceId: 'gid://gitlab/Group/1',
        }),
      ).resolves.toEqual(expected);
    });

    it('resolves expected response with empty agents list', async () => {
      const emptyResponse: AiChatFoundationalAgentData = {
        aiFoundationalChatAgents: { nodes: [] },
      };
      mockFetchFromApi.mockResolvedValueOnce(emptyResponse);

      await expect(
        subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatFoundationalAgentsQuery, {
          projectId: 'gid://gitlab/Project/1',
          namespaceId: 'gid://gitlab/Group/1',
        }),
      ).resolves.toEqual(emptyResponse);
    });

    it('resolves expected response with single agent', async () => {
      const singleAgentResponse: AiChatFoundationalAgentData = {
        aiFoundationalChatAgents: {
          nodes: [
            {
              id: 'gid://gitlab/Ai::FoundationalChatAgent/1',
              name: 'Code Assistant',
              description: 'Helps with code generation and debugging',
              referenceWithVersion: 'code-assistant@v1.0.0',
            },
          ],
        },
      };
      mockFetchFromApi.mockResolvedValueOnce(singleAgentResponse);

      await expect(
        subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatFoundationalAgentsQuery, {
          projectId: 'gid://gitlab/Project/1',
          namespaceId: 'gid://gitlab/Group/1',
        }),
      ).resolves.toEqual(singleAgentResponse);
    });
  });
});
