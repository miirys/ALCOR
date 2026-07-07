import { describe, it, expect, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { InputComponent } from './MessageInput';
import { defaultInputState } from './default_state';
import { HelpDialog } from './HelpDialog';
import { AppCallbacks, HelpDialogInputState } from './types';
import { CLI_INPUT_TYPES } from './constants';
import { renderWithProviders } from './test/render_helper';

describe('InputComponent', () => {
  it('should handle key input', () => {
    const callbacks = createFakePartial<AppCallbacks>({
      onTextChange: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const { sendInput, lastFrame } = renderWithProviders(
      <InputComponent input={defaultInputState} callbacks={callbacks} />,
    );
    sendInput('h');

    // Just verify that the component doesn't crash on input
    expect(lastFrame()).toBeTruthy();
  });

  it('should render the help dialog for HELP_DIALOG input type', () => {
    const input: HelpDialogInputState = { inputType: CLI_INPUT_TYPES.HELP_DIALOG };
    const callbacks = createFakePartial<AppCallbacks>({});
    const commandComponentRegistry = new Map([
      [CLI_INPUT_TYPES.HELP_DIALOG, { component: HelpDialog, callbacks: {} }],
    ]);

    const { lastFrame } = renderWithProviders(
      <InputComponent input={input} callbacks={callbacks} />,
      { commandComponentRegistry },
    );

    expect(lastFrame()).toContain('ALCOR');
  });

  it('should handle special keys', () => {
    const input = { ...defaultInputState, lines: ['test'], cursorColumn: 4 };
    const callbacks = createFakePartial<AppCallbacks>({
      onSubmit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    const { sendInput } = renderWithProviders(
      <InputComponent input={input} callbacks={callbacks} />,
    );
    sendInput('', { return: true });

    expect(callbacks.onSubmit).toHaveBeenCalledWith('test');
  });
});
