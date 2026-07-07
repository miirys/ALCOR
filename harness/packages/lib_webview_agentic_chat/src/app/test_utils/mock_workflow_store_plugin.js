import { setWorkflowStoreEvents } from '../stores/plugins/workflow_store_events_plugin.ts';

export const mockMessageBusBridge = {
  setResponseListener: jest.fn(),
  sendRequest: jest.fn(),
  sendNotification: jest.fn(),
  sendGraphqlRequest: jest.fn(),
  logToOutputChannel: jest.fn(),
};

export const mockWorkflowStoreEvents = setWorkflowStoreEvents(mockMessageBusBridge);
