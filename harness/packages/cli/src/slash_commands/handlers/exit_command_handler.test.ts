import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandAction } from '../slash_command_handler';
import { DefaultExitCommandHandler } from './exit_command_handler';

describe('DefaultExitCommandHandler', () => {
  let handler: DefaultExitCommandHandler;
  let mockApi: ControllerApi;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();

    mockApi = createFakePartial<ControllerApi>({
      exit: jest.fn<ControllerApi['exit']>(),
    });

    handler = new DefaultExitCommandHandler(logger);
  });

  describe('command metadata', () => {
    it('has the correct command name', () => {
      expect(handler.command.name).toBe('/exit');
    });

    it('has a non-empty description', () => {
      expect(handler.command.description).toBeTruthy();
    });

    it('has the correct action', () => {
      expect(handler.command.action).toBe(SlashCommandAction.Exit);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await handler.execute(mockApi);
    });

    it('calls api.exit()', () => {
      expect(mockApi.exit).toHaveBeenCalled();
    });
  });
});
