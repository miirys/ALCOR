import { Cable } from '@anycable/core';
import { GitLabApiService } from '@gitlab-org/core';
import {
  DuoWorkflowEvent,
  DuoWorkflowStatus,
  GET_WORKFLOW_EVENTS_QUERY,
} from '@gitlab-lsp/workflow-api';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultWorkflowConnection } from './workflow_connection';
import { WorkflowEventsChannel } from './graphql/workflow_events_response_channel';

const createFakeCable = () =>
  createFakePartial<Cable>({
    subscribe: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  });

describe('WorkflowConnection', () => {
  let workflowConnection: DefaultWorkflowConnection;
  let mockLogger: Logger;
  let mockApi: GitLabApiService;
  let mockFetchFromApi: jest.Mock;
  let mockConnectToCable: jest.Mock;
  let cable: Cable;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();

    mockLogger = createFakePartial<Logger>({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    cable = createFakeCable();

    mockUnsubscribe = jest.fn();

    jest.mocked(cable).on.mockImplementation(() => mockUnsubscribe);
    mockFetchFromApi = jest.fn();
    mockConnectToCable = jest.fn().mockResolvedValue(cable);

    mockApi = createFakePartial<GitLabApiService>({
      fetchFromApi: mockFetchFromApi,
      connectToCable: mockConnectToCable,
    });

    workflowConnection = new DefaultWorkflowConnection(mockApi, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const messageCallback = jest.fn();
  const updateWorkflowCallback = jest.fn();
  const workflowId = '123';

  describe('pollForUpdates', () => {
    beforeEach(() => {
      jest.spyOn(global, 'clearInterval');
      jest.spyOn(global, 'setInterval');
    });

    it('sets up polling with 5000ms interval', async () => {
      await workflowConnection.pollForUpdates(messageCallback, workflowId);
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('makes API call with correct query and variables', async () => {
      await workflowConnection.pollForUpdates(messageCallback, workflowId);
      await jest.advanceTimersByTime(5000);

      expect(mockFetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: GET_WORKFLOW_EVENTS_QUERY,
        variables: { workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123' },
      });
    });

    describe('when an event is received', () => {
      it('calls messageCallback when events are received', async () => {
        const mockEvent = { event: 'data' };
        mockFetchFromApi.mockResolvedValueOnce({ duoWorkflowEvents: { nodes: [mockEvent] } });

        expect(messageCallback).not.toHaveBeenCalled();

        await workflowConnection.pollForUpdates(messageCallback, workflowId);
        await jest.advanceTimersByTime(5000);

        expect(messageCallback).toHaveBeenCalledWith(mockEvent);
      });
    });

    describe('when an error is received', () => {
      beforeEach(() => {
        mockFetchFromApi.mockRejectedValue(new Error('oupsies'));
      });

      it('stops polling on error', async () => {
        await workflowConnection.pollForUpdates(messageCallback, workflowId);
        await jest.advanceTimersByTime(5000);
        expect(global.clearInterval).toHaveBeenCalled();
      });
    });
  });

  describe('handleRetryConnection', () => {
    beforeEach(() => {
      jest.spyOn(workflowConnection, 'pollForUpdates');
      jest.spyOn(workflowConnection, 'subscribeToUpdates');
      // Simulate that Connecting to cable kept failling
      mockConnectToCable.mockRejectedValue(new Error('Nope'));
    });

    it('calls the #connect method for each failure', async () => {
      await workflowConnection.handleRetryConnection(messageCallback, workflowId);

      await jest.advanceTimersByTime(3000);
      expect(mockConnectToCable).toHaveBeenCalledTimes(1);
      expect(workflowConnection.pollForUpdates).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[Workflow Connection] Failed to connect to cable'),
        expect.any(Error),
      );

      // Simulate error
      await workflowConnection.handleRetryConnection(messageCallback, workflowId);

      expect(mockConnectToCable).toHaveBeenCalledTimes(2);
      expect(workflowConnection.pollForUpdates).not.toHaveBeenCalled();
    });
  });

  describe('disconnectCable', () => {
    it('disconnects and clears existing cable', async () => {
      // Setup cable first
      await workflowConnection.subscribeToUpdates(jest.fn(), jest.fn(), '123');

      workflowConnection.disconnectCable();

      expect(cable.disconnect).toHaveBeenCalled();
    });

    it('does nothing when no cable exists', () => {
      workflowConnection.disconnectCable();

      expect(cable.disconnect).not.toHaveBeenCalled();
    });

    it('removes listeners', async () => {
      await workflowConnection.subscribeToUpdates(jest.fn(), jest.fn(), '123');

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      workflowConnection.disconnectCable();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('subscribeToUpdates', () => {
    beforeEach(() => {
      jest.spyOn(workflowConnection, 'pollForUpdates');
    });

    it('disconnects existing cable before creating new subscription', async () => {
      await workflowConnection.subscribeToUpdates(
        messageCallback,
        updateWorkflowCallback,
        workflowId,
      );

      expect(cable.disconnect).not.toHaveBeenCalled();

      await workflowConnection.subscribeToUpdates(
        messageCallback,
        updateWorkflowCallback,
        workflowId,
      );

      expect(cable.disconnect).toHaveBeenCalled();
    });

    it('creates channel with correct GraphQL ID', async () => {
      await workflowConnection.subscribeToUpdates(
        messageCallback,
        updateWorkflowCallback,
        workflowId,
      );

      expect(cable.subscribe).toHaveBeenCalledWith(expect.any(WorkflowEventsChannel));
      const channel = jest.mocked(cable.subscribe).mock.calls[0][0];
      expect(channel.identifier).toContain(`gid://gitlab/Ai::DuoWorkflows::Workflow/${workflowId}`);
    });

    it('handles checkpoint events', async () => {
      await workflowConnection.subscribeToUpdates(
        messageCallback,
        updateWorkflowCallback,
        workflowId,
      );

      const channel = jest.mocked(cable.subscribe).mock.calls[0][0];
      const mockEvent: DuoWorkflowEvent = {
        checkpoint: '{"data": "test"}',
        workflowStatus: DuoWorkflowStatus.RUNNING,
        errors: [],
        workflowGoal: 'goal',
      };

      channel.receive({ result: { data: { workflowEventsUpdated: mockEvent } }, more: true });

      expect(messageCallback).toHaveBeenCalledWith(mockEvent);
    });
  });
});
