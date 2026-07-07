import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { DiagnosticsDialogInputState } from './types';
import { CLI_INPUT_TYPES } from './constants';
import { DiagnosticsDialog, type DiagnosticsDialogCallbacks } from './DiagnosticsDialog';
import { renderWithProviders } from './test/render_helper';

const createInputState = (
  overrides: Partial<DiagnosticsDialogInputState> = {},
): DiagnosticsDialogInputState => ({
  inputType: CLI_INPUT_TYPES.DIAGNOSTICS_DIALOG,
  content: 'diagnostics report body',
  ...overrides,
});

const render = (input: DiagnosticsDialogInputState, callbacks: DiagnosticsDialogCallbacks) =>
  renderWithProviders(<DiagnosticsDialog input={input} callbacks={callbacks} />);

describe('DiagnosticsDialog', () => {
  let callbacks: DiagnosticsDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<DiagnosticsDialogCallbacks>({
      onClose: jest.fn(),
    });
  });

  it('renders the report content', () => {
    const { lastFrame } = render(createInputState({ content: 'unique-report-content' }), callbacks);
    expect(lastFrame()).toContain('unique-report-content');
  });

  it('calls onClose when Escape is pressed', () => {
    const { sendInput } = render(createInputState(), callbacks);
    sendInput('', { escape: true });
    expect(callbacks.onClose).toHaveBeenCalled();
  });
});
