import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES, defaultInputState, defaultAppState } from '@gitlab-org/tui';
import type { AppState } from '@gitlab-org/tui';
import type { ControllerApi, StateMutation } from '../commands/tui/controller_api';
import { DefaultHelpController } from './help_controller';

describe('DefaultHelpController', () => {
  let controller: DefaultHelpController;
  let mockApi: ControllerApi;
  let currentState: AppState;

  const mockCommands = [
    { name: '/help', description: 'Show available commands and keyboard shortcuts' },
    { name: '/new', description: 'Start a new chat session' },
  ];

  beforeEach(() => {
    currentState = { ...defaultAppState };

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest
        .fn<ControllerApi['mutateState']>()
        .mockImplementation((mutation: StateMutation) => {
          currentState = mutation(currentState);
          return currentState;
        }),
      getCommands: jest.fn<ControllerApi['getCommands']>().mockReturnValue(mockCommands),
    });

    controller = new DefaultHelpController();
  });

  describe('openHelp', () => {
    beforeEach(() => {
      controller.openHelp(mockApi);
    });

    it('mutates state to show the help dialog', () => {
      expect(currentState.input.inputType).toBe(CLI_INPUT_TYPES.HELP_DIALOG);
    });

    it('passes the current slash commands to the dialog', () => {
      expect(currentState.input).toMatchObject({
        inputType: CLI_INPUT_TYPES.HELP_DIALOG,
        slashCommands: mockCommands,
      });
    });

    it('fetches commands from the api', () => {
      expect(mockApi.getCommands).toHaveBeenCalled();
    });

    it('preserves existing state fields', () => {
      expect(currentState.elements).toEqual(defaultAppState.elements);
    });
  });

  describe('closeHelp', () => {
    beforeEach(() => {
      controller.openHelp(mockApi);
      controller.closeHelp(mockApi);
    });

    it('resets input to the default text input state', () => {
      expect(currentState.input).toEqual(defaultInputState);
    });

    it('preserves existing state fields', () => {
      expect(currentState.elements).toEqual(defaultAppState.elements);
    });
  });

  describe('getCallbacks', () => {
    it('returns an onCloseHelp callback', () => {
      const callbacks = controller.getCallbacks(mockApi);
      expect(typeof callbacks.onCloseHelp).toBe('function');
    });

    describe('when onCloseHelp is called', () => {
      beforeEach(() => {
        controller.openHelp(mockApi);
        const callbacks = controller.getCallbacks(mockApi);
        callbacks.onCloseHelp();
      });

      it('resets input to the default text input state', () => {
        expect(currentState.input).toEqual(defaultInputState);
      });
    });
  });
});
