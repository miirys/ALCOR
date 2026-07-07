import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { HelpDialogInputState } from './types';
import type { HelpDialogCallbacks } from './HelpDialog';
import { CLI_INPUT_TYPES } from './constants';
import { HelpDialog } from './HelpDialog';
import { renderWithProviders } from './test/render_helper';

const createInputState = (overrides: Partial<HelpDialogInputState> = {}): HelpDialogInputState => ({
  inputType: CLI_INPUT_TYPES.HELP_DIALOG,
  ...overrides,
});

const renderHelpDialog = (input: HelpDialogInputState, callbacks: HelpDialogCallbacks) => {
  return renderWithProviders(<HelpDialog input={input} callbacks={callbacks} />);
};

describe('HelpDialog', () => {
  let callbacks: HelpDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<HelpDialogCallbacks>({
      onCloseHelp: jest.fn(),
    });
  });

  describe('rendering', () => {
    describe('when slash commands are provided', () => {
      const commands = [
        { name: '/help', description: 'Show available commands and keyboard shortcuts' },
        { name: '/new', description: 'Start a new chat session' },
        { name: '/sessions', description: 'Browse and switch between chat sessions' },
      ];

      it('renders the application name', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        expect(lastFrame()).toContain('ALCOR');
      });

      it('renders the slash commands section heading', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        expect(lastFrame()).toContain('Slash Commands');
      });

      it('renders all provided slash command names', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        const output = lastFrame();
        expect(output).toContain('/help');
        expect(output).toContain('/new');
        expect(output).toContain('/sessions');
      });

      it('renders all provided slash command descriptions', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        const output = lastFrame();
        expect(output).toContain('Show available commands and keyboard shortcuts');
        expect(output).toContain('Start a new chat session');
        expect(output).toContain('Browse and switch between chat sessions');
      });

      it('renders the keyboard shortcuts section', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        const output = lastFrame();
        expect(output).toContain('Shortcuts');
        expect(output).toContain('Ctrl + C');
        expect(output).toContain('Ctrl + R');
      });

      it('renders the documentation link', () => {
        const { lastFrame } = renderHelpDialog(
          createInputState({ slashCommands: commands }),
          callbacks,
        );
        expect(lastFrame()).toContain('docs.gitlab.com');
      });
    });

    describe('when slash commands are not provided', () => {
      it('renders the fallback static command list', () => {
        const { lastFrame } = renderHelpDialog(createInputState(), callbacks);
        const output = lastFrame();
        expect(output).toContain('/help');
        expect(output).toContain('/new');
        expect(output).toContain('Show this help dialog');
      });
    });

    describe('when slash commands is an empty array', () => {
      it('renders the fallback static command list', () => {
        const { lastFrame } = renderHelpDialog(createInputState({ slashCommands: [] }), callbacks);
        const output = lastFrame();
        expect(output).toContain('/help');
        expect(output).toContain('/new');
      });
    });
  });

  describe('keyboard handling', () => {
    describe('when Escape is pressed', () => {
      it('calls onCloseHelp', () => {
        const { sendInput } = renderHelpDialog(createInputState(), callbacks);
        sendInput('', { escape: true });
        expect(callbacks.onCloseHelp).toHaveBeenCalled();
      });
    });
  });
});
