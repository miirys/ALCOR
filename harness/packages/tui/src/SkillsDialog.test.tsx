import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SkillsDialogInputState } from './types';
import type { SkillsDialogCallbacks } from './SkillsDialog';
import { CLI_INPUT_TYPES } from './constants';
import { SkillsDialog } from './SkillsDialog';
import { renderWithProviders } from './test/render_helper';

const skills = [
  { name: 'cli-development', description: 'Build and test the Duo CLI' },
  { name: 'review-mr', description: 'Review a merge request end to end' },
];

const createInputState = (
  overrides: Partial<SkillsDialogInputState> = {},
): SkillsDialogInputState => ({
  inputType: CLI_INPUT_TYPES.SKILLS_DIALOG,
  skills,
  ...overrides,
});

const renderDialog = (input: SkillsDialogInputState, callbacks: SkillsDialogCallbacks) =>
  renderWithProviders(<SkillsDialog input={input} callbacks={callbacks} />);

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('SkillsDialog', () => {
  let callbacks: SkillsDialogCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<SkillsDialogCallbacks>({
      onClose: jest.fn(),
      onSelect: jest.fn(),
    });
  });

  it('renders all skill names and descriptions', () => {
    const { lastFrame } = renderDialog(createInputState(), callbacks);
    const output = lastFrame();
    expect(output).toContain('cli-development');
    expect(output).toContain('Build and test the Duo CLI');
    expect(output).toContain('review-mr');
  });

  it('runs the highlighted (first) skill on Enter', () => {
    const { sendInput } = renderDialog(createInputState(), callbacks);
    sendInput('', { return: true });
    expect(callbacks.onSelect).toHaveBeenCalledWith('cli-development');
  });

  it('closes on Escape', () => {
    const { sendInput } = renderDialog(createInputState(), callbacks);
    sendInput('', { escape: true });
    expect(callbacks.onClose).toHaveBeenCalled();
  });

  it('filters the list as you type', async () => {
    const { sendInput, lastFrame } = renderDialog(createInputState(), callbacks);
    sendInput('review');
    await tick();
    const output = lastFrame();
    expect(output).toContain('review-mr');
    expect(output).not.toContain('cli-development');
  });

  it('shows the empty state when no skills are available', () => {
    const { lastFrame } = renderDialog(createInputState({ skills: [] }), callbacks);
    expect(lastFrame()).toContain('No skills are available in this project.');
  });
});
