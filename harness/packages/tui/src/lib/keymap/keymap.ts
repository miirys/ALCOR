import { CLI_INPUT_TYPES } from '../../constants';
import { KeyChecks } from '../input/unified/key_checks';
import type { KeyEvent } from '../key_handler';
import type { InputAction } from './actions';
import type { InputKeymapContext } from './context';

interface Binding {
  action: InputAction;
  match: (k: KeyEvent) => boolean;
  when: (c: InputKeymapContext) => boolean;
}

/**
 * Precedence-as-data. First match wins; order encodes precedence explicitly,
 * most specific first. This replaces mount-order arbitration with a single,
 * deterministic table.
 */
const BINDINGS: Binding[] = [
  {
    // Ordered before stream.cancel so a queued prompt claims Esc first, but
    // yields to an open dropdown (dropdown.close handles Esc-dismisses-popup)
    // and to non-text inputs like the tool-approval choice picker.
    action: 'queue.cancel',
    match: (k) => k.name === 'escape',
    when: (c) => c.hasQueuedPrompt && !c.dropdownOpen && c.inputType === CLI_INPUT_TYPES.TEXT,
  },
  {
    // Esc-dismisses-popup beats stream.cancel: an open dropdown is a modal
    // overlay the user expects to close first. A second Esc (with the dropdown
    // now closed) then enters the cancel-stream two-step as usual.
    action: 'dropdown.close',
    match: (k) => k.name === 'escape' || KeyChecks.isCtrl('c', k),
    when: (c) => c.dropdownOpen,
  },
  {
    action: 'stream.cancel',
    match: (k) => k.name === 'escape',
    when: (c) => c.isLoading,
  },
  {
    action: 'dropdown.next',
    match: (k) => k.name === 'down',
    when: (c) => c.dropdownOpen,
  },
  {
    action: 'dropdown.prev',
    match: (k) => k.name === 'up',
    when: (c) => c.dropdownOpen,
  },
  {
    action: 'dropdown.apply',
    match: (k) => KeyChecks.isTab(k),
    when: (c) => c.dropdownOpen,
  },
  {
    // Fires even while loading: applying a completion just edits the buffer,
    // and a submit that lands here is queued by the controller.
    action: 'dropdown.applyOrSubmit',
    match: (k) => KeyChecks.isEnter(k),
    when: (c) => c.dropdownOpen,
  },
  // Onboarding navigation is only active while the card is on the empty screen,
  // the normal text input is showing, and the user has not started typing.
  // Gated on `inputType === TEXT` so running a step that opens another input
  // (e.g. `/mcp`) hands ↑/↓/Enter to that panel instead of the card. Placed
  // after the dropdown block (so an open dropdown wins) and before
  // `input.submit` (so Enter runs the focused step rather than submitting) —
  // the moment the message is non-empty these fall through to normal input.
  {
    action: 'onboarding.prev',
    match: (k) => k.name === 'up',
    when: (c) => c.onboardingActive && c.messageEmpty && c.inputType === CLI_INPUT_TYPES.TEXT,
  },
  {
    action: 'onboarding.next',
    match: (k) => k.name === 'down',
    when: (c) => c.onboardingActive && c.messageEmpty && c.inputType === CLI_INPUT_TYPES.TEXT,
  },
  {
    action: 'onboarding.run',
    match: (k) => KeyChecks.isEnter(k),
    when: (c) =>
      c.onboardingActive && c.messageEmpty && !c.isLoading && c.inputType === CLI_INPUT_TYPES.TEXT,
  },
  {
    action: 'agent.cycle',
    match: (k) => KeyChecks.isTab(k),
    when: (c) => c.inputType === CLI_INPUT_TYPES.TEXT && !c.isLoading,
  },
  {
    // Submits even while loading; the controller queues the prompt mid-turn.
    action: 'input.submit',
    match: (k) => KeyChecks.isEnter(k),
    when: (c) => c.inputType === CLI_INPUT_TYPES.TEXT,
  },
  {
    action: 'input.clear',
    match: (k) => KeyChecks.isCtrl('c', k),
    when: (c) => !c.messageEmpty,
  },
  {
    action: 'app.exit',
    match: (k) => KeyChecks.isCtrl('c', k),
    when: () => true,
  },
  {
    action: 'history.open',
    match: (k) => KeyChecks.isCtrl('r', k),
    when: () => true,
  },
  {
    action: 'expand.toggle',
    match: (k) => KeyChecks.isCtrl('o', k),
    when: () => true,
  },
];

/**
 * Resolve a key event to an action given the current context.
 *
 * Pure function: only `press` events resolve to actions; the first binding
 * whose `match` and `when` both hold wins.
 */
export function resolve(k: KeyEvent, c: InputKeymapContext): InputAction | null {
  if (k.eventType !== 'press') {
    return null;
  }

  for (const binding of BINDINGS) {
    if (binding.match(k) && binding.when(c)) {
      return binding.action;
    }
  }

  return null;
}
