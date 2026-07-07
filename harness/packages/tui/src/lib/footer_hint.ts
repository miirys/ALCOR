import { CLI_INPUT_TYPES } from '../constants';
import type { InputState } from '../types';
import { historySearchFooterHint } from '../HistorySearchInput';
import { toolRejectionFooterHint } from '../ToolRejectionReasonInput';
import type { CommandComponentRegistry } from './command_component_registry';
import { DROPDOWN_CONTROLS_HINT } from './components/Dropdown';

/**
 * Resolve the footer hint for the active input, or `null` to fall back to the
 * build/plan mode switcher. Mirrors MessageInput's rendering switch: the text
 * input's dropdown is local TUI state (`dropdownOpen`), the other built-in
 * inputs are rendered directly and resolved here, and slash-command components
 * contribute their hint through the registry.
 */
export function resolveFooterHint(
  input: InputState,
  registry: CommandComponentRegistry,
  dropdownOpen: boolean,
): string | null {
  switch (input.inputType) {
    case CLI_INPUT_TYPES.TEXT:
      return dropdownOpen ? DROPDOWN_CONTROLS_HINT : null;
    case CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH:
      return historySearchFooterHint();
    case CLI_INPUT_TYPES.TOOL_REJECTION_REASON:
      return toolRejectionFooterHint();
    default:
      return registry.get(input.inputType)?.footerHint?.(input) ?? null;
  }
}
