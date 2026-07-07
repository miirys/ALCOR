import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ControllerApi } from '../../commands/tui/controller_api';
import type { SessionManager } from '../../sessions';
import type { Session } from '../../sessions/session';
import { DefaultNewSessionCommandHandler } from './new_session_command_handler';

describe('NewSessionCommandHandler', () => {
  let handler: DefaultNewSessionCommandHandler;
  let mockSessionManager: SessionManager;
  let mockApi: ControllerApi;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();

    mockSessionManager = createFakePartial<SessionManager>({
      createSession: jest.fn<SessionManager['createSession']>().mockResolvedValue(undefined!),
      getActiveSession: jest.fn<SessionManager['getActiveSession']>().mockReturnValue(undefined),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn<ControllerApi['mutateState']>(),
      showError: jest.fn<ControllerApi['showError']>(),
      sendPrompt: jest.fn<ControllerApi['sendPrompt']>(),
    });

    handler = new DefaultNewSessionCommandHandler(mockSessionManager, logger);
  });

  describe('execute', () => {
    describe('when creating a new session succeeds', () => {
      beforeEach(async () => {
        await handler.execute(mockApi);
      });

      it('creates a new session via SessionManager', () => {
        expect(mockSessionManager.createSession).toHaveBeenCalled();
      });

      it('does not show an error', () => {
        expect(mockApi.showError).not.toHaveBeenCalled();
      });
    });

    describe('when creating a new session fails', () => {
      const error = new Error('Session creation failed');

      beforeEach(async () => {
        jest.mocked(mockSessionManager.createSession).mockRejectedValue(error);
        await handler.execute(mockApi);
      });

      it('shows an error message to the user', () => {
        expect(mockApi.showError).toHaveBeenCalledWith(
          'Failed to create new session. Please try again.',
        );
      });
    });

    describe('when there is an active loading session', () => {
      let mockActiveSession: Session;

      beforeEach(async () => {
        mockActiveSession = createFakePartial<Session>({
          sessionId: 'active-session-123',
          isLoading: true,
          cancelStream: jest.fn<Session['cancelStream']>(),
        });

        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockActiveSession);

        await handler.execute(mockApi);
      });

      it('cancels the active session stream', () => {
        expect(mockActiveSession.cancelStream).toHaveBeenCalled();
      });

      it('creates a new session', () => {
        expect(mockSessionManager.createSession).toHaveBeenCalled();
      });
    });

    describe('when there is an active non-loading session', () => {
      let mockActiveSession: Session;

      beforeEach(async () => {
        mockActiveSession = createFakePartial<Session>({
          sessionId: 'active-session-123',
          isLoading: false,
          cancelStream: jest.fn<Session['cancelStream']>(),
        });

        jest.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockActiveSession);

        await handler.execute(mockApi);
      });

      it('does not cancel the session stream', () => {
        expect(mockActiveSession.cancelStream).not.toHaveBeenCalled();
      });

      it('creates a new session', () => {
        expect(mockSessionManager.createSession).toHaveBeenCalled();
      });
    });
  });
});
