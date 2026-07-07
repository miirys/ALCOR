import { describe, it, expect } from '@jest/globals';
import { CLI_INPUT_TYPES } from '../../constants';
import type { KeyEvent } from '../key_handler';
import type { InputAction } from './actions';
import type { InputKeymapContext } from './context';
import { resolve } from './keymap';

const makeKey = (overrides: Partial<KeyEvent>): KeyEvent =>
  ({
    name: '',
    ctrl: false,
    shift: false,
    meta: false,
    eventType: 'press',
    stopPropagation: () => {},
    ...overrides,
  }) as KeyEvent;

const KEYS = {
  tab: makeKey({ name: 'tab' }),
  enter: makeKey({ name: 'return' }),
  escape: makeKey({ name: 'escape' }),
  up: makeKey({ name: 'up' }),
  down: makeKey({ name: 'down' }),
  ctrlC: makeKey({ name: 'c', ctrl: true }),
  ctrlR: makeKey({ name: 'r', ctrl: true }),
  ctrlO: makeKey({ name: 'o', ctrl: true }),
};

const baseContext: InputKeymapContext = {
  inputType: CLI_INPUT_TYPES.TEXT,
  isLoading: false,
  dropdownOpen: false,
  messageEmpty: true,
  hasQueuedPrompt: false,
  onboardingActive: false,
};

const ctx = (overrides: Partial<InputKeymapContext>): InputKeymapContext => ({
  ...baseContext,
  ...overrides,
});

/** Iterate over all combinations of the three boolean facts. */
const forEachCombo = (
  fn: (c: { dropdownOpen: boolean; isLoading: boolean; messageEmpty: boolean }) => void,
) => {
  for (const dropdownOpen of [true, false]) {
    for (const isLoading of [true, false]) {
      for (const messageEmpty of [true, false]) {
        fn({ dropdownOpen, isLoading, messageEmpty });
      }
    }
  }
};

describe('resolve', () => {
  it('returns null for non-press events', () => {
    expect(resolve(makeKey({ name: 'tab', eventType: 'release' }), baseContext)).toBeNull();
    expect(resolve(makeKey({ name: 'tab', eventType: 'repeat' }), baseContext)).toBeNull();
  });

  describe('Tab', () => {
    it('resolves to dropdown.apply whenever the dropdown is open (independent of mount order)', () => {
      forEachCombo((combo) => {
        let expected: InputAction | null;
        if (combo.dropdownOpen) {
          expected = 'dropdown.apply';
        } else if (combo.isLoading) {
          expected = null;
        } else {
          expected = 'agent.cycle';
        }
        expect(resolve(KEYS.tab, ctx(combo))).toBe(expected);
      });
    });

    it('resolves to agent.cycle when closed, in text input, and not loading', () => {
      expect(resolve(KEYS.tab, ctx({ dropdownOpen: false, isLoading: false }))).toBe('agent.cycle');
    });

    it('does not cycle the agent when loading and closed', () => {
      expect(resolve(KEYS.tab, ctx({ dropdownOpen: false, isLoading: true }))).toBeNull();
    });

    it('does not cycle the agent outside the text input', () => {
      expect(
        resolve(KEYS.tab, ctx({ dropdownOpen: false, inputType: CLI_INPUT_TYPES.CHOICE })),
      ).toBeNull();
    });
  });

  describe('Enter', () => {
    it('resolves to dropdown.applyOrSubmit whenever the dropdown is open', () => {
      forEachCombo((combo) => {
        if (combo.dropdownOpen) {
          expect(resolve(KEYS.enter, ctx(combo))).toBe('dropdown.applyOrSubmit');
        }
      });
    });

    it('resolves to input.submit when closed and in text input', () => {
      expect(resolve(KEYS.enter, ctx({ dropdownOpen: false }))).toBe('input.submit');
    });

    it('still resolves to input.submit while loading, so the prompt can be queued', () => {
      // The controller decides queue-vs-send; the keymap just routes Enter to submit.
      expect(resolve(KEYS.enter, ctx({ dropdownOpen: false, isLoading: true }))).toBe(
        'input.submit',
      );
    });

    it('prefers the dropdown completion over input.submit when both could match while loading', () => {
      // Dropdown-open + loading must apply the completion (which the controller
      // may then queue) rather than queueing the raw, half-typed text.
      expect(resolve(KEYS.enter, ctx({ dropdownOpen: true, isLoading: true }))).toBe(
        'dropdown.applyOrSubmit',
      );
    });
  });

  describe('Escape', () => {
    it('resolves to dropdown.close whenever the dropdown is open (modal beats stream-cancel)', () => {
      forEachCombo((combo) => {
        if (combo.dropdownOpen) {
          expect(resolve(KEYS.escape, ctx(combo))).toBe('dropdown.close');
        }
      });
    });

    it('resolves to stream.cancel when loading and the dropdown is closed', () => {
      expect(resolve(KEYS.escape, ctx({ dropdownOpen: false, isLoading: true }))).toBe(
        'stream.cancel',
      );
    });

    it('resolves to null when closed and not loading', () => {
      expect(resolve(KEYS.escape, ctx({ dropdownOpen: false, isLoading: false }))).toBeNull();
    });
  });

  describe('queue.cancel', () => {
    it('resolves Escape to queue.cancel when a prompt is queued, taking precedence over stream.cancel', () => {
      expect(resolve(KEYS.escape, ctx({ hasQueuedPrompt: true, isLoading: true }))).toBe(
        'queue.cancel',
      );
    });

    it('falls through to stream.cancel when nothing is queued', () => {
      // Without a queued prompt, Escape while loading still cancels the stream.
      expect(resolve(KEYS.escape, ctx({ hasQueuedPrompt: false, isLoading: true }))).toBe(
        'stream.cancel',
      );
    });

    it('yields to dropdown.close when the dropdown is open, so the popup dismisses first', () => {
      // Esc-dismisses-popup wins; queue.cancel waits for a second Esc once the
      // dropdown is gone.
      expect(
        resolve(KEYS.escape, ctx({ hasQueuedPrompt: true, isLoading: true, dropdownOpen: true })),
      ).toBe('dropdown.close');
    });

    it('yields to stream.cancel when a non-text input (e.g. tool approval choice) is active', () => {
      // The ChoiceInputState owns the screen; queue.cancel must not rewrite
      // input.lines and strand the agent without an approval answer. Esc still
      // routes to the regular stream-cancel two-step in this mode.
      expect(
        resolve(
          KEYS.escape,
          ctx({ hasQueuedPrompt: true, isLoading: true, inputType: CLI_INPUT_TYPES.CHOICE }),
        ),
      ).toBe('stream.cancel');
    });
  });

  describe('Ctrl+C', () => {
    it('closes the dropdown when open', () => {
      expect(resolve(KEYS.ctrlC, ctx({ dropdownOpen: true }))).toBe('dropdown.close');
    });

    it('clears the input when closed and the message is non-empty', () => {
      expect(resolve(KEYS.ctrlC, ctx({ dropdownOpen: false, messageEmpty: false }))).toBe(
        'input.clear',
      );
    });

    it('exits when closed and the message is empty', () => {
      expect(resolve(KEYS.ctrlC, ctx({ dropdownOpen: false, messageEmpty: true }))).toBe(
        'app.exit',
      );
    });
  });

  describe('Up/Down', () => {
    it('navigates the dropdown only when open', () => {
      expect(resolve(KEYS.down, ctx({ dropdownOpen: true }))).toBe('dropdown.next');
      expect(resolve(KEYS.up, ctx({ dropdownOpen: true }))).toBe('dropdown.prev');
      expect(resolve(KEYS.down, ctx({ dropdownOpen: false }))).toBeNull();
      expect(resolve(KEYS.up, ctx({ dropdownOpen: false }))).toBeNull();
    });
  });

  describe('onboarding navigation', () => {
    it('resolves Up/Down to onboarding prev/next when active, empty, and no dropdown', () => {
      const active = ctx({ onboardingActive: true, messageEmpty: true, dropdownOpen: false });
      expect(resolve(KEYS.up, active)).toBe('onboarding.prev');
      expect(resolve(KEYS.down, active)).toBe('onboarding.next');
    });

    it('resolves Enter to onboarding.run when active, empty, closed, and not loading', () => {
      expect(
        resolve(KEYS.enter, ctx({ onboardingActive: true, messageEmpty: true, isLoading: false })),
      ).toBe('onboarding.run');
    });

    it('yields to the dropdown when one is open', () => {
      const combo = ctx({ onboardingActive: true, messageEmpty: true, dropdownOpen: true });
      expect(resolve(KEYS.up, combo)).toBe('dropdown.prev');
      expect(resolve(KEYS.down, combo)).toBe('dropdown.next');
      expect(resolve(KEYS.enter, combo)).toBe('dropdown.applyOrSubmit');
    });

    it('falls through to input handling once the user starts typing', () => {
      const typing = ctx({ onboardingActive: true, messageEmpty: false, dropdownOpen: false });
      expect(resolve(KEYS.enter, typing)).toBe('input.submit');
      expect(resolve(KEYS.up, typing)).toBeNull();
      expect(resolve(KEYS.down, typing)).toBeNull();
    });

    it('does not run a step while a stream is loading — falls through to input.submit for queuing', () => {
      expect(
        resolve(KEYS.enter, ctx({ onboardingActive: true, messageEmpty: true, isLoading: true })),
      ).toBe('input.submit');
    });

    it('releases ↑/↓/Enter once another input opens (e.g. /mcp panel)', () => {
      const panel = ctx({
        onboardingActive: true,
        messageEmpty: true,
        inputType: CLI_INPUT_TYPES.MCP_PANEL,
      });
      expect(resolve(KEYS.up, panel)).toBeNull();
      expect(resolve(KEYS.down, panel)).toBeNull();
      expect(resolve(KEYS.enter, panel)).toBeNull();
    });
  });

  describe('global shortcuts', () => {
    it('resolves Ctrl+R to history.open and Ctrl+O to expand.toggle', () => {
      expect(resolve(KEYS.ctrlR, baseContext)).toBe('history.open');
      expect(resolve(KEYS.ctrlO, baseContext)).toBe('expand.toggle');
    });
  });
});
