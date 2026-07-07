import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SessionsCallbacks } from '@gitlab-org/tui';

import type { ControllerApi } from '../../commands/tui/controller_api';
import { SessionsHistoryController } from '../../sessions';
import { DefaultSessionsCommandHandler } from './sessions_command_handler';

describe('SessionsCommandHandler', () => {
  let handler: DefaultSessionsCommandHandler;
  let mockApi: ControllerApi;
  let mockSessionsHistoryController: SessionsHistoryController;

  const mockSessionsCallbacks: SessionsCallbacks = {
    onCancelSessionsSearch: jest.fn(),
    onSessionsSearchQueryChange: jest.fn<SessionsCallbacks['onSessionsSearchQueryChange']>(),
    onSelectSession: jest.fn<SessionsCallbacks['onSelectSession']>(),
    onLoadMoreSessions: jest.fn(),
  };

  beforeEach(() => {
    mockSessionsHistoryController = createFakePartial<SessionsHistoryController>({
      openSearch: jest.fn<SessionsHistoryController['openSearch']>().mockResolvedValue(undefined),
      getCallbacks: jest
        .fn<SessionsHistoryController['getCallbacks']>()
        .mockReturnValue(mockSessionsCallbacks),
    });

    mockApi = createFakePartial<ControllerApi>({});

    handler = new DefaultSessionsCommandHandler(mockSessionsHistoryController);
  });

  describe('command', () => {
    it('has the correct name', () => {
      expect(handler.command.name).toBe('/sessions');
    });

    it('has the correct action', () => {
      expect(handler.command.action).toBe('sessions');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await handler.execute(mockApi);
    });

    it('delegates to sessionsHistoryController.openSearch with the api', () => {
      expect(mockSessionsHistoryController.openSearch).toHaveBeenCalledWith(mockApi);
    });
  });

  describe('getComponent', () => {
    it('returns an entry with the SESSIONS_SEARCH inputType', () => {
      const entry = handler.getComponent!(mockApi);
      expect(entry.inputType).toBe('sessions_search');
    });

    it('delegates to sessionsHistoryController.getCallbacks for callbacks', () => {
      handler.getComponent!(mockApi);
      expect(mockSessionsHistoryController.getCallbacks).toHaveBeenCalledWith(mockApi);
    });

    it('includes the callbacks from the sessions history controller', () => {
      const entry = handler.getComponent!(mockApi);
      expect(entry.callbacks).toEqual(mockSessionsCallbacks);
    });
  });
});
