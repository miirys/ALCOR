import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../../service';
import { ListCatalogFlowsData, ListCatalogFlowsQuery } from './list_flows';

describe('ListCatalogFlowsQuery', () => {
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
      subject({ instanceVersion: '18.8.0-ee' }).execute(ListCatalogFlowsQuery, {
        search: null,
        first: null,
        after: null,
      }),
    ).rejects.toThrow(
      new Error(`Error listing catalog flows: ${originalError}`, { cause: originalError }),
    );
  });

  it('falls back to empty connection on pre-18.8 instances', async () => {
    await expect(
      subject({ instanceVersion: '18.7.0-ee' }).execute(ListCatalogFlowsQuery, {
        search: null,
        first: null,
        after: null,
      }),
    ).resolves.toEqual({
      aiCatalogItems: {
        edges: null,
        pageInfo: { startCursor: '', endCursor: '', hasNextPage: false, hasPreviousPage: false },
      },
    });
    expect(mockFetchFromApi).not.toHaveBeenCalled();
  });

  it('resolves expected response on supported instance', async () => {
    const expected: ListCatalogFlowsData = {
      aiCatalogItems: {
        edges: [
          {
            node: {
              id: 'gid://gitlab/Ai::Catalog::Item/42',
              name: 'My Flow',
              description: 'desc',
              public: true,
              updatedAt: '2026-04-27T00:00:00Z',
              project: { id: 'gid://gitlab/Project/7', fullPath: 'group/proj' },
              latestVersion: {
                id: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
                versionName: '1.0.0',
                humanVersionName: 'v1.0.0',
                released: true,
                releasedAt: '2026-04-27T00:00:00Z',
                updatedAt: '2026-04-27T00:00:00Z',
                definition: null,
              },
            },
          },
        ],
        pageInfo: {
          startCursor: 'a',
          endCursor: 'b',
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
    mockFetchFromApi.mockResolvedValueOnce(expected);

    await expect(
      subject({ instanceVersion: '18.8.0-ee' }).execute(ListCatalogFlowsQuery, {
        search: 'foo',
        first: 20,
        after: null,
      }),
    ).resolves.toEqual(expected);
  });
});
