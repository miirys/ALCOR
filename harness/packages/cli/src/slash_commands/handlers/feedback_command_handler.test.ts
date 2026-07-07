import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES, FeedbackInput, type FeedbackCallbacks } from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import type { FeedbackController } from '../../feedback';
import { DefaultFeedbackCommandHandler } from './feedback_command_handler';

describe('DefaultFeedbackCommandHandler', () => {
  let handler: DefaultFeedbackCommandHandler;
  let mockFeedbackController: FeedbackController;
  let mockApi: ControllerApi;

  beforeEach(() => {
    mockFeedbackController = createFakePartial<FeedbackController>({
      openFeedback: jest.fn<FeedbackController['openFeedback']>(),
      selectType: jest.fn<FeedbackController['selectType']>(),
      submitDescription: jest.fn<FeedbackController['submitDescription']>(),
      submitTitle: jest.fn<FeedbackController['submitTitle']>(),
      cancelTitle: jest.fn<FeedbackController['cancelTitle']>(),
      confirmLogInclusion: jest.fn<FeedbackController['confirmLogInclusion']>(),
      cancelLogConfirmation: jest.fn<FeedbackController['cancelLogConfirmation']>(),
      previewLogs: jest.fn<FeedbackController['previewLogs']>(),
      cancelFeedback: jest.fn<FeedbackController['cancelFeedback']>(),
      closeFeedbackSuccess: jest.fn<FeedbackController['closeFeedbackSuccess']>(),
      getCallbacks: jest.fn<FeedbackController['getCallbacks']>(),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn<ControllerApi['mutateState']>(),
      showError: jest.fn<ControllerApi['showError']>(),
      showInfo: jest.fn<ControllerApi['showInfo']>(),
      sendPrompt: jest.fn<ControllerApi['sendPrompt']>(),
      ensureInitialized: jest.fn<ControllerApi['ensureInitialized']>(),
      getCommands: jest.fn<ControllerApi['getCommands']>(),
      sendToolApproval: jest.fn<ControllerApi['sendToolApproval']>(),
    });

    handler = new DefaultFeedbackCommandHandler(mockFeedbackController);
  });

  describe('command metadata', () => {
    it('has correct command name', () => {
      expect(handler.command.name).toBe('/feedback');
    });

    it('has correct description', () => {
      expect(handler.command.description).toBe('Submit bug reports or feature requests');
    });
  });

  describe('execute', () => {
    describe('when called', () => {
      beforeEach(async () => {
        await handler.execute(mockApi);
      });

      it('calls feedbackController.openFeedback with the controller api', () => {
        expect(mockFeedbackController.openFeedback).toHaveBeenCalledWith(mockApi);
      });

      it('calls openFeedback exactly once', () => {
        expect(mockFeedbackController.openFeedback).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('getComponent', () => {
    const mockCallbacks: FeedbackCallbacks = {
      onSelectFeedbackType: jest.fn(),
      onSubmitDescription: jest.fn(),
      onSubmitTitle: jest.fn(),
      onCancelTitle: jest.fn(),
      onConfirmLogInclusion: jest.fn(),
      onCancelLogConfirmation: jest.fn(),
      onPreviewLogs: jest.fn(),
      onCancelFeedback: jest.fn(),
      onCloseFeedbackSuccess: jest.fn(),
      onCloseLogPreview: jest.fn(),
    };

    beforeEach(() => {
      jest.mocked(mockFeedbackController.getCallbacks).mockReturnValue(mockCallbacks);
    });

    describe('when called', () => {
      it('returns the correct component entry', () => {
        const entry = handler.getComponent(mockApi);

        expect(entry.inputType).toBe(CLI_INPUT_TYPES.FEEDBACK);
        expect(entry.component).toBe(FeedbackInput);
        expect(entry.callbacks).toBe(mockCallbacks);
      });

      it('calls feedbackController.getCallbacks with the controller api', () => {
        handler.getComponent(mockApi);

        expect(mockFeedbackController.getCallbacks).toHaveBeenCalledWith(mockApi);
      });
    });
  });
});
