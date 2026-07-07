import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { AgentEventType, UserEventType } from '../backend/backend';
import type { CliBackend, SessionEvent } from '../backend/backend';
import type { BackendFactory } from '../backend/backend_factory';
import { DefaultSessionManager } from './session_manager';
import type { Session } from './session';
import type { SessionDataService } from './session_data_service';
import type { SessionHistoryPage } from './session_history';

describe('DefaultSessionManager', () => {
  let mockBackend: CliBackend;
  let mockBackendFactory: BackendFactory;
  let mockSessionDataService: SessionDataService;
  let sessionManager: DefaultSessionManager;

  beforeEach(() => {
    mockBackend = createFakePartial<CliBackend>({
      id: 'gitlab',
      initialize: jest.fn<CliBackend['initialize']>().mockResolvedValue({
        sessionId: 'session-1',
      }),
    });

    mockBackendFactory = createFakePartial<BackendFactory>({
      create: jest.fn<BackendFactory['create']>().mockReturnValue(mockBackend),
    });

    mockSessionDataService = createFakePartial<SessionDataService>({
      getSessionHistory: jest.fn<SessionDataService['getSessionHistory']>(),
      getSessionMessages: jest.fn<SessionDataService['getSessionMessages']>().mockResolvedValue([]),
    });

    sessionManager = new DefaultSessionManager(
      new TestLogger(),
      mockBackendFactory,
      mockSessionDataService,
    );
  });

  describe('createSession', () => {
    describe('when creating a new session', () => {
      let session: Awaited<ReturnType<typeof sessionManager.createSession>>;

      beforeEach(async () => {
        // clear mockBackendFactory mock before creating a session
        // eslint-disable-next-line no-restricted-syntax
        jest.clearAllMocks();
        session = await sessionManager.createSession();
      });

      it('creates a backend via the factory', () => {
        expect(mockBackendFactory.create).toHaveBeenCalledTimes(1);
      });

      it('initializes the backend without an existing session ID', () => {
        expect(mockBackend.initialize).toHaveBeenCalledWith(undefined);
      });

      it('returns a session with the backend session ID', () => {
        expect(session.session.sessionId).toBe('session-1');
      });

      it('sets the new session as active', () => {
        expect(sessionManager.getActiveSession()).toBe(session.session);
      });

      it('returns sessionDetails with no rejection reason when backend succeeds', () => {
        expect(session.sessionDetails.sessionRejectionReason).toBeUndefined();
      });
    });

    describe('when backend returns access denied result', () => {
      let session: Awaited<ReturnType<typeof sessionManager.createSession>>;

      beforeEach(async () => {
        mockBackend = createFakePartial<CliBackend>({
          id: 'gitlab',
          initialize: jest.fn<CliBackend['initialize']>().mockResolvedValue({
            sessionId: '',
            sessionRejectionReason: 'Project does not have access',
          }),
        });

        mockBackendFactory = createFakePartial<BackendFactory>({
          create: jest.fn<BackendFactory['create']>().mockReturnValue(mockBackend),
        });

        sessionManager = new DefaultSessionManager(
          new TestLogger(),
          mockBackendFactory,
          mockSessionDataService,
        );
        session = await sessionManager.createSession();
      });

      it('surfaces the rejection reason in sessionDetails', () => {
        expect(session.sessionDetails.sessionRejectionReason).toBe('Project does not have access');
      });

      it('still creates the session (for UI display)', () => {
        expect(session.session).toBeDefined();
        expect(session.session.sessionId).toBe('');
        expect(sessionManager.getActiveSession()).toBe(session.session);
      });
    });

    describe('when providing an existing session ID', () => {
      beforeEach(async () => {
        await sessionManager.createSession('existing-session-id');
      });

      it('initializes the backend with the existing session ID', () => {
        expect(mockBackend.initialize).toHaveBeenCalledWith('existing-session-id');
      });
    });

    describe('when resuming with history rehydration', () => {
      describe('when backend returns valid history', () => {
        const mockEvents: SessionEvent[] = [
          {
            type: UserEventType.UserMessage,
            messageId: 'history-0',
            content: 'Hello',
            timestamp: 1000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'history-1',
            content: 'Hi there',
            timestamp: 2000,
          },
        ];

        beforeEach(async () => {
          jest.mocked(mockBackend.initialize).mockResolvedValue({ sessionId: 'existing-id' });
          jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue(mockEvents);
          await sessionManager.createSession('existing-id');
        });

        it('fetches session messages from the session data service', () => {
          expect(mockSessionDataService.getSessionMessages).toHaveBeenCalledWith('existing-id');
        });

        it('rehydrates the session with elements derived from events', () => {
          const session = sessionManager.getActiveSession();
          expect(session?.elements).toEqual([
            {
              id: 'history-0',
              type: 'message',
              role: 'user',
              content: 'Hello',
              timestamp: 1000,
              isComplete: true,
            },
            {
              id: 'history-1',
              type: 'message',
              role: 'assistant',
              content: 'Hi there',
              timestamp: 2000,
              isComplete: true,
            },
          ]);
        });

        it('emits loading message and then rehydrated history', async () => {
          // Create a fresh manager to register the listener before createSession
          const freshManager = new DefaultSessionManager(
            new TestLogger(),
            mockBackendFactory,
            mockSessionDataService,
          );

          const capturedElementSets: unknown[][] = [];
          const callback = jest.fn<(session: Session) => void>().mockImplementation((session) => {
            capturedElementSets.push([...session.elements]);
          });
          freshManager.onActiveSessionChanged(callback);

          await freshManager.createSession('existing-id');

          expect(callback).toHaveBeenCalledTimes(2);

          // First fire: restoring info message
          expect(capturedElementSets[0]).toEqual([
            expect.objectContaining({ type: 'info', message: 'Restoring session...' }),
          ]);

          // Second fire: rehydrated history
          expect(capturedElementSets[1]).toEqual([
            {
              id: 'history-0',
              type: 'message',
              role: 'user',
              content: 'Hello',
              timestamp: 1000,
              isComplete: true,
            },
            {
              id: 'history-1',
              type: 'message',
              role: 'assistant',
              content: 'Hi there',
              timestamp: 2000,
              isComplete: true,
            },
          ]);
        });
      });

      describe('when resuming with no messages returned', () => {
        beforeEach(async () => {
          jest.mocked(mockBackend.initialize).mockResolvedValue({ sessionId: 'existing-id' });
          jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue([]);
          await sessionManager.createSession('existing-id');
        });

        it('leaves the session elements empty', () => {
          const session = sessionManager.getActiveSession();
          expect(session?.elements).toEqual([]);
        });
      });

      describe('when backend returns empty sessionId on resume (rejection)', () => {
        let session: Awaited<ReturnType<typeof sessionManager.createSession>>;

        beforeEach(async () => {
          jest.mocked(mockBackend.initialize).mockResolvedValue({
            sessionId: '',
            sessionRejectionReason: 'rejected',
          });
          session = await sessionManager.createSession('existing-id');
        });

        it('does not attempt to fetch session messages', () => {
          expect(mockSessionDataService.getSessionMessages).not.toHaveBeenCalled();
        });

        it('returns the rejection reason in sessionDetails', () => {
          expect(session.sessionDetails.sessionRejectionReason).toBe('rejected');
        });
      });
    });

    describe('when resuming with skipHistoryRehydration: true', () => {
      beforeEach(async () => {
        jest.mocked(mockBackend.initialize).mockResolvedValue({ sessionId: 'existing-id' });
        await sessionManager.createSession('existing-id', { skipHistoryRehydration: true });
      });

      it('does not fetch session messages', () => {
        expect(mockSessionDataService.getSessionMessages).not.toHaveBeenCalled();
      });

      it('leaves the session elements empty', () => {
        const session = sessionManager.getActiveSession();
        expect(session?.elements).toEqual([]);
      });
    });

    describe('when createSession is called without existingSessionId', () => {
      beforeEach(async () => {
        await sessionManager.createSession();
      });

      it('does not fetch session messages', () => {
        expect(mockSessionDataService.getSessionMessages).not.toHaveBeenCalled();
      });
    });
  });

  describe('getSessionHistory', () => {
    const mockPage = createFakePartial<SessionHistoryPage>({
      items: [{ id: 'session-1', title: 'Test', status: 'active', lastActivity: '2026-01-01' }],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
    });

    beforeEach(() => {
      jest.mocked(mockSessionDataService.getSessionHistory).mockResolvedValue(mockPage);
    });

    describe('when called with options', () => {
      let result: SessionHistoryPage;

      beforeEach(async () => {
        result = await sessionManager.getSessionHistory({ pageSize: 10, search: 'test' });
      });

      it('delegates to the session data service', () => {
        expect(mockSessionDataService.getSessionHistory).toHaveBeenCalledWith({
          pageSize: 10,
          search: 'test',
        });
      });

      it('returns the result from the session data service', () => {
        expect(result).toBe(mockPage);
      });
    });

    describe('when search query has leading/trailing whitespace', () => {
      it('trims the search query', async () => {
        await sessionManager.getSessionHistory({ search: '  hello  ' });

        expect(mockSessionDataService.getSessionHistory).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'hello' }),
        );
      });
    });

    describe('when search query is only whitespace', () => {
      it('passes undefined for search', async () => {
        await sessionManager.getSessionHistory({ search: '   ' });

        expect(mockSessionDataService.getSessionHistory).toHaveBeenCalledWith(
          expect.objectContaining({ search: undefined }),
        );
      });
    });

    describe('when search query is empty string', () => {
      it('passes undefined for search', async () => {
        await sessionManager.getSessionHistory({ search: '' });

        expect(mockSessionDataService.getSessionHistory).toHaveBeenCalledWith(
          expect.objectContaining({ search: undefined }),
        );
      });
    });
  });

  describe('switchToSession', () => {
    describe('when session data service returns messages', () => {
      const mockEvents: SessionEvent[] = [
        {
          type: UserEventType.UserMessage,
          messageId: 'history-0',
          content: 'Hello',
          timestamp: 1000,
        },
        {
          type: AgentEventType.TextChunk,
          messageId: 'history-1',
          content: 'Hi there',
          timestamp: 2000,
        },
      ];

      beforeEach(async () => {
        jest.mocked(mockBackend.initialize).mockResolvedValue({ sessionId: 'session-42' });
        jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue(mockEvents);
        await sessionManager.switchToSession('session-42');
      });

      it('initializes a new session with the existing session ID', () => {
        expect(mockBackend.initialize).toHaveBeenCalledWith('session-42');
      });

      it('fetches session messages from the session data service', () => {
        expect(mockSessionDataService.getSessionMessages).toHaveBeenCalledWith('session-42');
      });

      it('sets the new session as active', () => {
        expect(sessionManager.getActiveSession()?.sessionId).toBe('session-42');
      });

      it('rehydrates the session with elements derived from events', () => {
        const session = sessionManager.getActiveSession();
        expect(session?.elements).toEqual([
          {
            id: 'history-0',
            type: 'message',
            role: 'user',
            content: 'Hello',
            timestamp: 1000,
            isComplete: true,
          },
          {
            id: 'history-1',
            type: 'message',
            role: 'assistant',
            content: 'Hi there',
            timestamp: 2000,
            isComplete: true,
          },
        ]);
      });
    });

    describe('when session data service returns no messages', () => {
      beforeEach(async () => {
        jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue([]);
        await sessionManager.switchToSession('session-42');
      });

      it('leaves the session elements empty', () => {
        const session = sessionManager.getActiveSession();
        expect(session?.elements).toEqual([]);
      });
    });
  });

  describe('onActiveSessionChanged', () => {
    describe('when a new session is created', () => {
      it('calls the callback with the new session', async () => {
        const callback = jest.fn<(session: Session) => void>();
        sessionManager.onActiveSessionChanged(callback);

        const { session } = await sessionManager.createSession();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(session, expect.any(AbortSignal));
      });
    });

    describe('when the session is switched', () => {
      beforeEach(() => {
        jest.mocked(mockBackend.initialize).mockResolvedValue({ sessionId: 'session-42' });
        jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue([]);
      });

      it('calls the callback with the new session', async () => {
        const callback = jest.fn<(session: Session) => void>();
        sessionManager.onActiveSessionChanged(callback);

        const session = await sessionManager.switchToSession('session-42');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(session, expect.any(AbortSignal));
      });

      describe('when the session has historical messages', () => {
        const mockEvents: SessionEvent[] = [
          {
            type: UserEventType.UserMessage,
            messageId: 'history-0',
            content: 'Hello',
            timestamp: 1000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'history-1',
            content: 'Hi there',
            timestamp: 2000,
          },
        ];

        beforeEach(() => {
          jest.mocked(mockSessionDataService.getSessionMessages).mockResolvedValue(mockEvents);
        });

        it('has rehydrated elements when the callback fires', async () => {
          let capturedElements: readonly unknown[] | undefined;
          const callback = jest.fn<(session: Session) => void>().mockImplementation((session) => {
            capturedElements = [...session.elements];
          });
          sessionManager.onActiveSessionChanged(callback);

          await sessionManager.switchToSession('session-42');

          expect(callback).toHaveBeenCalledTimes(1);
          expect(capturedElements).toEqual([
            {
              id: 'history-0',
              type: 'message',
              role: 'user',
              content: 'Hello',
              timestamp: 1000,
              isComplete: true,
            },
            {
              id: 'history-1',
              type: 'message',
              role: 'assistant',
              content: 'Hi there',
              timestamp: 2000,
              isComplete: true,
            },
          ]);
        });
      });
    });

    describe('when the listener is unsubscribed', () => {
      it('does not call the callback after unsubscription', async () => {
        const callback = jest.fn<(session: Session) => void>();
        const subscription = sessionManager.onActiveSessionChanged(callback);

        subscription.dispose();
        await sessionManager.createSession();

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('when multiple listeners are registered', () => {
      it('calls all listeners', async () => {
        const callback1 = jest.fn<(session: Session) => void>();
        const callback2 = jest.fn<(session: Session) => void>();
        sessionManager.onActiveSessionChanged(callback1);
        sessionManager.onActiveSessionChanged(callback2);

        const { session } = await sessionManager.createSession();

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback1).toHaveBeenCalledWith(session, expect.any(AbortSignal));
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledWith(session, expect.any(AbortSignal));
      });
    });
  });

  describe('getActiveSession', () => {
    describe('when no session exists', () => {
      it('returns undefined', () => {
        expect(sessionManager.getActiveSession()).toBeUndefined();
      });
    });

    describe('when a session has been created', () => {
      let createdSession: Awaited<ReturnType<typeof sessionManager.createSession>>;

      beforeEach(async () => {
        createdSession = await sessionManager.createSession();
      });

      it('returns the active session', () => {
        expect(sessionManager.getActiveSession()).toBe(createdSession.session);
      });
    });
  });
});
