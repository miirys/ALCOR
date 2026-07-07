import { shallowMount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { DuoNavigationBar } from '@gitlab/duo-ui';
import { GlLink, GlDisclosureDropdown } from '@gitlab/ui';
import { mockWorkflowStoreEvents } from '../test_utils/mock_workflow_store_plugin';
import { useMainStore } from './stores/main';
import { useUserStore } from './stores/user';
import { useHealthCheckStore } from './stores/health_check';
import { useUsageQuotaStore } from './stores/usage_quota';
import { useWorkflowStore } from './stores/workflow';
import { useHistoryStore } from './stores/history';
import { useAgentStore } from './stores/agents';
import { useRepositoriesStore } from './stores/repositories';
import App from './app.vue';
import WorkflowHealthCheck from './common/workflow_health_check.vue';
import AgenticDuoChat from './common/chat.vue';
import { CHATS_SHOW, CHATS_NEW, CHATS_INDEX } from './routes/constants.ts';
import { CHAT_MODE, FLOW_MODE } from './constants.ts';

jest.mock('./utils/render_gfm', () => ({
  __esModule: true,
  default: jest.fn(() => ''),
}));

describe('Agentic Chat App', () => {
  let wrapper;
  let mainStore;
  let userStore;
  let healthStore;
  let usageQuotaStore;
  let workflowStore;
  let historyStore;
  let agentStore;
  let repositoriesStore;

  let notifyAppReadySpy;
  let routerPush;
  let routeParams;

  const createComponent = ({ initialState } = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
      initialState,
    });
    pinia.use(mockWorkflowStoreEvents);
    wrapper = shallowMount(App, {
      pinia,
      stubs: {
        RouterView: {
          template: '<div id="router-view-stub"></div>',
        },
      },
      mocks: {
        $router: {
          push: routerPush,
        },
        $route: {
          get params() {
            return routeParams();
          },
        },
      },
    });

    mainStore = useMainStore(pinia);
    userStore = useUserStore(pinia);
    healthStore = useHealthCheckStore(pinia);
    usageQuotaStore = useUsageQuotaStore(pinia);
    workflowStore = useWorkflowStore(pinia);
    historyStore = useHistoryStore(pinia);
    agentStore = useAgentStore(pinia);
    repositoriesStore = useRepositoriesStore(pinia);

    notifyAppReadySpy = jest.spyOn(mainStore, 'notifyAppReady');
  };

  const findWorkflowHealthCheck = () => wrapper.findComponent(WorkflowHealthCheck);
  const findChat = () => wrapper.findComponent(AgenticDuoChat);
  const findDuoNavigationBar = () => wrapper.findComponent(DuoNavigationBar);
  const findAgentDropdown = () => wrapper.findComponent(GlDisclosureDropdown);
  const findNewChatLink = () => wrapper.findComponent(GlLink);
  const findHistoryLink = () => wrapper.findAllComponents(GlLink).at(1);

  beforeEach(() => {
    routerPush = jest.fn();
    routeParams = jest.fn().mockReturnValue({});
    createComponent();
    repositoriesStore.isLoadingRepositories = false;
  });

  describe('when DuoWorkflow is enabled', () => {
    beforeEach(() => {
      createComponent();
      healthStore.isWorkflowEnabledForProject = true;
      mainStore.isLoadingMinimumTime = false;
      repositoriesStore.isLoadingRepositories = false;
      repositoriesStore.repositories = [
        {
          folderName: 'test-repo',
          projects: [
            {
              id: 'gid://gitlab/Project/1',
              namespaceWithPath: 'namespace/project',
              rootNamespaceId: '123',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
    });

    it('renders the router view component', () => {
      expect(wrapper.find('#router-view-stub').exists()).toBe(true);
    });

    it('does not render the workflow-health-check component', () => {
      expect(findWorkflowHealthCheck().exists()).toBe(false);
    });
  });

  describe('when a project has the Duo features toggle off', () => {
    beforeEach(() => {
      createComponent();
      healthStore.isWorkflowEnabledForProject = true;
      mainStore.isLoadingMinimumTime = false;
      repositoriesStore.isLoadingRepositories = false;
      repositoriesStore.repositories = [
        {
          folderName: 'test-repo',
          projects: [
            {
              id: 'gid://gitlab/Project/1',
              namespaceWithPath: 'group/project',
              rootNamespaceId: '123',
              duoFeaturesEnabled: false,
            },
          ],
        },
      ];
    });

    it('does not render the chat', () => {
      expect(findChat().exists()).toBe(false);
    });

    it('renders the workflow-health-check component', () => {
      expect(findWorkflowHealthCheck().exists()).toBe(true);
    });
  });

  describe('when the only project has Duo features enabled', () => {
    beforeEach(() => {
      createComponent();
      healthStore.isWorkflowEnabledForProject = true;
      mainStore.isLoadingMinimumTime = false;
      repositoriesStore.isLoadingRepositories = false;
      repositoriesStore.repositories = [
        {
          folderName: 'test-repo',
          projects: [
            {
              id: 'gid://gitlab/Project/1',
              namespaceWithPath: 'user/project',
              rootNamespaceId: '123',
              duoFeaturesEnabled: true,
            },
          ],
        },
      ];
    });

    it('does not render the workflow-health-check component', () => {
      expect(findWorkflowHealthCheck().exists()).toBe(false);
    });
  });

  describe('appReady notification', () => {
    it('should send the appReady notification', () => {
      expect(notifyAppReadySpy).toHaveBeenCalled();
    });
  });

  describe('minimum load time', () => {
    it('should enable minimum load time', () => {
      expect(mainStore.enableMinimumLoadTime).toHaveBeenCalled();
    });
  });

  describe('user workflows', () => {
    it('fetches user workflows when component is created', () => {
      expect(historyStore.getUserWorkflows).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    // Renders the loading state if minimum load time is still loading
    beforeEach(() => {
      createComponent();
      mainStore.isLoadingMinimumTime = true;
    });

    it('renders loading icon when minimum load time is still loading', () => {
      const loadingIcon = wrapper.findComponent({ name: 'GlLoadingIcon' });
      expect(loadingIcon.exists()).toBe(true);
    });

    it('does not render workflow-health-check or chat when loading', () => {
      expect(findWorkflowHealthCheck().exists()).toBe(false);
      expect(findChat().exists()).toBe(false);
    });

    it('does not render chat when loading', () => {
      expect(findChat().exists()).toBe(false);
    });
  });

  describe('project path', () => {
    it('fetches repositories and namespace path when component is created', () => {
      expect(repositoriesStore.getRepositories).toHaveBeenCalled();
      expect(mainStore.getNamespacePath).toHaveBeenCalled();
    });
  });

  describe('user info', () => {
    it('fetches user information when component is created', () => {
      expect(userStore.getUserInfo).toHaveBeenCalled();
    });
  });

  describe('usage quota check', () => {
    describe('when rootNamespaceId changes', () => {
      it('checks usage quota when switching to a project with a different rootNamespaceId', async () => {
        createComponent();

        // Initially, checkUsageQuota should not have been called
        expect(usageQuotaStore.checkUsageQuota).not.toHaveBeenCalled();

        // Simulate repositories being loaded
        repositoriesStore.repositories = [
          {
            folderName: 'test-repo',
            projects: [
              {
                id: 'gid://gitlab/Project/1',
                namespaceWithPath: 'namespace/project1',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
              {
                id: 'gid://gitlab/Project/2',
                namespaceWithPath: 'namespace/project2',
                rootNamespaceId: '456',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        // Set the selected project path to trigger currentProject getter
        repositoriesStore.selectedProjectPath = 'namespace/project1';

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // Now checkUsageQuota should have been called
        expect(usageQuotaStore.checkUsageQuota).toHaveBeenCalled();
      });

      it('does not check usage quota when switching to a project with the same rootNamespaceId', async () => {
        createComponent();

        // Simulate repositories being loaded
        repositoriesStore.repositories = [
          {
            folderName: 'test-repo',
            projects: [
              {
                id: 'gid://gitlab/Project/1',
                namespaceWithPath: 'namespace/project1',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
              {
                id: 'gid://gitlab/Project/2',
                namespaceWithPath: 'namespace/project2',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        // Set the selected project path to trigger currentProject getter
        repositoriesStore.selectedProjectPath = 'namespace/project1';

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // Reset the spy to clear the initial call
        usageQuotaStore.checkUsageQuota.mockClear();

        // Switch to another project with the same rootNamespaceId
        repositoriesStore.selectedProjectPath = 'namespace/project2';

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // checkUsageQuota should not have been called because rootNamespaceId is the same
        expect(usageQuotaStore.checkUsageQuota).not.toHaveBeenCalled();
      });
    });

    describe('when flowDefinition changes', () => {
      beforeEach(() => {
        // Reset workflowDefinition to default before each test
        agentStore.workflowDefinition = '';
      });

      it('does not check usage quota when workflow definition stays the same', async () => {
        createComponent();

        // Simulate repositories being loaded with a project
        repositoriesStore.repositories = [
          {
            folderName: 'test-repo',
            projects: [
              {
                id: 'gid://gitlab/Project/1',
                namespaceWithPath: 'namespace/project1',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];
        repositoriesStore.selectedProjectPath = 'namespace/project1';

        // Set initial workflow definition
        agentStore.workflowDefinition = 'chat';

        // Wait for initial watcher to trigger
        await wrapper.vm.$nextTick();

        // Reset the spy to clear the initial call
        usageQuotaStore.checkUsageQuota.mockClear();

        // Set the same workflow definition again
        agentStore.workflowDefinition = 'chat';

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // checkUsageQuota should not have been called because flowDefinition didn't change
        expect(usageQuotaStore.checkUsageQuota).not.toHaveBeenCalled();
      });
    });

    describe('when no project is selected', () => {
      it('does not check usage quota if no project is selected', async () => {
        createComponent();

        // Set repositories but don't select a project
        repositoriesStore.repositories = [
          {
            folderName: 'test-repo',
            projects: [
              {
                id: 'gid://gitlab/Project/1',
                namespaceWithPath: 'namespace/project',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // checkUsageQuota should not have been called because no project is selected
        expect(usageQuotaStore.checkUsageQuota).not.toHaveBeenCalled();
      });
    });

    describe('when workflow project is set', () => {
      it('checks usage quota when workflow project is set with a different rootNamespaceId', async () => {
        createComponent();

        // Initially, checkUsageQuota should not have been called
        expect(usageQuotaStore.checkUsageQuota).not.toHaveBeenCalled();

        // Simulate repositories being loaded
        repositoriesStore.repositories = [
          {
            folderName: 'test-repo',
            projects: [
              {
                id: 'gid://gitlab/Project/1',
                namespaceWithPath: 'namespace/project',
                rootNamespaceId: '123',
                duoAgenticChatAvailable: true,
              },
            ],
          },
        ];

        // Set the workflow project path to trigger currentProject getter
        repositoriesStore.workflowProjectPath = 'namespace/project';

        // Wait for watcher to trigger
        await wrapper.vm.$nextTick();

        // Now checkUsageQuota should have been called
        expect(usageQuotaStore.checkUsageQuota).toHaveBeenCalled();
      });
    });
  });

  describe('workflowId', () => {
    it('pushes to the workflow ID when one is changed', async () => {
      const workflowId = '5';
      await workflowStore.setWorkflowId(workflowId);

      expect(routerPush).toHaveBeenCalledWith({ name: CHATS_SHOW, params: { workflowId } });
    });
    it('does not push to the workflow ID when it has not changed', async () => {
      const workflowId = '5';
      routeParams.mockReturnValue({ workflowId });
      await workflowStore.setWorkflowId(workflowId);

      expect(routerPush).not.toHaveBeenCalledWith({ name: CHATS_SHOW, params: { workflowId } });
    });
  });

  describe('Navigation Bar', () => {
    beforeEach(() => {
      healthStore.isWorkflowEnabledForProject = true;
      mainStore.isLoadingMinimumTime = false;
      mainStore.isLoadingProjectPath = false;
      repositoriesStore.repositories = [
        {
          folderName: 'test-repo',
          projects: [
            {
              id: 'gid://gitlab/Project/1',
              namespaceWithPath: 'namespace/project',
              rootNamespaceId: '123',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
    });

    it('renders navigation bar', () => {
      expect(findDuoNavigationBar().exists()).toBe(true);
    });

    describe('flex wrapping and layout', () => {
      it('applies gl-flex-wrap class to navigation bar', () => {
        const navBar = findDuoNavigationBar();
        expect(navBar.classes()).toContain('gl-flex-wrap');
      });
    });

    describe('custom content filler element', () => {
      it('renders filler element in custom content', () => {
        const filler = wrapper.find('[data-testid="navigation-bar-filler"]');
        expect(filler.exists()).toBe(true);
      });
    });

    describe('dropdown', () => {
      const workflowId = '123';
      const mockDropdownItem = [
        {
          id: 'copy_workflow_id',
          text: `Copy session ID: ${workflowId}`,
        },
      ];

      describe('when there is a workflowId available', () => {
        beforeEach(async () => {
          await workflowStore.setWorkflowId(workflowId);
        });

        it('displays dropdown items', async () => {
          expect(findDuoNavigationBar().props('showDropdown')).toBe(true);
          expect(findDuoNavigationBar().props('dropdownItems')).toEqual(mockDropdownItem);
        });

        it('invokes copyText action when emitting dropdown-item-selected event', async () => {
          await findDuoNavigationBar().vm.$emit('dropdown-item-selected', {
            id: 'copy_workflow_id',
          });

          expect(mainStore.copyText).toHaveBeenCalledWith(workflowId);
        });
      });

      describe('when there is no workflowId available', () => {
        beforeEach(async () => {
          await workflowStore.setWorkflowId(null);
        });

        it('does not display dropdown items', async () => {
          expect(findDuoNavigationBar().props('showDropdown')).toBe(false);
        });
      });
    });

    describe('agent dropdown functionality', () => {
      describe('when there are multiple agents', () => {
        beforeEach(() => {
          mainStore.mode = CHAT_MODE;
          agentStore.catalogAgents = [
            {
              id: 'agent-1',
              name: 'Custom Agent 1',
              description: 'First custom agent',
              pinnedItemVersionId: 'version-1',
            },
            {
              id: 'agent-2',
              name: 'Custom Agent 2',
              description: 'Second custom agent',
              pinnedItemVersionId: 'version-2',
            },
          ];
        });

        it('renders agent dropdown instead of simple new chat link', () => {
          expect(findAgentDropdown().exists()).toBe(true);
          expect(findAgentDropdown().props('toggleText')).toBe('New chat');
          expect(findAgentDropdown().props('items')).toEqual([
            {
              name: 'GitLab Duo Agent',
              text: 'GitLab Duo Agent',
              description: 'Duo is your general development assistant',
              foundational: true,
              id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
              referenceWithVersion: 'chat',
            },
            {
              id: 'agent-1',
              name: 'Custom Agent 1',
              description: 'First custom agent',
              pinnedItemVersionId: 'version-1',
              text: 'Custom Agent 1',
            },
            {
              id: 'agent-2',
              name: 'Custom Agent 2',
              description: 'Second custom agent',
              pinnedItemVersionId: 'version-2',
              text: 'Custom Agent 2',
            },
          ]);
        });

        it('sets agent and navigates to new chat when custom agent is selected', async () => {
          const setAgentVersionSpy = jest.spyOn(agentStore, 'setAgentByReference');
          const customAgent = {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            pinnedItemVersionId: 'version-1',
          };

          await findAgentDropdown().vm.$emit('action', customAgent);

          expect(setAgentVersionSpy).toHaveBeenCalledWith('version-1', '');
          expect(routerPush).toHaveBeenCalledWith(
            expect.objectContaining({
              name: CHATS_NEW,
              query: expect.objectContaining({
                agent: customAgent,
                timestamp: expect.any(Number),
              }),
            }),
          );
        });

        it('clears agent version and navigates to new chat when foundational agent is selected', async () => {
          const setAgentVersionSpy = jest.spyOn(agentStore, 'setAgentByReference');
          const defaultAgent = {
            name: 'GitLab Duo Agent',
            text: 'GitLab Duo Agent',
            description: 'Duo is your general development assistant',
            foundational: true,
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            referenceWithVersion: 'chat',
          };

          await findAgentDropdown().vm.$emit('action', defaultAgent);

          expect(setAgentVersionSpy).toHaveBeenCalledWith('', 'chat');
          expect(routerPush).toHaveBeenCalledWith(
            expect.objectContaining({
              name: CHATS_NEW,
              query: expect.objectContaining({
                agent: defaultAgent,
                timestamp: expect.any(Number),
              }),
            }),
          );
        });
      });

      describe('when there is only one agent (default)', () => {
        beforeEach(() => {
          mainStore.mode = CHAT_MODE;
          agentStore.catalogAgents = [];
        });

        it('renders simple new chat link instead of dropdown', () => {
          expect(findAgentDropdown().exists()).toBe(false);
          expect(findNewChatLink().exists()).toBe(true);
          expect(findNewChatLink().props('to')).toEqual(
            expect.objectContaining({
              name: CHATS_NEW,
              query: expect.objectContaining({
                timestamp: expect.any(Number),
              }),
            }),
          );
        });

        it('renders history link', () => {
          expect(findHistoryLink().exists()).toBe(true);
          expect(findHistoryLink().props('to')).toEqual({ name: CHATS_INDEX });
        });
      });

      describe('when in flow tab mode', () => {
        beforeEach(async () => {
          healthStore.isWorkflowEnabledForProject = true;
          mainStore.isLoadingMinimumTime = false;
          mainStore.mode = FLOW_MODE;
          agentStore.catalogAgents = [
            {
              id: 'agent-1',
              name: 'Custom Agent 1',
              description: 'First custom agent',
              pinnedItemVersionId: 'version-1',
            },
            {
              id: 'agent-2',
              name: 'Custom Agent 2',
              description: 'Second custom agent',
              pinnedItemVersionId: 'version-2',
            },
          ];
          await wrapper.vm.$nextTick();
        });

        it('does not render agent dropdown even with multiple agents', () => {
          expect(findAgentDropdown().exists()).toBe(false);
          expect(findNewChatLink().exists()).toBe(true);
        });
      });
    });
  });

  describe('Workflow project lock clearing', () => {
    beforeEach(() => {
      healthStore.isWorkflowEnabledForProject = true;
      mainStore.isLoadingMinimumTime = false;
      repositoriesStore.isLoadingRepositories = false;
    });

    describe('When navigating to the workflow show route', () => {
      it('does not clear the workflow project lock when viewing the same workflow', async () => {
        const clearWorkflowProjectSpy = jest.spyOn(repositoriesStore, 'clearWorkflowProject');
        const workflowId = 'workflow-123';

        // Simulate route change from show route with same workflow ID
        wrapper.vm.$options.watch.$route.handler.call(
          wrapper.vm,
          {
            name: CHATS_SHOW,
            params: { workflowId },
          },
          {
            name: CHATS_SHOW,
            params: { workflowId },
          },
        );

        expect(clearWorkflowProjectSpy).not.toHaveBeenCalled();
      });

      it('clears the workflow project lock when navigating to a different workflow', async () => {
        const clearWorkflowProjectSpy = jest.spyOn(repositoriesStore, 'clearWorkflowProject');
        const workflowId1 = 'workflow-123';
        const workflowId2 = 'workflow-456';

        // Simulate route change from workflow-123 to workflow-456
        wrapper.vm.$options.watch.$route.handler.call(
          wrapper.vm,
          {
            name: CHATS_SHOW,
            params: { workflowId: workflowId2 },
          },
          {
            name: CHATS_SHOW,
            params: { workflowId: workflowId1 },
          },
        );

        expect(clearWorkflowProjectSpy).toHaveBeenCalled();
      });
    });

    describe('When navigating away from the workflow show route', () => {
      it('clears the workflow project lock when navigating to new chat', async () => {
        const clearWorkflowProjectSpy = jest.spyOn(repositoriesStore, 'clearWorkflowProject');

        // Simulate route change from show route to new chat
        wrapper.vm.$options.watch.$route.handler.call(
          wrapper.vm,
          {
            name: CHATS_NEW,
            params: {},
          },
          {
            name: CHATS_SHOW,
            params: { workflowId: 'workflow-123' },
          },
        );

        expect(clearWorkflowProjectSpy).toHaveBeenCalled();
      });

      it('clears the workflow project lock when navigating to history', async () => {
        const clearWorkflowProjectSpy = jest.spyOn(repositoriesStore, 'clearWorkflowProject');

        // Simulate route change from show route to history
        wrapper.vm.$options.watch.$route.handler.call(
          wrapper.vm,
          {
            name: CHATS_INDEX,
            params: {},
          },
          {
            name: CHATS_SHOW,
            params: { workflowId: 'workflow-123' },
          },
        );

        expect(clearWorkflowProjectSpy).toHaveBeenCalled();
      });

      it('clears the workflow project lock when navigating to any other route', async () => {
        const clearWorkflowProjectSpy = jest.spyOn(repositoriesStore, 'clearWorkflowProject');

        // Simulate route change from show route to a hypothetical new route
        wrapper.vm.$options.watch.$route.handler.call(
          wrapper.vm,
          {
            name: 'SOME_NEW_ROUTE',
            params: {},
          },
          {
            name: CHATS_SHOW,
            params: { workflowId: 'workflow-123' },
          },
        );

        expect(clearWorkflowProjectSpy).toHaveBeenCalled();
      });
    });
  });
});
