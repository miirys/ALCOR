import { WorkflowRunner, WorkflowEvent } from '@gitlab-lsp/workflow-api';
import { Connection } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import { FeatureFlagService } from '@gitlab-org/core';
import { DefaultWorkflowHandler, WORKFLOW_MESSAGE_NOTIFICATION } from './workflow_handler';
import * as completionFilters from './suggestion/suggestion_filter';
import { generateUniqueTrackingId } from './tracking/code_suggestions/utils';

jest.mock('./suggestion/suggestions_cache');
jest.mock('./suggestion/suggestion_filter');
jest.mock('./tree_sitter/intent_resolver', () => ({
  getIntent: jest.fn(),
}));

jest.useFakeTimers();
const TRACKING_ID = 'unique tracking id';
jest.mock('./suggestion/direct_connection_client');
jest.mock('./tracking/code_suggestions/utils');

jest.mocked(generateUniqueTrackingId).mockReturnValue(TRACKING_ID);

describe('WorkflowHandler', () => {
  let workflowHandler: DefaultWorkflowHandler;

  const featureFlagService = createFakePartial<FeatureFlagService>({
    isInstanceFlagEnabled: jest.fn(),
    isClientFlagEnabled: jest.fn(),
    updateInstanceFeatureFlags: jest.fn(),
  });

  let workflowAPI = createFakePartial<WorkflowRunner>({
    runWorkflow: jest.fn(),
    sendEvent: jest.fn(),
  });

  beforeEach(() => {
    jest
      .mocked(completionFilters.shouldRejectCompletionWithSelectedCompletionTextMismatch)
      .mockReturnValue(false);
  });

  describe('startWorkflowNotificationHandler', () => {
    const runWorkflow = jest.fn();
    workflowAPI = createFakePartial<WorkflowRunner>({
      runWorkflow,
    });

    let sendNotification: jest.Mock;

    beforeEach(() => {
      sendNotification = jest.fn();
      workflowHandler = new DefaultWorkflowHandler(
        createFakePartial<Connection>({ sendNotification }),
        featureFlagService,
        workflowAPI,
      );
    });

    describe('when the feature flag is not enabled', () => {
      beforeEach(() => {
        featureFlagService.isClientFlagEnabled = jest.fn().mockReturnValue(false);
      });

      it('does not call run workflow on the api', async () => {
        await workflowHandler.startWorkflowNotificationHandler({
          goal: 'goal',
          metadata: {},
          additionalContext: [],
        });
        expect(workflowAPI.runWorkflow).not.toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(WORKFLOW_MESSAGE_NOTIFICATION, {
          message: 'The GitLab Duo Agent Platform feature is not enabled',
          type: 'error',
        });
      });
    });

    describe('when the feature flag is enabled', () => {
      beforeEach(() => {
        featureFlagService.isClientFlagEnabled = jest.fn().mockReturnValue(true);
      });

      it('calls run workflow on the api', async () => {
        await workflowHandler.startWorkflowNotificationHandler({
          goal: 'goal',
          metadata: {},
          additionalContext: [],
        });
        expect(workflowAPI.runWorkflow).toHaveBeenCalled();
        expect(sendNotification).not.toHaveBeenCalled();
      });

      it('sends a notification when an error occurs', async () => {
        runWorkflow.mockImplementation(() => {
          throw new Error('test');
        });

        await workflowHandler.startWorkflowNotificationHandler({
          goal: 'goal',
          metadata: {},
          additionalContext: [],
        });
        expect(workflowAPI.runWorkflow).toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(WORKFLOW_MESSAGE_NOTIFICATION, {
          message: 'Error occurred while running workflow Error: test',
          type: 'error',
        });
      });
    });
  });

  describe('sendWorkflowEventHandler', () => {
    const sendEvent = jest.fn();
    const workflowAPIMock = createFakePartial<WorkflowRunner>({
      sendEvent,
    });

    let sendNotification: jest.Mock;

    beforeEach(() => {
      sendNotification = jest.fn();
      workflowHandler = new DefaultWorkflowHandler(
        createFakePartial<Connection>({ sendNotification }),
        featureFlagService,
        workflowAPIMock,
      );
    });

    describe('when the feature flag is not enabled', () => {
      beforeEach(() => {
        featureFlagService.isClientFlagEnabled = jest.fn().mockReturnValue(false);
      });

      it('does not call run workflow on the api', async () => {
        await workflowHandler.sendWorkflowEventHandler({
          workflowID: '1',
          eventType: WorkflowEvent.RESUME,
        });
        expect(workflowAPIMock.sendEvent).not.toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(WORKFLOW_MESSAGE_NOTIFICATION, {
          message: 'The GitLab Duo Agent Platform feature is not enabled',
          type: 'error',
        });
      });
    });

    describe('when the feature flag is enabled', () => {
      beforeEach(() => {
        featureFlagService.isClientFlagEnabled = jest.fn().mockReturnValue(true);
      });

      it('calls send event on the api', async () => {
        await workflowHandler.sendWorkflowEventHandler({
          workflowID: '1',
          eventType: WorkflowEvent.RESUME,
        });
        expect(workflowAPIMock.sendEvent).toHaveBeenCalled();
        expect(sendNotification).not.toHaveBeenCalled();
      });

      it('sends a notification when an error occurs', async () => {
        sendEvent.mockImplementation(() => {
          throw new Error('test');
        });

        await workflowHandler.sendWorkflowEventHandler({
          workflowID: '1',
          eventType: WorkflowEvent.RESUME,
        });
        expect(workflowAPIMock.sendEvent).toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(WORKFLOW_MESSAGE_NOTIFICATION, {
          message: 'Error occurred while sending event Error: test',
          type: 'error',
        });
      });
    });
  });
});
