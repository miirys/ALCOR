import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { CLI_INPUT_TYPES } from '../../constants';
import { useInputAction, usePublishInputContext } from '../keymap';
import { ControlsHint } from './ControlsHint';

/**
 * Whether the onboarding card should stay visible for a given input type.
 *
 * The plain text prompt always keeps it; the MCP panel is a deliberate special
 * case (MCP is one of the onboarding steps, so its checklist context stays in
 * view). Every other slash-command panel/dialog (/help, /model, …) hides it.
 */
export const onboardingCardVisibleForInput = (inputType: string): boolean =>
  inputType === CLI_INPUT_TYPES.TEXT || inputType === CLI_INPUT_TYPES.MCP_PANEL;

// Semantic color roles for the onboarding card. Named ANSI colors are used
// (not hardcoded hex) so they adopt the user's terminal palette and stay
// legible across light/dark themes. Mirrors the Figma "Duo CLI" design
// (node 328:827), whose cyan accent maps to the terminal's `cyan`.
const ACCENT = 'cyan'; // heading, focus marker, border
const MUTED = 'gray'; // step descriptions and the hint footer

interface OnboardingStep {
  title: string;
  description: string;
  /**
   * Submitted via `onRun` when this step is focused and Enter is pressed.
   * Steps without a command are still navigable, but Enter is a no-op on them.
   */
  command?: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: 'Create an AGENTS.md',
    description: "Teach Duo your project's conventions & structure",
  },
  {
    title: 'Connect MCP servers (/mcp)',
    description: 'Give Duo access to your tools, data & services',
    command: '/mcp',
  },
  {
    title: 'Add a local skill',
    description: 'Reusable commands Duo can run on demand',
  },
];

interface StepRowProps {
  step: OnboardingStep;
  focused: boolean;
}

const StepRow: React.FC<StepRowProps> = ({ step, focused }) => (
  <Box paddingX={1} gap={1} alignItems="center">
    <Text bold={focused} color={ACCENT}>
      {focused ? '→' : '○'}
    </Text>
    <Box flexDirection="column">
      <Text bold={focused} color={focused ? ACCENT : undefined}>
        {step.title}
      </Text>
      <Text color={MUTED}>{step.description}</Text>
    </Box>
  </Box>
);

export interface OnboardingCardProps {
  /** Runs the focused step's command — typically the chat submit handler. */
  onRun: (value: string) => void | Promise<void>;
  /**
   * Whether the row selection is active. False once the user starts typing a
   * prompt: the focus marker/highlight are cleared so it's clear Enter submits
   * the message, not a step. The selected index is preserved, so clearing the
   * input restores the highlight. Defaults to true.
   */
  active?: boolean;
}

/**
 * Shown on the empty chat screen to walk a new user through first-time setup.
 * Visual layout mirrors the "Duo CLI" onboarding design (node 328:827).
 *
 * Keyboard navigation (↑/↓ to move, Enter to run) is routed through the central
 * keymap rather than a local key handler: while mounted the card publishes
 * `onboardingActive`, which gates the `onboarding.*` bindings so those keys are
 * claimed here only on the empty screen and only until the user starts typing.
 * All steps are navigable; Enter is a no-op on steps that have no command yet.
 */
export const OnboardingCard: React.FC<OnboardingCardProps> = ({ onRun, active = true }) => {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const moveFocus = (direction: 1 | -1) =>
    setFocusedIndex((current) => {
      const next = current + direction;
      return next >= 0 && next < STEPS.length ? next : current;
    });

  usePublishInputContext({ onboardingActive: STEPS.length > 0 });
  useInputAction('onboarding.prev', () => moveFocus(-1));
  useInputAction('onboarding.next', () => moveFocus(1));
  useInputAction('onboarding.run', () => {
    // Enter is a no-op on steps that have no command yet.
    const { command } = STEPS[focusedIndex];
    return command ? onRun(command) : undefined;
  });

  return (
    <Box
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={2}
      paddingY={1}
      marginBottom={1}
      flexDirection="column"
    >
      <Text bold color={ACCENT}>
        Hi!
      </Text>
      <Box marginTop={1}>
        <Text>
          Let&apos;s get you set up — a quick, one-time setup so Duo works smoothly in this project:
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {STEPS.map((step, index) => (
          <StepRow key={step.title} step={step} focused={active && index === focusedIndex} />
        ))}
      </Box>
      <Box marginTop={1} paddingX={1}>
        <ControlsHint>
          *↑*/*↓* to choose · *Enter* to run · Type anything to start your question
        </ControlsHint>
      </Box>
    </Box>
  );
};
