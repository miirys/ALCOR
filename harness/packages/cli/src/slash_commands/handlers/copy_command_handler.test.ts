import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { Message } from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import type { SessionManager } from '../../sessions';
import type { Session } from '../../sessions/session';
import type { ClipboardService } from '../../utils/clipboard';
import { DefaultCopyCommandHandler } from './copy_command_handler';

describe('CopyCommandHandler', () => {
  let handler: DefaultCopyCommandHandler;
  let mockSessionManager: SessionManager;
  let mockClipboard: ClipboardService;
  let mockApi: ControllerApi;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();

    mockSessionManager = createFakePartial<SessionManager>({
      getActiveSession: jest.fn<SessionManager['getActiveSession']>().mockReturnValue(undefined),
    });

    mockClipboard = createFakePartial<ClipboardService>({
      copy: jest.fn<ClipboardService['copy']>(),
    });

    mockApi = createFakePartial<ControllerApi>({
      showError: jest.fn<ControllerApi['showError']>(),
      showInfo: jest.fn<ControllerApi['showInfo']>(),
    });

    handler = new DefaultCopyCommandHandler(mockSessionManager, mockClipboard, logger);
  });

  describe('when there is no active session', () => {
    beforeEach(async () => {
      await handler.execute(mockApi);
    });

    it('shows an error', () => {
      expect(mockApi.showError).toHaveBeenCalledWith('No active session.');
    });

    it('does not copy to clipboard', () => {
      expect(mockClipboard.copy).not.toHaveBeenCalled();
    });
  });

  describe('when there are no assistant messages', () => {
    beforeEach(async () => {
      const mockSession = createFakePartial<Session>({
        elements: [],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

      await handler.execute(mockApi);
    });

    it('shows an error', () => {
      expect(mockApi.showError).toHaveBeenCalledWith('No assistant messages to copy yet.');
    });

    it('does not copy to clipboard', () => {
      expect(mockClipboard.copy).not.toHaveBeenCalled();
    });
  });

  describe('when there are only user messages', () => {
    beforeEach(async () => {
      const mockSession = createFakePartial<Session>({
        elements: [
          createFakePartial<Message>({
            type: 'message',
            role: 'user',
            content: 'Hello',
          }),
        ],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

      await handler.execute(mockApi);
    });

    it('shows an error', () => {
      expect(mockApi.showError).toHaveBeenCalledWith('No assistant messages to copy yet.');
    });
  });

  describe('when there is an assistant message', () => {
    beforeEach(async () => {
      const mockSession = createFakePartial<Session>({
        elements: [
          createFakePartial<Message>({
            type: 'message',
            role: 'user',
            content: 'Hello',
          }),
          createFakePartial<Message>({
            type: 'message',
            role: 'assistant',
            content: 'Hi there! How can I help?',
          }),
        ],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

      await handler.execute(mockApi);
    });

    it('copies the assistant message to clipboard', () => {
      expect(mockClipboard.copy).toHaveBeenCalledWith('Hi there! How can I help?');
    });

    it('does not show an error', () => {
      expect(mockApi.showError).not.toHaveBeenCalled();
    });

    it('shows an info message', () => {
      expect(mockApi.showInfo).toHaveBeenCalledWith('Copied last GitLab Duo message to clipboard.');
    });
  });

  describe('when there are multiple assistant messages', () => {
    beforeEach(async () => {
      const mockSession = createFakePartial<Session>({
        elements: [
          createFakePartial<Message>({
            type: 'message',
            role: 'assistant',
            content: 'First response',
          }),
          createFakePartial<Message>({
            type: 'message',
            role: 'user',
            content: 'Follow up question',
          }),
          createFakePartial<Message>({
            type: 'message',
            role: 'assistant',
            content: 'Second response',
          }),
        ],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);

      await handler.execute(mockApi);
    });

    it('copies the last assistant message', () => {
      expect(mockClipboard.copy).toHaveBeenCalledWith('Second response');
    });
  });

  describe('when clipboard copy fails', () => {
    beforeEach(async () => {
      const mockSession = createFakePartial<Session>({
        elements: [
          createFakePartial<Message>({
            type: 'message',
            role: 'assistant',
            content: 'Some response',
          }),
        ],
      });
      jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession);
      jest.mocked(mockClipboard.copy).mockImplementation(() => {
        throw new Error('No clipboard tool found');
      });

      await handler.execute(mockApi);
    });

    it('shows an error', () => {
      expect(mockApi.showError).toHaveBeenCalledWith(
        'Failed to copy to clipboard. Make sure a clipboard tool is available.',
      );
    });
  });
});
