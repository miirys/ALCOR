import { setActivePinia, createPinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useRepositoriesStore } from './repositories';
import { useMainStore } from './main';
import { useAgentStore } from './agents';
import { useChatAvailableModelsStore } from './chat_available_models';

describe('useRepositoriesStore', () => {
  let repositoriesStore;
  let mainStore;
  let agentStore;
  let chatAvailableModelsStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);

    repositoriesStore = useRepositoriesStore();
    mainStore = useMainStore();
    agentStore = useAgentStore();
    chatAvailableModelsStore = useChatAvailableModelsStore();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getRepositories', () => {
    it('sends the getRepositories notification', () => {
      repositoriesStore.getRepositories();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('getRepositories');
      expect(repositoriesStore.isLoadingRepositories).toBe(true);
    });
  });

  describe('setRepositories', () => {
    it('sets repositories data', () => {
      const mockData = {
        repositories: [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'test-project',
                namespaceWithPath: 'namespace/test-project',
                remoteName: 'origin',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ],
      };

      repositoriesStore.setRepositories(mockData);

      expect(repositoriesStore.repositories).toEqual(mockData.repositories);
      expect(repositoriesStore.isLoadingRepositories).toBe(false);
    });
  });

  describe('setRepoToProjectPathMap', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo1',
          folderName: 'repo1',
          projects: [
            {
              id: 'gid://gitlab/Project/123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
              namespaceId: 'gid://gitlab/Namespace/456',
              rootNamespaceId: 'gid://gitlab/Namespace/789',
            },
          ],
        },
        {
          type: 'multiple',
          rootFsPath: '/path/to/repo2',
          folderName: 'repo2',
          projects: [
            {
              id: '124',
              name: 'project-2',
              namespaceWithPath: 'namespace/project-2',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
            {
              id: '125',
              name: 'project-3',
              namespaceWithPath: 'namespace/project-3',
              remoteName: 'origin',
              duoAgenticChatAvailable: false,
            },
          ],
        },
      ];
      mainStore.projectPath = null;
    });

    describe('When persisted selection exists', () => {
      it('applies the persisted project selection', () => {
        const repoToProjectPathMap = {
          '/path/to/repo2': 'namespace/project-2',
        };

        repositoriesStore.setRepoToProjectPathMap(repoToProjectPathMap);

        expect(repositoriesStore.selectedProjectPath).toBe('namespace/project-2');
        expect(mainStore.projectPath).toBe('namespace/project-2');
      });

      it('stores the repo to project path map', () => {
        const repoToProjectPathMap = {
          '/path/to/repo1': 'namespace/project-1',
        };

        repositoriesStore.setRepoToProjectPathMap(repoToProjectPathMap);

        expect(repositoriesStore.repoToProjectPathMap).toEqual(repoToProjectPathMap);
      });

      it('fetches agents and models for initially selected project', () => {
        jest.spyOn(agentStore, 'fetchCatalogAgents');
        jest.spyOn(agentStore, 'fetchFoundationalAgents');
        jest.spyOn(chatAvailableModelsStore, 'fetchChatAvailableModels');

        repositoriesStore.setRepoToProjectPathMap({
          '/path/to/repo1': 'namespace/project-1',
        });

        expect(agentStore.fetchCatalogAgents).toHaveBeenCalledWith('gid://gitlab/Project/123');
        expect(agentStore.fetchFoundationalAgents).toHaveBeenCalledWith(
          'gid://gitlab/Project/123',
          'gid://gitlab/Namespace/456',
        );
        expect(chatAvailableModelsStore.fetchChatAvailableModels).toHaveBeenCalledWith(
          'gid://gitlab/Namespace/789',
        );
      });

      it('does not fetch agents if project has no id', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: null,
                name: 'project-1',
                namespaceWithPath: 'namespace/project-1',
                remoteName: 'origin',
                duoAgenticChatAvailable: true,
                namespaceId: null,
                rootNamespaceId: null,
              },
            ],
          },
        ];

        jest.spyOn(agentStore, 'fetchCatalogAgents');
        jest.spyOn(agentStore, 'fetchFoundationalAgents');

        repositoriesStore.setRepoToProjectPathMap({
          '/path/to/repo': 'namespace/project-1',
        });

        expect(agentStore.fetchCatalogAgents).not.toHaveBeenCalled();
        expect(agentStore.fetchFoundationalAgents).not.toHaveBeenCalled();
      });
    });

    describe('When no persisted selection exists', () => {
      it('auto-selects first project with DAP access', () => {
        repositoriesStore.setRepoToProjectPathMap({});

        expect(repositoriesStore.selectedProjectPath).toBe('namespace/project-1');
        expect(mainStore.projectPath).toBe('namespace/project-1');
      });

      it('does not auto-select if a project is already selected', () => {
        repositoriesStore.selectedProjectPath = 'namespace/project-2';

        repositoriesStore.setRepoToProjectPathMap({});

        expect(repositoriesStore.selectedProjectPath).toBe('namespace/project-2');
      });

      it('does not auto-select if main store already has a project', () => {
        mainStore.projectPath = 'namespace/project-2';

        repositoriesStore.setRepoToProjectPathMap({});

        expect(repositoriesStore.selectedProjectPath).toBeNull();
      });

      it('does not auto-select if no projects with DAP access exist', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project-1',
                namespaceWithPath: 'namespace/project-1',
                remoteName: 'origin',
                duoAgenticChatAvailable: false,
              },
            ],
          },
        ];

        repositoriesStore.setRepoToProjectPathMap({});

        expect(repositoriesStore.selectedProjectPath).toBeNull();
      });

      it('does not auto-select if no projects exist', () => {
        repositoriesStore.repositories = [];

        repositoriesStore.setRepoToProjectPathMap({});

        expect(repositoriesStore.selectedProjectPath).toBeNull();
      });
    });
  });

  describe('selectProject', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: 'gid://gitlab/Project/123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
              namespaceId: 'gid://gitlab/Namespace/456',
              rootNamespaceId: 'gid://gitlab/Namespace/789',
            },
          ],
        },
      ];
    });
    it('selects a project and updates main store', () => {
      const projectPath = 'namespace/project-1';

      repositoriesStore.selectProject(projectPath);

      expect(repositoriesStore.selectedProjectPath).toBe(projectPath);
      expect(mainStore.projectPath).toBe(projectPath);
    });

    it('fetches agents and models when selecting a project', () => {
      jest.spyOn(agentStore, 'fetchCatalogAgents');
      jest.spyOn(agentStore, 'fetchFoundationalAgents');
      jest.spyOn(chatAvailableModelsStore, 'fetchChatAvailableModels');

      repositoriesStore.selectProject('namespace/project-1');

      expect(agentStore.fetchCatalogAgents).toHaveBeenCalledWith('gid://gitlab/Project/123');
      expect(agentStore.fetchFoundationalAgents).toHaveBeenCalledWith(
        'gid://gitlab/Project/123',
        'gid://gitlab/Namespace/456',
      );
      expect(chatAvailableModelsStore.fetchChatAvailableModels).toHaveBeenCalledWith(
        'gid://gitlab/Namespace/789',
      );
    });

    it('persists selection with repository path', () => {
      repositoriesStore.selectProject('namespace/project-1');

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'selectProjectForWorkflow',
        {
          repositoryPath: '/path/to/repo',
          projectPath: 'namespace/project-1',
        },
      );
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo1',
          folderName: 'repo1',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
          ],
        },
        {
          type: 'multiple',
          rootFsPath: '/path/to/repo2',
          folderName: 'repo2',
          projects: [
            {
              id: '124',
              name: 'project-2',
              namespaceWithPath: 'namespace/project-2',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
            {
              id: '125',
              name: 'project-3',
              namespaceWithPath: 'namespace/project-3',
              remoteName: 'upstream',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
    });

    describe('allProjects', () => {
      it('returns all projects from all repositories', () => {
        expect(repositoriesStore.allProjects).toHaveLength(3);
        expect(repositoriesStore.allProjects[0].namespaceWithPath).toBe('namespace/project-1');
        expect(repositoriesStore.allProjects[1].namespaceWithPath).toBe('namespace/project-2');
        expect(repositoriesStore.allProjects[2].namespaceWithPath).toBe('namespace/project-3');
      });

      it('filters repositories with no projects', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/empty',
            folderName: 'empty',
            projects: [],
          },
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project-1',
                namespaceWithPath: 'namespace/project-1',
                remoteName: 'origin',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        expect(repositoriesStore.allProjects).toHaveLength(1);
      });
    });

    describe('hasMultipleProjects', () => {
      it('returns true when there are multiple projects', () => {
        expect(repositoriesStore.hasMultipleProjects).toBe(true);
      });

      it('returns false when there is only one project', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project-1',
                namespaceWithPath: 'namespace/project-1',
                remoteName: 'origin',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        expect(repositoriesStore.hasMultipleProjects).toBe(false);
      });
    });

    describe('isDuoEnabledForWorkspaceProjects', () => {
      it('returns true when a project has Duo features enabled', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project',
                namespaceWithPath: 'group/project',
                remoteName: 'origin',
                duoFeaturesEnabled: true,
              },
            ],
          },
        ];

        expect(repositoriesStore.isDuoEnabledForWorkspaceProjects).toBe(true);
      });

      it('returns true when there are no projects (no git repo / no remote)', () => {
        repositoriesStore.repositories = [];

        expect(repositoriesStore.isDuoEnabledForWorkspaceProjects).toBe(true);
      });

      it('returns true when a project has duoFeaturesEnabled absent (undefined)', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project',
                namespaceWithPath: 'group/project',
                remoteName: 'origin',
              },
            ],
          },
        ];

        expect(repositoriesStore.isDuoEnabledForWorkspaceProjects).toBe(true);
      });

      it('returns false for a project with the Duo features toggle off', () => {
        repositoriesStore.repositories = [
          {
            type: 'single',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project',
                namespaceWithPath: 'group/project',
                remoteName: 'origin',
                duoFeaturesEnabled: false,
              },
            ],
          },
        ];

        expect(repositoriesStore.isDuoEnabledForWorkspaceProjects).toBe(false);
      });

      it('returns true when a Duo-enabled project coexists with a Duo-off project', () => {
        repositoriesStore.repositories = [
          {
            type: 'multiple',
            rootFsPath: '/path/to/repo',
            folderName: 'repo',
            projects: [
              {
                id: '123',
                name: 'project-off',
                namespaceWithPath: 'group/off',
                remoteName: 'origin',
                duoFeaturesEnabled: false,
              },
              {
                id: '124',
                name: 'project-on',
                namespaceWithPath: 'group/on',
                remoteName: 'upstream',
                duoFeaturesEnabled: true,
              },
            ],
          },
        ];

        expect(repositoriesStore.isDuoEnabledForWorkspaceProjects).toBe(true);
      });
    });

    describe('currentProject', () => {
      describe('When a project is selected', () => {
        it('returns the selected project', () => {
          repositoriesStore.selectedProjectPath = 'namespace/project-2';

          expect(repositoriesStore.currentProject.namespaceWithPath).toBe('namespace/project-2');
        });
      });

      describe('When no project is selected', () => {
        it('falls back to main store projectPath', () => {
          mainStore.projectPath = 'namespace/project-3';

          expect(repositoriesStore.currentProject.namespaceWithPath).toBe('namespace/project-3');
        });
      });

      describe('When a workflow project is active', () => {
        it('prioritizes workflow project over selected project', () => {
          repositoriesStore.selectedProjectPath = 'namespace/project-2';
          repositoriesStore.workflowProjectPath = 'namespace/project-3';

          expect(repositoriesStore.currentProject.namespaceWithPath).toBe('namespace/project-3');
        });
      });
    });
  });

  describe('setWorkflowProject', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
      repositoriesStore.selectedProjectPath = 'namespace/project-1';
    });

    describe('When setting a workflow project', () => {
      it('sets workflow project path', () => {
        repositoriesStore.setWorkflowProject('namespace/project-1');

        expect(repositoriesStore.workflowProjectPath).toBe('namespace/project-1');
      });

      it('updates main store projectPath', () => {
        repositoriesStore.setWorkflowProject('namespace/project-1');

        expect(mainStore.projectPath).toBe('namespace/project-1');
      });

      it('does not change selectedProjectPath', () => {
        const originalSelection = repositoriesStore.selectedProjectPath;
        repositoriesStore.setWorkflowProject('namespace/project-1');

        expect(repositoriesStore.selectedProjectPath).toBe(originalSelection);
      });
    });
  });

  describe('clearWorkflowProject', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
      repositoriesStore.selectedProjectPath = 'namespace/project-1';
      repositoriesStore.workflowProjectPath = 'namespace/project-1';
    });

    describe('When clearing a workflow project', () => {
      it('clears workflow project path', () => {
        repositoriesStore.clearWorkflowProject();

        expect(repositoriesStore.workflowProjectPath).toBe(null);
      });

      it('restores selected project to main store', () => {
        repositoriesStore.clearWorkflowProject();

        expect(mainStore.projectPath).toBe('namespace/project-1');
      });
    });
  });
});
