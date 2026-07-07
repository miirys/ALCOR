import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../../service';
import { GetCatalogFlowData, GetCatalogFlowQuery } from './get_flow';

describe('GetCatalogFlowQuery', () => {
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

  beforeEach(() => mockFetchFromApi.mockReset());

  it('bubbles up unexpected errors with cause', async () => {
    const originalError = new Error('boom');
    mockFetchFromApi.mockRejectedValueOnce(originalError);

    await expect(
      subject({ instanceVersion: '18.8.0-ee' }).execute(GetCatalogFlowQuery, {
        id: 'gid://gitlab/Ai::Catalog::Item/1',
      }),
    ).rejects.toThrow(
      new Error(`Error fetching catalog flow: ${originalError}`, { cause: originalError }),
    );
  });

  it('falls back to null item on pre-18.8 instances', async () => {
    await expect(
      subject({ instanceVersion: '18.7.0-ee' }).execute(GetCatalogFlowQuery, {
        id: 'gid://gitlab/Ai::Catalog::Item/1',
      }),
    ).resolves.toEqual({ aiCatalogItem: null });
    expect(mockFetchFromApi).not.toHaveBeenCalled();
  });

  it('resolves expected response on supported instance', async () => {
    const expected: GetCatalogFlowData = {
      aiCatalogItem: {
        id: 'gid://gitlab/Ai::Catalog::Item/1',
        name: 'My Flow',
        description: 'desc',
        public: false,
        updatedAt: '2026-04-27T00:00:00Z',
        project: { id: 'gid://gitlab/Project/7', fullPath: 'group/proj' },
        latestVersion: {
          id: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
          versionName: '1.0.0',
          humanVersionName: 'v1.0.0',
          released: true,
          releasedAt: '2026-04-27T00:00:00Z',
          updatedAt: '2026-04-27T00:00:00Z',
          definition:
            'version: "v1"\nenvironment: ambient\ncomponents: []\nrouters: []\nflow: {}\n',
        },
      },
    };
    mockFetchFromApi.mockResolvedValueOnce(expected);

    await expect(
      subject({ instanceVersion: '18.8.0-ee' }).execute(GetCatalogFlowQuery, {
        id: 'gid://gitlab/Ai::Catalog::Item/1',
      }),
    ).resolves.toEqual(expected);
  });
});
