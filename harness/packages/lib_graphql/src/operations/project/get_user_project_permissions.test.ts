import { createFakePartial } from '@gitlab-org/test-utils';
import { GitLabApiService } from '@gitlab-org/core';
import { Logger } from '@gitlab-org/logging';
import { DefaultGraphQLService, GraphQLService } from '../../service';
import {
  GetUserProjectPermissionsData,
  GetUserProjectPermissionsQuery,
} from './get_user_project_permissions';

describe('GetUserProjectPermissionsQuery', () => {
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
      subject({ instanceVersion: '18.0.0-ee' }).execute(GetUserProjectPermissionsQuery, {
        projectPath: 'group/proj',
      }),
    ).rejects.toThrow(
      new Error(`Error fetching project permissions: ${originalError}`, { cause: originalError }),
    );
  });

  it('resolves the expected payload', async () => {
    const expected: GetUserProjectPermissionsData = {
      project: {
        id: 'gid://gitlab/Project/7',
        userPermissions: {
          pushCode: true,
          adminProject: false,
          removeProject: false,
          adminAiCatalogItem: true,
          readAiCatalogItem: true,
        },
      },
    };
    mockFetchFromApi.mockResolvedValueOnce(expected);

    await expect(
      subject({ instanceVersion: '18.3.0-ee' }).execute(GetUserProjectPermissionsQuery, {
        projectPath: 'group/proj',
      }),
    ).resolves.toEqual(expected);
  });

  it('tolerates AI Catalog fields stripped on older instances', async () => {
    const expected: GetUserProjectPermissionsData = {
      project: {
        id: 'gid://gitlab/Project/7',
        userPermissions: {
          pushCode: true,
          adminProject: false,
          removeProject: false,
          adminAiCatalogItem: null,
          readAiCatalogItem: null,
        },
      },
    };
    mockFetchFromApi.mockResolvedValueOnce(expected);

    await expect(
      subject({ instanceVersion: '18.0.0-ee' }).execute(GetUserProjectPermissionsQuery, {
        projectPath: 'group/proj',
      }),
    ).resolves.toEqual(expected);
  });

  it('returns null project when the user cannot access the project', async () => {
    mockFetchFromApi.mockResolvedValueOnce({ project: null });

    await expect(
      subject({ instanceVersion: '18.0.0-ee' }).execute(GetUserProjectPermissionsQuery, {
        projectPath: 'group/proj',
      }),
    ).resolves.toEqual({ project: null });
  });
});
