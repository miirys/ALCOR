import { nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { GlIcon, GlLink, GlAlert, GlSearchBoxByType } from '@gitlab/ui';
import { DELETE_DUO_WORKFLOWS_WORKFLOW } from '@gitlab-lsp/workflow-api';
import { formatTimeAgo } from '@gitlab-org/core';
import {
  mockWorkflowStoreEvents,
  mockMessageBusBridge,
} from '../../test_utils/mock_workflow_store_plugin';
import { useWorkflowStore } from '../stores/workflow';
import { useHistoryStore } from '../stores/history';
import { useAgentStore } from '../stores/agents';
import { getIDfromGraphqlId } from '../../../common/utils.ts';
import { truncateToNCharacters } from '../utils/text_utils';
import { CHATS_SHOW } from '../routes/constants.ts';
import ChatHistoryList from './chat_history_list.vue';

// Mock the utility functions
jest.mock('../../../common/utils.ts', () => ({
  getIDfromGraphqlId: jest.fn(),
}));

jest.mock('@gitlab-org/core', () => ({
  ...jest.requireActual('@gitlab-org/core'),
  formatTimeAgo: jest.fn(),
}));

jest.mock('../utils/text_utils', () => ({
  truncateToNCharacters: jest.fn(),
}));

describe('ChatHistoryList', () => {
  let wrapper;
  let workflowStore;
  let historyStore;
  let agentStore;
  let routerPush;

  const mockWorkflowItems = [
    {
      id: 'gid://gitlab/DuoWorkflow/1',
      goal: 'Create a Vue component for user authentication',
      updatedAt: '2023-12-01T10:30:00Z',
      aiCatalogItemVersionId: 'agent-version-1',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/2',
      goal: 'Fix the API endpoint for user registration',
      updatedAt: '2023-12-02T14:15:00Z',
      aiCatalogItemVersionId: 'agent-version-2',
    },
    {
      id: 'gid://gitlab/DuoWorkflow/3',
      goal: 'Implement password reset functionality',
      updatedAt: '2023-12-03T09:45:00Z',
      aiCatalogItemVersionId: null,
    },
    {
      id: 'gid://gitlab/DuoWorkflow/4',
      goal: 'A test agent',
      updatedAt: '2023-12-03T09:45:00Z',
      workflowDefinition: 'test_agent/v1',
      aiCatalogItemVersionId: null,
    },
  ];

  const createComponent = (props = {}) => {
    const pinia = createTestingPinia({
      stubActions: false,
    });
    pinia.use(mockWorkflowStoreEvents);
    routerPush = jest.fn();

    wrapper = shallowMount(ChatHistoryList, {
      pinia,
      propsData: {
        workflowItems: mockWorkflowItems,
        ...props,
      },
      stubs: {
        GlIcon,
        GlLink,
      },
      mocks: {
        $router: {
          push: routerPush,
        },
      },
    });

    workflowStore = useWorkflowStore();
    historyStore = useHistoryStore();
    agentStore = useAgentStore();

    return wrapper;
  };

  beforeEach(() => {
    getIDfromGraphqlId.mockImplementation((id) => id.split('/').pop());
    formatTimeAgo.mockImplementation((date, useAbbr) => `formatted-${date}-${useAbbr}`);
    truncateToNCharacters.mockImplementation((text) => text);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const findWorkflowItems = () => wrapper.findAll('li');
  const findWorkflowLinks = () => wrapper.findAllComponents(GlLink);
  const findArchivedWorkflowItems = () => wrapper.findAll('span.navigation-link');
  const findWorkflowGoals = () => wrapper.findAll('.workflow-row-goal');
  const findTimeElements = () => wrapper.findAll('time');
  const findRemoveButtons = () => wrapper.findAll('[data-testid="remove-button"]');
  const findErrorAlert = () => wrapper.findComponent(GlAlert);
  const findSearchBox = () => wrapper.findComponent(GlSearchBoxByType);

  describe('component rendering', () => {
    beforeEach(() => {
      createComponent();
    });

    it('renders the correct number of workflow items', () => {
      expect(findWorkflowItems()).toHaveLength(4);
      expect(findWorkflowLinks()).toHaveLength(4);
    });

    it('does not render when workflowItems is empty', () => {
      createComponent({ workflowItems: [] });
      expect(findWorkflowItems().exists()).toBe(false);
    });

    it('displays request error alert', async () => {
      historyStore.removeError = 'Request failed';
      await nextTick();
      expect(findErrorAlert().exists()).toBe(true);
    });
  });

  describe('workflow items content', () => {
    beforeEach(() => {
      createComponent();
    });

    it('displays the goal for each workflow item', () => {
      const goals = findWorkflowGoals();
      expect(goals).toHaveLength(4);

      expect(goals.at(0).text()).toBe('Create a Vue component for user authentication');
      expect(goals.at(1).text()).toBe('Fix the API endpoint for user registration');
      expect(goals.at(2).text()).toBe('Implement password reset functionality');
    });

    it('displays goal truncated to 100 characters if the goal is too long', () => {
      jest.resetAllMocks();
      createComponent();
      expect(truncateToNCharacters).toHaveBeenCalledTimes(4);
    });

    it('renders time elements with correct datetime attributes', () => {
      const timeElements = findTimeElements();
      expect(timeElements).toHaveLength(4);

      expect(timeElements.at(0).attributes('datetime')).toBe('2023-12-01T10:30:00Z');
      expect(timeElements.at(1).attributes('datetime')).toBe('2023-12-02T14:15:00Z');
      expect(timeElements.at(2).attributes('datetime')).toBe('2023-12-03T09:45:00Z');
    });

    it('displays formatted time using formatTimeAgo utility', () => {
      const timeElements = findTimeElements();
      expect(timeElements.at(0).text()).toBe('formatted-2023-12-01T10:30:00Z-true');
      expect(timeElements.at(1).text()).toBe('formatted-2023-12-02T14:15:00Z-true');
      expect(timeElements.at(2).text()).toBe('formatted-2023-12-03T09:45:00Z-true');
    });
  });

  describe('click event handling', () => {
    beforeEach(() => {
      createComponent();
    });

    it.each`
      i    | workflowItemId                  | expectedId | agentVersionId       | workflowDefinition
      ${0} | ${'gid://gitlab/DuoWorkflow/1'} | ${'123'}   | ${'agent-version-1'} | ${undefined}
      ${1} | ${'gid://gitlab/DuoWorkflow/2'} | ${'234'}   | ${'agent-version-2'} | ${undefined}
      ${2} | ${'gid://gitlab/DuoWorkflow/3'} | ${'345'}   | ${null}              | ${undefined}
      ${3} | ${'gid://gitlab/DuoWorkflow/4'} | ${'789'}   | ${null}              | ${'test_agent/v1'}
    `(
      'sets correct view, workflowId, and custom agent when a workflow link $workflowItemId is clicked',
      ({ i, workflowItemId, expectedId, agentVersionId, workflowDefinition }) => {
        getIDfromGraphqlId.mockReturnValue(expectedId);
        const setAgentByReference = jest.spyOn(agentStore, 'setAgentByReference');

        const link = findWorkflowLinks().at(i);
        link.trigger('click');

        expect(setAgentByReference).toHaveBeenCalledWith(workflowDefinition, agentVersionId);
        expect(routerPush).toHaveBeenCalledWith({
          name: CHATS_SHOW,
          params: { workflowId: expectedId },
        });
        expect(getIDfromGraphqlId).toHaveBeenCalledWith(workflowItemId);
      },
    );
  });

  describe('Filtering search', () => {
    beforeEach(() => {
      createComponent({ enableSearch: true });
    });

    it('renders the search box when "enableSearch" is true', () => {
      expect(findSearchBox().exists()).toBe(true);
    });

    it.each`
      searchTerm          | expectedWorkflows
      ${''}               | ${mockWorkflowItems}
      ${'authentication'} | ${[mockWorkflowItems[0]]}
      ${'registration'}   | ${[mockWorkflowItems[1]]}
      ${'functionality'}  | ${[mockWorkflowItems[2]]}
      ${'user'}           | ${[mockWorkflowItems[0], mockWorkflowItems[1]]}
    `(
      'correctly filters workflow items based on searchTerm="$searchTerm"',
      async ({ searchTerm, expectedWorkflows } = {}) => {
        findSearchBox().vm.$emit('input', searchTerm);
        await nextTick();

        const goals = findWorkflowGoals();
        expect(goals).toHaveLength(expectedWorkflows.length);
        for (let i = 0; i < expectedWorkflows.length; i += 1) {
          expect(goals.at(i).text()).toBe(expectedWorkflows[i].goal);
        }
      },
    );
  });

  describe('remove workflow functionality', () => {
    const removeFirstItem = () =>
      findRemoveButtons().at(0).vm.$emit('click', {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      });
    beforeEach(() => {
      createComponent();
    });
    afterEach(() => {
      jest.resetAllMocks();
    });

    it('renders remove buttons for each workflow item', () => {
      expect(findRemoveButtons()).toHaveLength(4);
    });

    it('sends a GraphQL mutation when remove button is clicked', () => {
      removeFirstItem();
      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        query: DELETE_DUO_WORKFLOWS_WORKFLOW,
        variables: {
          input: {
            workflowId: 'gid://gitlab/DuoWorkflow/1',
          },
        },
        eventName: 'removeWorkflowResult',
      });
    });

    it('handles errors gracefully when GraphQL mutation fails', async () => {
      jest.mocked(mockMessageBusBridge.sendGraphqlRequest).mockImplementation(() => {
        throw new Error('Network error');
      });
      expect(findErrorAlert().exists()).toBe(false);
      removeFirstItem();
      await nextTick();

      expect(findErrorAlert().exists()).toBe(true);
    });

    it('handles errors gracefully when GraphQL mutation does not fail but returns errors', async () => {
      const data = {
        deleteDuoWorkflowsWorkflow: {
          success: '',
          errors: ['First error', 'Second error'],
        },
      };
      expect(findErrorAlert().exists()).toBe(false);
      historyStore.onRemoveWorkflowResult(data);
      removeFirstItem();

      await nextTick();

      expect(findErrorAlert().exists()).toBe(true);
      expect(findErrorAlert().text()).toBe('First error; Second error');
    });
  });

  describe('archived history items', () => {
    const mockWorkflowItemsWithArchived = [
      {
        id: 'gid://gitlab/DuoWorkflow/1',
        goal: 'Create a Vue component for user authentication',
        updatedAt: '2023-12-01T10:30:00Z',
        stalled: true,
        aiCatalogItemVersionId: 'agent-version-1',
      },
      {
        id: 'gid://gitlab/DuoWorkflow/2',
        goal: 'Fix the API endpoint for user registration',
        updatedAt: '2023-12-02T14:15:00Z',
        archived: true,
        aiCatalogItemVersionId: 'agent-version-2',
      },
      {
        id: 'gid://gitlab/DuoWorkflow/3',
        goal: 'Implement password reset functionality',
        updatedAt: '2023-12-03T09:45:00Z',
        aiCatalogItemVersionId: null,
      },
    ];

    beforeEach(() => {
      createComponent({
        workflowItems: mockWorkflowItemsWithArchived,
      });
    });

    it('does not render the archived items as links', () => {
      expect(findWorkflowLinks()).toHaveLength(1);
      expect(findArchivedWorkflowItems()).toHaveLength(2);
    });

    it('does not set any thread id or agent version if an archived item gets clicked', () => {
      const setAgentByReference = jest.spyOn(agentStore, 'setAgentByReference');
      const archivedItem = findArchivedWorkflowItems().at(0);
      archivedItem.trigger('click');

      expect(getIDfromGraphqlId).not.toHaveBeenCalled();
      expect(setAgentByReference).not.toHaveBeenCalled();
      expect(workflowStore.workflowId).toBe('');
    });
  });
});
