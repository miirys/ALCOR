import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { HelpController } from '../../help';
import { DefaultHelpCommandHandler } from './help_command_handler';

describe('DefaultHelpCommandHandler', () => {
  let handler: DefaultHelpCommandHandler;
  let mockApi: ControllerApi;
  let mockHelpController: HelpController;

  beforeEach(() => {
    mockApi = createFakePartial<ControllerApi>({});

    mockHelpController = createFakePartial<HelpController>({
      openHelp: jest.fn<HelpController['openHelp']>(),
      getCallbacks: jest.fn<HelpController['getCallbacks']>().mockReturnValue({
        onCloseHelp: jest.fn(),
      }),
    });

    handler = new DefaultHelpCommandHandler(mockHelpController);
  });

  describe('command metadata', () => {
    it('has correct command name', () => {
      expect(handler.command.name).toBe('/help');
    });

    it('has correct description', () => {
      expect(handler.command.description).toBe('Show available commands and keyboard shortcuts');
    });

    it('has correct action', () => {
      expect(handler.command.action).toBe('help');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await handler.execute(mockApi);
    });

    it('delegates to helpController.openHelp with the api', () => {
      expect(mockHelpController.openHelp).toHaveBeenCalledWith(mockApi);
    });
  });

  describe('getComponent', () => {
    it('returns an entry with the HELP_DIALOG inputType', () => {
      const entry = handler.getComponent!(mockApi);
      expect(entry.inputType).toBe('help_dialog');
    });

    it('delegates to helpController.getCallbacks for callbacks', () => {
      handler.getComponent!(mockApi);
      expect(mockHelpController.getCallbacks).toHaveBeenCalledWith(mockApi);
    });

    it('includes the callbacks from the help controller', () => {
      const entry = handler.getComponent!(mockApi);
      expect(typeof entry.callbacks.onCloseHelp).toBe('function');
    });
  });
});
