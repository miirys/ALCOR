import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CLI_INPUT_TYPES } from '../../constants';
import { renderWithProviders } from '../../test/render_helper';
import { OnboardingCard, onboardingCardVisibleForInput } from './OnboardingCard';

const RERENDER_TIMEOUT = 50;

const waitMs = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const renderCard = (onRun = jest.fn<(value: string) => Promise<void>>()) => {
  const result = renderWithProviders(<OnboardingCard onRun={onRun} />);
  return { ...result, onRun };
};

describe('OnboardingCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the greeting, all steps, and the hint', () => {
    const { lastFrame } = renderCard();
    const output = lastFrame();

    expect(output).toContain('Hi!');
    expect(output).toContain('Create an AGENTS.md');
    expect(output).toContain('Connect MCP servers (/mcp)');
    expect(output).toContain('Add a local skill');
    expect(output).toContain('to choose');
  });

  it('focuses the first step initially', () => {
    const { lastFrame } = renderCard();
    expect(lastFrame()).toContain('→ Create an AGENTS.md');
  });

  it('moves focus with the down arrow', async () => {
    const { sendInput, lastFrame } = renderCard();

    sendInput('', { downArrow: true });
    await waitMs(RERENDER_TIMEOUT);

    expect(lastFrame()).toContain('→ Connect MCP servers (/mcp)');
  });

  it('runs the focused step command on Enter', async () => {
    const { sendInput, onRun } = renderCard();

    sendInput('', { downArrow: true }); // move to the MCP step
    await waitMs(RERENDER_TIMEOUT);
    sendInput('', { return: true });
    await waitMs(RERENDER_TIMEOUT);

    expect(onRun).toHaveBeenCalledWith('/mcp');
  });

  it('is a no-op on Enter for steps without a command', async () => {
    const { sendInput, onRun } = renderCard();

    // First step ("Create an AGENTS.md") has no command.
    sendInput('', { return: true });
    await waitMs(RERENDER_TIMEOUT);

    expect(onRun).not.toHaveBeenCalled();
  });

  it('clamps focus at the last step and does not run commandless steps', async () => {
    const { sendInput, lastFrame, onRun } = renderCard();

    sendInput('', { downArrow: true });
    sendInput('', { downArrow: true });
    sendInput('', { downArrow: true }); // past the end — should clamp
    await waitMs(RERENDER_TIMEOUT);

    expect(lastFrame()).toContain('→ Add a local skill');

    sendInput('', { return: true });
    await waitMs(RERENDER_TIMEOUT);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('clamps focus at the first step when pressing up', async () => {
    const { sendInput, lastFrame } = renderCard();

    sendInput('', { upArrow: true });
    await waitMs(RERENDER_TIMEOUT);

    expect(lastFrame()).toContain('→ Create an AGENTS.md');
  });

  it('shows no focus marker when inactive (user typing)', () => {
    const { lastFrame } = renderWithProviders(
      <OnboardingCard onRun={jest.fn<(value: string) => Promise<void>>()} active={false} />,
    );

    const output = lastFrame();
    expect(output).not.toContain('→');
    expect(output).toContain('○ Create an AGENTS.md');
    expect(output).toContain('○ Connect MCP servers (/mcp)');
    expect(output).toContain('○ Add a local skill');
  });

  it('restores the focus marker on the selected step when it becomes active again', async () => {
    const onRun = jest.fn<(value: string) => Promise<void>>();
    const { sendInput, lastFrame, rerender } = renderWithProviders(
      <OnboardingCard onRun={onRun} active />,
    );

    // Select the MCP step.
    sendInput('', { downArrow: true });
    await waitMs(RERENDER_TIMEOUT);
    expect(lastFrame()).toContain('→ Connect MCP servers (/mcp)');

    // User starts typing — focus marker clears.
    rerender(<OnboardingCard onRun={onRun} active={false} />);
    await waitMs(RERENDER_TIMEOUT);
    expect(lastFrame()).not.toContain('→');

    // Input cleared — the previously selected step regains focus.
    rerender(<OnboardingCard onRun={onRun} active />);
    await waitMs(RERENDER_TIMEOUT);
    expect(lastFrame()).toContain('→ Connect MCP servers (/mcp)');
  });

  describe('onboardingCardVisibleForInput', () => {
    it('keeps the card for the text prompt and the MCP panel', () => {
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.TEXT)).toBe(true);
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.MCP_PANEL)).toBe(true);
    });

    it('hides the card for other slash-command panels and dialogs', () => {
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.HELP_DIALOG)).toBe(false);
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.MODEL_SELECTION)).toBe(false);
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.SKILLS_DIALOG)).toBe(false);
      expect(onboardingCardVisibleForInput(CLI_INPUT_TYPES.CHOICE)).toBe(false);
    });
  });
});
