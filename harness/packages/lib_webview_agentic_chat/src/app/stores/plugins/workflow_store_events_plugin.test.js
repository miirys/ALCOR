// Tests for workflow_store_events_plugin

import { setActivePinia, createPinia } from 'pinia';
import { mockMessageBusBridge } from '../../test_utils/mock_workflow_store_plugin';
import { setWorkflowStoreEvents } from './workflow_store_events_plugin.ts';

describe('Workflow Store Events Plugin', () => {
  let pinia;
  let mockSetResponseListener;
  let setWorkflowStoreEventsPlugin;

  beforeEach(() => {
    setWorkflowStoreEventsPlugin = setWorkflowStoreEvents(mockMessageBusBridge);
    pinia = createPinia();
    setActivePinia(pinia);
    mockSetResponseListener = mockMessageBusBridge.setResponseListener.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should set response listeners for events defined in the store', () => {
    const mockStore = {
      $id: 'testStore',
      testAction: jest.fn(),
    };

    const mockContext = {
      store: mockStore,
      options: {
        events: {
          testEvent: 'testAction',
        },
      },
    };

    setWorkflowStoreEventsPlugin(mockContext);

    expect(mockSetResponseListener).toHaveBeenCalledWith('testEvent', mockStore.testAction);
  });

  it('should not set any listeners if no events are defined', () => {
    const mockContext = {
      store: {},
      options: {},
    };
    setWorkflowStoreEventsPlugin(mockContext);
    expect(mockSetResponseListener).not.toHaveBeenCalled();
  });

  describe('when there are multiple stores', () => {
    it('should set response listeners for events defined in each store', () => {
      const mockStore1 = {
        $id: 'testStore1',
        testAction1: jest.fn(),
      };

      const mockStore2 = {
        $id: 'testStore2',
        testAction2: jest.fn(),
      };

      const mockContext1 = {
        store: mockStore1,
        options: {
          events: {
            testEvent1: 'testAction1',
          },
        },
      };

      const mockContext2 = {
        store: mockStore2,
        options: {
          events: {
            testEvent2: 'testAction2',
          },
        },
      };

      setWorkflowStoreEventsPlugin(mockContext1);
      expect(mockSetResponseListener).toHaveBeenCalledTimes(1);
      expect(mockSetResponseListener).toHaveBeenCalledWith('testEvent1', mockStore1.testAction1);

      setWorkflowStoreEventsPlugin(mockContext2);
      expect(mockSetResponseListener).toHaveBeenCalledTimes(2);
      expect(mockSetResponseListener).toHaveBeenCalledWith('testEvent2', mockStore2.testAction2);
    });
  });
});
