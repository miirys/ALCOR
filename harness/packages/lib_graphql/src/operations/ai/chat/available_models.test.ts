import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService, InstanceFeatureFlags } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../../service';
import { AvailableModels } from '../../../types';
import { AiChatAvailableModelsData, AiChatAvailableModelsQuery } from './available_models';

describe('AiChatAvailableModelsQuery', () => {
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
      subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatAvailableModelsQuery, {
        rootNamespaceId: 'gid://gitlab/Group/1',
      }),
    ).rejects.toThrow(
      new Error(`Error querying available models: ${originalError}`, {
        cause: originalError,
      }),
    );
  });

  it('falls back to null response for earlier instance', async () => {
    await expect(
      subject({ instanceVersion: '18.3.0-ee' }).execute(AiChatAvailableModelsQuery, {
        rootNamespaceId: 'gid://gitlab/Group/1',
      }),
    ).resolves.toEqual({ aiChatAvailableModels: null, metadata: null });

    expect(mockFetchFromApi).not.toHaveBeenCalled();
  });

  describe('supported versions', () => {
    let expected: AiChatAvailableModelsData;

    beforeEach(() => {
      expected = {
        aiChatAvailableModels: {
          defaultModel: { name: 'Claude Sonnet 4.0 - Anthropic', ref: 'claude_sonnet_4_20250514' },
          selectableModels: [
            { name: 'Claude Sonnet 4.0 - Anthropic', ref: 'claude_sonnet_4_20250514' },
            { name: 'Claude Sonnet 4.5 - Anthropic', ref: 'claude_sonnet_4_5_20250929' },
          ],
          pinnedModel: { name: 'Claude Sonnet 4.5 - Anthropic', ref: 'claude_sonnet_4_5_20250929' },
        },
        metadata: {
          version: '18.6.0-ee',
          featureFlags: [{ enabled: true, name: InstanceFeatureFlags.UserModelSwitching }],
        },
      };
    });

    it('resolves expected response', async () => {
      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatAvailableModelsQuery, {
          rootNamespaceId: 'gid://gitlab/Group/1',
        }),
      ).resolves.toEqual(expected);
    });

    it('resolves expected response with null pinnedModel', async () => {
      const { defaultModel, selectableModels } = expected.aiChatAvailableModels as AvailableModels;
      expected.aiChatAvailableModels = { defaultModel, selectableModels, pinnedModel: null };
      mockFetchFromApi.mockResolvedValueOnce(expected);

      await expect(
        subject({ instanceVersion: '18.6.0-ee' }).execute(AiChatAvailableModelsQuery, {
          rootNamespaceId: 'gid://gitlab/Group/1',
        }),
      ).resolves.toEqual(expected);
    });
  });
});
