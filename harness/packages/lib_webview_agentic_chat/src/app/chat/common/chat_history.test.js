import { nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { DuoRecentContent } from '@gitlab/duo-ui';
import { useHistoryStore } from '../stores/history';
import { useMainStore } from '../stores/main';
import { useUsageQuotaStore } from '../stores/usage_quota';
import { mockWorkflowStoreEvents } from '../../test_utils/mock_workflow_store_plugin';
import ChatHistory from './chat_history.vue';
import ChatHistoryList from './chat_history_list.vue';
import UsageQuotaAlert from './components/usage_quota_alert.vue';

describe('ChatHistory', () => {
  let wrapper;
  let historyStore;
  let mainStore;
  let usageQuotaStore;

  const mockAllWorkflows = [
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
  ];

  const createComponent = ({ props = {}, data = {} } = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
    });

    pinia.use(mockWorkflowStoreEvents);

    historyStore = useHistoryStore(pinia);
    historyStore.unformattedWorkflows = mockAllWorkflows;
    historyStore.areWorkflowsLoading = false;

    mainStore = useMainStore(pinia);
    mainStore.projectPath = 'test/project';

    usageQuotaStore = useUsageQuotaStore(pinia);

    wrapper = shallowMount(ChatHistory, {
      pinia,
      propsData: {
        recentItemsOnly: false,
        ...props,
      },
      data: () => {
        return {
          ...data,
        };
      },
      stubs: {
        ChatHistoryList,
        UsageQuotaAlert,
      },
    });

    return wrapper;
  };

  const findChatHistoryList = () => wrapper.findComponent(ChatHistoryList);
  const findDuoRecentContent = () => wrapper.findComponent(DuoRecentContent);
  const findUsageQuotaAlert = () => wrapper.findComponent(UsageQuotaAlert);

  describe('Rendering', () => {
    it('finds the DuoCollapsibleContent component', () => {
      createComponent();
      expect(findDuoRecentContent().exists()).toBe(true);
    });
  });

  describe('complete chat history', () => {
    it('passes down the workflows to ChatHistoryList', async () => {
      createComponent();
      historyStore.setWorkflowsLoading(false);
      await nextTick();
      expect(findChatHistoryList().props('workflowItems')).toEqual(mockAllWorkflows);
    });
    it('correctly passes down the "enableSearch" prop to ChatHistoryList', async () => {
      createComponent();
      historyStore.setWorkflowsLoading(false);
      await nextTick();
      expect(findChatHistoryList().props('enableSearch')).toBe(false);

      createComponent({ props: { enableSearch: true } });
      historyStore.setWorkflowsLoading(false);
      await nextTick();
      expect(findChatHistoryList().props('enableSearch')).toBe(true);
    });
  });

  describe('limited chat history', () => {
    it('passes down only a limited number of workflows to ChatHistoryList', async () => {
      createComponent({
        props: { maxItemsNumber: 1 },
      });
      historyStore.setWorkflowsLoading(false);
      await nextTick();
      expect(findChatHistoryList().props('workflowItems')).toHaveLength(1);
      expect(findChatHistoryList().props('workflowItems')).toEqual([mockAllWorkflows[0]]);
    });
  });

  describe('Project path changes handler', () => {
    it('calls getUserWorkflows immediately on component creation', () => {
      createComponent();
      expect(historyStore.getUserWorkflows).toHaveBeenCalled();
    });

    it('does not call getUserWorkflows when projectPath is null', async () => {
      createComponent();

      mainStore.setProjectPath(null);
      await nextTick();

      expect(historyStore.getUserWorkflows).toHaveBeenCalled();
    });
  });

  describe('Usage quota exceeded alert', () => {
    describe('when usage quota is exceeded', () => {
      beforeEach(async () => {
        createComponent();
        usageQuotaStore.setUsageQuotaExceeded({ exceeded: true });
        await nextTick();
      });

      it('renders UsageQuotaAlert component', () => {
        expect(findUsageQuotaAlert().exists()).toBe(true);
      });

      it('passes usageQuotaExceeded prop as true to UsageQuotaAlert', () => {
        expect(findUsageQuotaAlert().props('usageQuotaExceeded')).toBe(true);
      });
    });

    describe('when usage quota is not exceeded', () => {
      beforeEach(async () => {
        createComponent();
        usageQuotaStore.setUsageQuotaExceeded({ exceeded: false });
        await nextTick();
      });

      it('renders UsageQuotaAlert component', () => {
        expect(findUsageQuotaAlert().exists()).toBe(true);
      });

      it('passes usageQuotaExceeded prop as false to UsageQuotaAlert', () => {
        expect(findUsageQuotaAlert().props('usageQuotaExceeded')).toBe(false);
      });
    });

    describe('showUsageQuotaAlert prop', () => {
      it('renders UsageQuotaAlert when showUsageQuotaAlert is true (default)', async () => {
        createComponent({ props: { showUsageQuotaAlert: true } });
        await nextTick();
        expect(findUsageQuotaAlert().exists()).toBe(true);
      });

      it('does not render UsageQuotaAlert when showUsageQuotaAlert is false', async () => {
        createComponent({ props: { showUsageQuotaAlert: false } });
        await nextTick();
        expect(findUsageQuotaAlert().exists()).toBe(false);
      });

      it('renders UsageQuotaAlert by default when prop is not provided', async () => {
        createComponent();
        await nextTick();
        expect(findUsageQuotaAlert().exists()).toBe(true);
      });
    });
  });
});
