import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GetRepositoriesResponse, RepositoryProvider } from '@gitlab-org/core';
import { RepositoryController } from './repository_controller';

describe('RepositoryController', () => {
  let controller: RepositoryController;
  let mockRepositoryProvider: RepositoryProvider;

  beforeEach(() => {
    mockRepositoryProvider = createFakePartial<RepositoryProvider>({
      getRepositories: jest.fn(),
      init: jest.fn(),
      dispose: jest.fn(),
    });

    controller = new RepositoryController(mockRepositoryProvider, new TestLogger());
  });

  describe('getRepositories', () => {
    it('should return repositories from the provider', () => {
      const mockResponse = createFakePartial<GetRepositoriesResponse>({
        repositories: [
          {
            type: 'single',
            repository: {
              rootFsPath: '/path/to/repo',
              folderName: 'test-repo',
              remotes: [
                {
                  name: 'origin',
                  urls: [
                    {
                      url: 'https://gitlab.com/test/project.git',
                      type: 'both',
                    },
                  ],
                },
              ],
            },
            projects: [
              {
                project: {
                  name: 'test-project',
                  namespaceWithPath: 'test/project',
                  webUrl: 'https://gitlab.com/test/project',
                },
                account: {
                  id: 'test-user',
                  username: 'test-user',
                  restId: 42,
                  instanceUrl: 'https://gitlab.com',
                },
                pointer: {
                  urlEntry: {
                    url: 'https://gitlab.com/test/project.git',
                    type: 'both',
                  },
                  remote: {
                    name: 'origin',
                    urls: [
                      {
                        url: 'https://gitlab.com/test/project.git',
                        type: 'both',
                      },
                    ],
                  },
                  repository: {
                    rootFsPath: '/path/to/repo',
                    folderName: 'test-repo',
                    remotes: [
                      {
                        name: 'origin',
                        urls: [
                          {
                            url: 'https://gitlab.com/test/project.git',
                            type: 'both',
                          },
                        ],
                      },
                    ],
                  },
                },
                initializationType: 'detected',
              },
            ],
            selectedProject: {
              project: {
                name: 'test-project',
                namespaceWithPath: 'test/project',
                webUrl: 'https://gitlab.com/test/project',
              },
              account: {
                id: 'test-user',
                username: 'test-user',
                restId: 42,
                instanceUrl: 'https://gitlab.com',
              },
              pointer: {
                urlEntry: {
                  url: 'https://gitlab.com/test/project.git',
                  type: 'both',
                },
                remote: {
                  name: 'origin',
                  urls: [
                    {
                      url: 'https://gitlab.com/test/project.git',
                      type: 'both',
                    },
                  ],
                },
                repository: {
                  rootFsPath: '/path/to/repo',
                  folderName: 'test-repo',
                  remotes: [
                    {
                      name: 'origin',
                      urls: [
                        {
                          url: 'https://gitlab.com/test/project.git',
                          type: 'both',
                        },
                      ],
                    },
                  ],
                },
              },
              initializationType: 'detected',
            },
          },
        ],
      });

      jest.mocked(mockRepositoryProvider.getRepositories).mockReturnValue(mockResponse);

      const result = controller.getRepositories();

      expect(result).toEqual(mockResponse);
      expect(mockRepositoryProvider.getRepositories).toHaveBeenCalledTimes(1);
    });
  });

  describe('endpoints', () => {
    it('should provide endpoints from the controller', () => {
      const endpoints = controller.getEndpoints();

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].methodName).toBe('$/gitlab/getRepositories');
      expect(endpoints[0].type).toBe('request');
    });
  });
});
