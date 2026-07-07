import { ProjectInRepository } from '@gitlab-org/core';

export const mockProjectInRepository: ProjectInRepository = {
  project: {
    name: 'test-project',
    namespaceWithPath: 'test-namespace/test-project',
    webUrl: 'https://gitlab.com/test-namespace/test-project',
  },
  account: {
    id: 'gid://gitlab/User/42',
    username: 'test-user',
    restId: 42,
    instanceUrl: 'https://gitlab.com',
  },
  pointer: {
    urlEntry: {
      url: 'https://gitlab.com/test-namespace/test-project.git',
      type: 'both',
    },
    remote: {
      name: 'origin',
      urls: [
        {
          url: 'https://gitlab.com/test-namespace/test-project.git',
          type: 'both',
        },
      ],
    },
    repository: {
      rootFsPath: '/path/to/repository',
      folderName: 'test-repo',
      remotes: [
        {
          name: 'origin',
          urls: [
            {
              url: 'https://gitlab.com/test-namespace/test-project.git',
              type: 'both',
            },
          ],
        },
      ],
    },
  },
  initializationType: 'detected',
};

export const mockNewProjectInRepository = {
  ...mockProjectInRepository,
  pointer: {
    ...mockProjectInRepository.pointer,
    remote: {
      name: 'fork',
      urls: [
        {
          url: 'https://gitlab.com/test-namespace/test-project-fork.git',
          type: 'both' as const,
        },
      ],
    },
    urlEntry: {
      url: 'https://gitlab.com/test-namespace/test-project-fork.git',
      type: 'both' as const,
    },
  },
};
