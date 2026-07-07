import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../../service';
import { CreateCatalogFlowData, CreateCatalogFlowMutation } from './create_flow';

describe('CreateCatalogFlowMutation', () => {
  const mockFetchFromApi = jest.fn();
  const subject = ({ instanceVersion }: { instanceVersion: string }): GraphQLService => {
    const mockApi = createFakePartial<GitLabApiService>({
      instanceInfo: { instanceVersion },
      fetchFromApi: mockFetchFromApi,
      onApiReconfigured: jest.fn(),
    });
    const logger = createFakePartial<Logger>({ debug: jest.fn() });
    return new DefaultGraphQLService(mockApi, logger);
  };

  const variables = {
    projectId: 'gid://gitlab/Project/7',
    name: 'New Flow',
    description: 'desc',
    public: false,
    definition: 'version: "v1"\n',
  };

  beforeEach(() => mockFetchFromApi.mockReset());

  it('bubbles up unexpected errors with cause', async () => {
    const originalError = new Error('boom');
    mockFetchFromApi.mockRejectedValueOnce(originalError);

    await expect(
      subject({ instanceVersion: '18.8.0-ee' }).execute(CreateCatalogFlowMutation, variables),
    ).rejects.toThrow(
      new Error(`Error creating catalog flow: ${originalError}`, { cause: originalError }),
    );
  });

  it('throws on pre-18.8 instances rather than returning a no-op', async () => {
    await expect(
      subject({ instanceVersion: '18.7.0-ee' }).execute(CreateCatalogFlowMutation, variables),
    ).rejects.toThrow('Catalog flow creation requires GitLab 18.8 or later');
    expect(mockFetchFromApi).not.toHaveBeenCalled();
  });

  it('resolves expected response on supported instance', async () => {
    const expected: CreateCatalogFlowData = {
      aiCatalogFlowCreate: {
        item: {
          id: 'gid://gitlab/Ai::Catalog::Item/100',
          name: 'New Flow',
          description: 'desc',
          public: false,
          updatedAt: '2026-04-27T00:00:00Z',
          project: { id: 'gid://gitlab/Project/7', fullPath: 'group/proj' },
          latestVersion: {
            id: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
            versionName: '1.0.0',
            humanVersionName: 'v1.0.0-draft',
            released: false,
            releasedAt: null,
            updatedAt: '2026-04-27T00:00:00Z',
            definition: null,
          },
        },
        errors: [],
      },
    };
    mockFetchFromApi.mockResolvedValueOnce(expected);

    await expect(
      subject({ instanceVersion: '18.8.0-ee' }).execute(CreateCatalogFlowMutation, variables),
    ).resolves.toEqual(expected);
  });
});
