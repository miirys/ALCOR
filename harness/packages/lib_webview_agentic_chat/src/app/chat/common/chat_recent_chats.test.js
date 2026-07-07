import { shallowMount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { DuoRecentCollapsible } from '@gitlab/duo-ui';
import { useWorkflowStore } from '../stores/workflow';
import { useMainStore } from '../stores/main';
import { CHATS_INDEX } from '../routes/constants.ts';
import RecentChats from './chat_recent_chats.vue';
import ChatHistory from './chat_history.vue';

describe('RecentChats', () => {
  let wrapper;
  let workflowStore;
  let mainStore;
  let routerPush;

  const mockWorkflows = [
    {
      id: 'gid://gitlab/DuoWorkflow/1',
      goal: 'Create authentication component',
      updatedAt: '2023-12-01T10:30:00Z',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/2',
      goal: 'Fix API endpoint',
      updatedAt: '2023-12-02T14:15:00Z',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/3',
      goal: 'Implement user profile',
      updatedAt: '2023-12-03T16:20:00Z',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/4',
      goal: 'Add validation to forms',
      updatedAt: '2023-12-04T12:10:00Z',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/5',
      goal: 'Optimize database queries',
      updatedAt: '2023-12-05T09:30:00Z',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/6',
      goal: 'Add unit tests',
      updatedAt: '2023-12-06T14:45:00Z',
    },
  ];

  const createComponent = ({ props = {}, initialState = {} } = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
      initialState,
    });

    routerPush = jest.fn();

    workflowStore = useWorkflowStore(pinia);
    mainStore = useMainStore(pinia);

    workflowStore.unformattedWorkflows = initialState?.workflow?.workflows || mockWorkflows;

    wrapper = shallowMount(RecentChats, {
      pinia,
      propsData: {
        ...props,
      },
      mocks: {
        $router: {
          push: routerPush,
        },
      },
    });

    // Set default store state
    mainStore.projectPath = 'test/project';

    return wrapper;
  };

  const findDuoRecentCollapsible = () => wrapper.findComponent(DuoRecentCollapsible);
  const findChatHistory = () => wrapper.findComponent(ChatHistory);

  describe('rendering', () => {
    beforeAll(() => {
      createComponent();
    });

    it('renders DuoRecentCollapsible component', () => {
      expect(findDuoRecentCollapsible().exists()).toBe(true);
    });

    it('renders ChatHistory component', () => {
      expect(findChatHistory().exists()).toBe(true);
    });
  });

  describe('When view-all-clicked is emitted', () => {
    it('switches the currentView to "history"', () => {
      createComponent();
      findDuoRecentCollapsible().vm.$emit('view-all-clicked');

      expect(routerPush).toHaveBeenCalledWith({ name: CHATS_INDEX });
    });
  });

  describe('the chat history wrapper', () => {
    it('is collapsed by default', () => {
      createComponent();

      expect(findDuoRecentCollapsible().props('isExpanded')).toBe(false);
    });
  });
});
