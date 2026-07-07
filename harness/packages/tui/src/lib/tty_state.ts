import { setFlags } from './kitty-protocol';

/** Enable bracketed paste mode. */
export const BRACKETED_PASTE_ON = '\x1b[?2004h';
/** Disable bracketed paste mode. */
export const BRACKETED_PASTE_OFF = '\x1b[?2004l';

/**
 * Reset the kitty keyboard protocol flags. `setFlags({})` alone does not
 * satisfy wezterm (and maybe others), which need the additional pop sequences.
 */
export const kittyResetSequences = (): string[] => [
  new TextDecoder().decode(setFlags({})),
  '\x1b[<u',
  '\x1b[>0u',
  '\x1b[<u',
];
