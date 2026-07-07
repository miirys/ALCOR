import { describe, it, expect } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES } from '../constants';
import type { InputState } from '../types';
import { resolveFooterHint } from './footer_hint';
import type { CommandComponentRegistry } from './command_component_registry';
import { DROPDOWN_CONTROLS_HINT } from './components/Dropdown';

const emptyRegistry: CommandComponentRegistry = new Map();

const textInput = createFakePartial<InputState>({ inputType: CLI_INPUT_TYPES.TEXT });

describe('resolveFooterHint', () => {
  it('shows the dropdown hint for a text input only while the dropdown is open', () => {
    expect(resolveFooterHint(textInput, emptyRegistry, true)).toBe(DROPDOWN_CONTROLS_HINT);
    expect(resolveFooterHint(textInput, emptyRegistry, false)).toBeNull();
  });

  it('resolves built-in inputs not registered in the command registry', () => {
    const input = createFakePartial<InputState>({
      inputType: CLI_INPUT_TYPES.TOOL_REJECTION_REASON,
    });
    expect(resolveFooterHint(input, emptyRegistry, false)).toBe(
      'Enter to submit rejection • Esc to go back',
    );
  });

  it('resolves command-component inputs via the registry resolver', () => {
    const input = createFakePartial<InputState>({ inputType: CLI_INPUT_TYPES.SETTINGS });
    const registry: CommandComponentRegistry = new Map([
      [
        CLI_INPUT_TYPES.SETTINGS,
        { component: () => null, callbacks: {}, footerHint: () => 'settings hint' },
      ],
    ]);
    expect(resolveFooterHint(input, registry, false)).toBe('settings hint');
  });

  it('falls back to null when no resolver is registered', () => {
    const input = createFakePartial<InputState>({ inputType: CLI_INPUT_TYPES.CHOICE });
    expect(resolveFooterHint(input, emptyRegistry, false)).toBeNull();
  });
});
