import { setActivePinia, createPinia } from 'pinia';
import {
  GET_USER_WORKFLOWS,
  DELETE_DUO_WORKFLOWS_WORKFLOW,
  AI_CATALOG_VERSION_ID_FRAGMENT,
  WorkflowFilter,
  WorkflowType,
} from '@gitlab-lsp/workflow-api';

import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useHistoryStore } from './history';
import { useHealthCheckStore } from './health_check';
import { paginationPayload, workflowsData, workflowsPayload } from './mock_data';
import { useMainStore } from './main';

describe('History Store', () => {
  let historyStore;
  let healthStore;
  let mainStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    mainStore = useMainStore();
    historyStore = useHistoryStore();
    healthStore = useHealthCheckStore();

    mainStore.projectId = 'project/::5';
    mainStore.namespaceId = 'namespace/::2';
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  describe('getRecentWorkflows', () => {
    it('sets loading state and sends request to get recent workflows', () => {
      historyStore.getRecentWorkflows('project/path');
      expect(historyStore.isLoadingRecentWorkflows).toBe(true);
      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        eventName: 'setRecentWorkflows',
        variables: { type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS, first: 5 },
        query: GET_USER_WORKFLOWS,
        fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
      });
    });

    describe('when mode is chat-mode', () => {
      beforeEach(() => {
        mainStore.mode = 'chat-mode';
      });

      it('fetches chat type workflows', () => {
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'setRecentWorkflows',
          variables: { type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS, first: 5 },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });

      it('defaults to chat type when mode is not explicitly set', () => {
        // mainStore.mode defaults to CHAT_MODE
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'setRecentWorkflows',
          variables: { type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS, first: 5 },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });
    });

    describe('when mode is flow-mode', () => {
      beforeEach(() => {
        mainStore.mode = 'flow-mode';
      });

      it('fetches software_development type workflows', () => {
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'setRecentWorkflows',
          variables: { type: WorkflowType.SOFTWARE_DEVELOPMENT, first: 5 },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });
    });

    describe('when mode changes', () => {
      it('updates type from chat to software_development', () => {
        mainStore.mode = 'chat-mode';
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS }),
          }),
        );

        mockMessageBusBridge.sendGraphqlRequest.mockClear();

        mainStore.mode = 'flow-mode';
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowType.SOFTWARE_DEVELOPMENT }),
          }),
        );
      });

      it('updates type from software_development to chat', () => {
        mainStore.mode = 'flow-mode';
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowType.SOFTWARE_DEVELOPMENT }),
          }),
        );

        mockMessageBusBridge.sendGraphqlRequest.mockClear();

        mainStore.mode = 'chat-mode';
        historyStore.getRecentWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS }),
          }),
        );
      });
    });
  });

  describe('setRecentWorkflows', () => {
    beforeEach(() => {
      jest.spyOn(historyStore, 'validateWorkflows');
      historyStore.setRecentWorkflowsLoading(true);
      historyStore.setRecentWorkflows(workflowsPayload);
    });

    it('updates recent workflows and stops loading', () => {
      expect(historyStore.recentWorkflows).toEqual(workflowsData);
      expect(historyStore.isLoadingRecentWorkflows).toBe(false);
    });

    it('calls validateWorkflows with the workflows', () => {
      expect(historyStore.validateWorkflows).toHaveBeenCalledWith(workflowsData);
    });
  });
  describe('validateWorkflows', () => {
    beforeEach(() => {
      jest.spyOn(healthStore, 'getHealthChecks');
    });
    describe('when workflows are present', () => {
      beforeEach(() => {
        historyStore.unformattedRecentWorkflows = [{ id: 1 }, { id: 2 }];
        historyStore.validateWorkflows(historyStore.recentWorkflows);
      });
      it('does not call getHealthChecks action', () => {
        expect(healthStore.getHealthChecks).not.toHaveBeenCalled();
      });
    });
    describe('when no workflows are present', () => {
      beforeEach(() => {
        mainStore.projectPath = 'test/project';
        historyStore.validateWorkflows(historyStore.recentWorkflows);
      });
      it('calls getHealthChecks action', () => {
        expect(healthStore.getHealthChecks).toHaveBeenCalled();
      });
    });
  });
  describe('getUserWorkflows', () => {
    it('sets loading state and sends request to get workflows', () => {
      historyStore.getUserWorkflows();

      expect(historyStore.areWorkflowsLoading).toBe(true);
      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        eventName: 'updateWorkflows',
        variables: paginationPayload,
        query: GET_USER_WORKFLOWS,
        fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
      });
    });

    describe('when mode is chat-mode', () => {
      beforeEach(() => {
        mainStore.mode = 'chat-mode';
      });

      it('fetches chat type workflows', () => {
        historyStore.getUserWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'updateWorkflows',
          variables: { ...paginationPayload, type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });

      it('defaults to chat type when mode is not explicitly set', () => {
        // mainStore.mode defaults to CHAT_MODE
        historyStore.getUserWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'updateWorkflows',
          variables: paginationPayload,
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });
    });

    describe('when mode is flow-mode', () => {
      beforeEach(() => {
        mainStore.mode = 'flow-mode';
      });

      it('fetches software_development type workflows', () => {
        historyStore.getUserWorkflows();

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'updateWorkflows',
          variables: { ...paginationPayload, type: 'software_development' },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });

      it('maintains correct type with after pagination parameter', () => {
        historyStore.getUserWorkflows({ after: 'endCursor' });

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'updateWorkflows',
          variables: {
            type: 'software_development',
            first: 20,
            last: null,
            after: 'endCursor',
            before: null,
          },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });

      it('maintains correct type with before pagination parameter', () => {
        historyStore.getUserWorkflows({ before: 'startCursor' });

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          eventName: 'updateWorkflows',
          variables: {
            type: 'software_development',
            first: null,
            last: 20,
            before: 'startCursor',
            after: null,
          },
          query: GET_USER_WORKFLOWS,
          fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
        });
      });
    });

    describe('when mode changes', () => {
      it('updates type from chat to software_development', () => {
        mainStore.mode = 'chat-mode';
        historyStore.getUserWorkflows({ after: 'cursor1' });

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS }),
          }),
        );

        mockMessageBusBridge.sendGraphqlRequest.mockClear();

        mainStore.mode = 'flow-mode';
        historyStore.getUserWorkflows({ after: 'cursor2' });

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ type: WorkflowType.SOFTWARE_DEVELOPMENT }),
          }),
        );
      });
    });

    describe('count variable', () => {
      describe('when there is a before value', () => {
        beforeEach(() => {
          historyStore.getUserWorkflows({ before: 'startCursor' });
        });

        it('sets the first argument to 20', () => {
          expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
            eventName: 'updateWorkflows',
            variables: {
              ...paginationPayload,
              first: null,
              last: 20,
              before: 'startCursor',
            },
            query: GET_USER_WORKFLOWS,
            fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
          });
        });
      });

      describe('when there is an after value', () => {
        beforeEach(() => {
          historyStore.getUserWorkflows({ after: 'endCursor' });
        });
        it('sets the last argument to 20', () => {
          expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
            eventName: 'updateWorkflows',
            variables: {
              ...paginationPayload,
              first: 20,
              last: null,
              after: 'endCursor',
            },
            query: GET_USER_WORKFLOWS,
            fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
          });
        });
      });

      describe('when neither start nor end cursor is present', () => {
        beforeEach(() => {
          historyStore.getUserWorkflows();
        });

        it('sets the first argument to 20', () => {
          expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
            eventName: 'updateWorkflows',
            variables: paginationPayload,
            query: GET_USER_WORKFLOWS,
            fragment: AI_CATALOG_VERSION_ID_FRAGMENT,
          });
        });
      });
    });
    describe('setWorkflowsLoading', () => {
      it('sets the loading state of the workflows', () => {
        const isLoading = true;
        historyStore.setWorkflowsLoading(isLoading);
        expect(historyStore.areWorkflowsLoading).toBe(isLoading);
      });
    });
    describe('updateWorkflows', () => {
      describe('when there are workflows', () => {
        it('updates workflows and stops loading', () => {
          const mockWorkflows = {
            duoWorkflowWorkflows: {
              edges: [
                { node: { id: '1', name: 'Workflow 1' } },
                { node: { id: '2', name: 'Workflow 2' } },
              ],
            },
          };

          historyStore.updateWorkflows(mockWorkflows);

          expect(historyStore.workflows).toEqual([
            { id: '1', name: 'Workflow 1' },
            { id: '2', name: 'Workflow 2' },
          ]);
          expect(historyStore.areWorkflowsLoading).toBe(false);
        });
      });

      describe('when there are no workflows', () => {
        it('updates workflows to an empty array and stops loading', () => {
          const emptyWorkflows = [];
          historyStore.updateWorkflows(emptyWorkflows);

          expect(historyStore.workflows).toEqual([]);
          expect(historyStore.areWorkflowsLoading).toBe(false);
        });
      });
    });

    describe('clearRemoveError', () => {
      it('clears any existing workflow erros', () => {
        historyStore.removeError = 'foo';
        historyStore.clearRemoveError();
        expect(historyStore.workflowErrors).toBe('');
      });
    });

    describe('removeWorkflow', () => {
      const workflowId = 'gid://gitlab/Ai::DuoWorkflows::Workflow/123';

      it('sends GraphQL request to delete workflow', () => {
        historyStore.removeWorkflow(workflowId);

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
          query: DELETE_DUO_WORKFLOWS_WORKFLOW,
          variables: {
            input: {
              workflowId,
            },
          },
          eventName: 'removeWorkflowResult',
        });
      });
      it('does not send GraphQl request if no workflowId is passed', () => {
        historyStore.removeWorkflow();
        expect(mockMessageBusBridge.sendGraphqlRequest).not.toHaveBeenCalled();
      });
      it('sets an error when failed to delete workflow', () => {
        const errorMessage = 'Failed to delete workflow';
        jest.mocked(mockMessageBusBridge.sendGraphqlRequest).mockImplementation(() => {
          throw new Error(errorMessage);
        });
        historyStore.removeWorkflow(workflowId);

        expect(historyStore.workflowErrors).toBe(errorMessage);
      });
    });

    describe('onRemoveWorkflowResult', () => {
      beforeEach(() => {
        jest.spyOn(historyStore, 'getUserWorkflows');
        jest.spyOn(historyStore, 'getRecentWorkflows');
        mainStore.projectPath = 'test/project';
      });

      it('refreshes workflows when removal is successful', () => {
        const successResponse = {
          deleteDuoWorkflowsWorkflow: {
            success: true,
            errors: [],
          },
        };

        historyStore.onRemoveWorkflowResult(successResponse);

        expect(historyStore.getUserWorkflows).toHaveBeenCalled();
        expect(historyStore.getRecentWorkflows).toHaveBeenCalled();
      });

      it('logs errors when removal fails', () => {
        const errorResponse = {
          deleteDuoWorkflowsWorkflow: {
            success: false,
            errors: ['Workflow not found', 'Permission denied'],
          },
        };

        historyStore.onRemoveWorkflowResult(errorResponse);

        expect(historyStore.getUserWorkflows).not.toHaveBeenCalled();
        expect(historyStore.getRecentWorkflows).not.toHaveBeenCalled();
        expect(historyStore.workflowErrors).toBe('Workflow not found; Permission denied');
      });
    });
  });
});
