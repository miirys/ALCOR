import { CLI_INPUT_TYPES } from '../../constants';

/**
 * The facts the keymap predicates need to resolve a key to an action.
 *
 * Components publish slices of this context via `usePublishInputContext`.
 */
export interface InputKeymapContext {
  /** Current CLI input type (one of CLI_INPUT_TYPES values). */
  inputType: string;
  /** Whether a stream is currently loading. */
  isLoading: boolean;
  /** Whether a dropdown is currently open. */
  dropdownOpen: boolean;
  /** Whether the text input message is empty (after trimming). */
  messageEmpty: boolean;
  /** Whether a prompt is queued waiting for the current turn to end. */
  hasQueuedPrompt: boolean;
  /** Whether the onboarding card is on screen and owns ↑/↓/Enter navigation. */
  onboardingActive: boolean;
}

export const DEFAULT_INPUT_KEYMAP_CONTEXT: InputKeymapContext = {
  inputType: CLI_INPUT_TYPES.TEXT,
  isLoading: false,
  dropdownOpen: false,
  messageEmpty: true,
  hasQueuedPrompt: false,
  onboardingActive: false,
};
