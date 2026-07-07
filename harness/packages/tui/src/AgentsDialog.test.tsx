import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { AgentsDialogInputState } from './types';
import type { AgentsDialogCallbacks } from './AgentsDialog';
import { CLI_INPUT_TYPES } from './constants';
import { AgentsDialog } from './AgentsDialog';
import { renderWithProviders } from './test/render_helper';

// AgentsDialog is a thin configuration of SearchableCommandDialog. The dialog
// behaviour (render, select-on-Enter, close-on-Esc, filtering, empty states) is
// covered once, generically, in SearchableCommandDialog.test.tsx. These tests
// only assert what is unique to this wrapper: that the agent-specific copy is
// wired through.

const agents = [
  { name: 'cli-development', description: 'Build and test the Duo CLI' },
  { name: 'review-mr', description: 'Review a merge request end to end' },
];

const createInputState = (
  overrides: Partial<AgentsDialogInputState> = {},
): AgentsDialogInputState => ({
  inputType: CLI_INPUT_TYPES.AGENTS_DIALOG,
  agents,
  ...overrides,
});

const renderDialog = (input: AgentsDialogInputState, callbacks: AgentsDialogCallbacks) =>
  renderWithProviders(<AgentsDialog input={input} callbacks={callbacks} />);

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('AgentsDialog', () => {
  let callbacks: AgentsDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<AgentsDialogCallbacks>({
      onClose: jest.fn(),
      onSelect: jest.fn(),
    });
  });

  it('wires the agent-specific placeholder copy', () => {
    const { lastFrame } = renderDialog(createInputState(), callbacks);
    expect(lastFrame()).toContain('Type to filter agents...');
  });

  it('wires the agent-specific empty-state copy', () => {
    const { lastFrame } = renderDialog(createInputState({ agents: [] }), callbacks);
    expect(lastFrame()).toContain('No agents are available in this project.');
  });

  it('wires the agent-specific no-matches copy', async () => {
    const { sendInput, lastFrame } = renderDialog(createInputState(), callbacks);
    sendInput('zzz-nonexistent');
    await tick();
    expect(lastFrame()).toContain('No matching agents');
  });
});
