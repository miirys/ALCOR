import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { UserActionType } from '../../backend/backend';
import { SlashCommandAction } from '../slash_command_handler';
import { DefaultCompactCommandHandler } from './compact_command_handler';

describe('CompactCommandHandler', () => {
  let handler: DefaultCompactCommandHandler;
  let mockApi: ControllerApi;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();

    mockApi = createFakePartial<ControllerApi>({
      sendPrompt: jest.fn<ControllerApi['sendPrompt']>().mockResolvedValue(undefined),
    });

    handler = new DefaultCompactCommandHandler(logger);
  });

  it('has the correct command metadata', () => {
    expect(handler.command.name).toBe('/compact');
    expect(handler.command.action).toBe(SlashCommandAction.Compact);
  });

  describe('execute', () => {
    describe('when called without arguments', () => {
      beforeEach(async () => {
        await handler.execute(mockApi);
      });

      it('forwards the literal /compact command', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: '/compact',
        });
      });
    });

    describe('when called with undefined arguments', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, undefined);
      });

      it('forwards the literal /compact command', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: '/compact',
        });
      });
    });

    describe('when called with an empty arguments array', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, []);
      });

      it('forwards the literal /compact command', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: '/compact',
        });
      });
    });

    describe('when called with a single-word instruction', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, ['summary']);
      });

      it('forwards /compact with the instruction', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: '/compact summary',
        });
      });
    });

    describe('when called with a multi-word instruction', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, ['keep', 'the', 'auth', 'context']);
      });

      it('forwards /compact with the joined instruction', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: '/compact keep the auth context',
        });
      });
    });
  });
});
