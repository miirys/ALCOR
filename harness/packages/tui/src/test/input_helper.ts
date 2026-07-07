import { KeyModifiers } from '../types';
import { StdInSubscriptionManager } from '../lib/stdin_context';

const ArrowKeys = {
  Up: 'A',
  Down: 'B',
  Right: 'C',
  Left: 'D',
} as const;

type ArrowKeyCode = (typeof ArrowKeys)[keyof typeof ArrowKeys];

function getFullKeysObject(key: Partial<KeyModifiers>): KeyModifiers {
  return {
    home: key.home ?? false,
    end: key.end ?? false,
    shift: key.shift ?? false,
    ctrl: key.ctrl ?? false,
    meta: key.meta ?? false,
    upArrow: key.upArrow ?? false,
    downArrow: key.downArrow ?? false,
    leftArrow: key.leftArrow ?? false,
    rightArrow: key.rightArrow ?? false,
    pageDown: key.pageDown ?? false,
    pageUp: key.pageUp ?? false,
    return: key.return ?? false,
    escape: key.escape ?? false,
    tab: key.tab ?? false,
    backspace: key.backspace ?? false,
    delete: key.delete ?? false,
    super: key.super ?? false,
    hyper: key.hyper ?? false,
    capsLock: key.capsLock ?? false,
    numLock: key.numLock ?? false,
  };
}

/**
 * Simulates input for Ink component testing by converting useInput handler
 * arguments to the appropriate stdin sequence.
 *
 * @param {string} input - The input string (usually a single character)
 * @param {Object} key - The key object with boolean flags
 * @returns {string} The ANSI escape sequence to write to stdin
 *
 * @example
 * stdin.write(simulateInput('', { leftArrow: true }));
 * stdin.write(simulateInput('', { leftArrow: true, ctrl: true }));
 * stdin.write(simulateInput('c', { ctrl: true }));
 */
function getSimulatedInputString(input: string, partialKey: Partial<KeyModifiers>) {
  const key = getFullKeysObject(partialKey);
  // Arrow keys with modifiers
  if (key.upArrow) return getArrowSequence(ArrowKeys.Up, key);
  if (key.downArrow) return getArrowSequence(ArrowKeys.Down, key);
  if (key.rightArrow) return getArrowSequence(ArrowKeys.Right, key);
  if (key.leftArrow) return getArrowSequence(ArrowKeys.Left, key);

  // Special keys
  if (key.return) {
    // Shift+Return has a special sequence in some terminals
    if (key.shift) return '\n';

    // Ctrl+Return
    // it seems that terminals do not distinguish between Ctrl+Return and plain Return

    // Alt/Meta+Return
    if (key.meta) return '\x1B\r';
    // Plain return
    return '\r';
  }
  if (key.escape) return '\x1B';
  if (key.tab) return key.shift ? '\x1B[Z' : '\t'; // Shift+Tab is reverse tab
  if (key.backspace) return '\x7F';
  if (key.delete) return '\x1B[3~';
  if (key.pageUp) return '\x1B[5~';
  if (key.pageDown) return '\x1B[6~';

  // Handle modifier + character combinations
  if (input && input.length === 1) {
    let result = input;

    // Ctrl converts letters to control codes
    // Note: Ctrl is case-insensitive (Ctrl+A and Ctrl+a both produce \x01)
    if (key.ctrl) {
      const upperChar = input.toUpperCase();
      if (upperChar >= 'A' && upperChar <= 'Z') {
        const code = upperChar.charCodeAt(0) - 64; // A=1, B=2, ..., Z=26
        result = String.fromCharCode(code);
      }
      // For non-letter characters with Ctrl, behavior varies by terminal
      // Keep the character as-is and let the terminal handle it
    }

    // Alt/Meta adds ESC prefix (case-sensitive)
    // Alt+a sends \x1Ba, Alt+A sends \x1BA
    if (key.meta) {
      result = `\x1B${result}`;
    }

    // If we processed any modifiers, return the result
    if (key.ctrl || key.meta) {
      return result;
    }
  }

  // Regular character input (including Shift+letter which is just uppercase)
  return input || '';
}

export type Stdin = {
  write: (data: string) => void;
};

export function simulateInput(stdin: Stdin, input: string, key: Partial<KeyModifiers> = {}) {
  stdin.write(getSimulatedInputString(input, key));
}

function getArrowSequence(direction: ArrowKeyCode, key: KeyModifiers) {
  // CSI format: \x1B[1;{modifier}{direction}
  // Modifiers: 2=Shift, 3=Alt, 5=Ctrl, 6=Ctrl+Shift, etc.

  if (key.ctrl && key.shift) return `\x1B[1;6${direction}`;
  if (key.ctrl && key.meta) return `\x1B[1;7${direction}`;
  if (key.ctrl) return `\x1B[1;5${direction}`;
  if (key.meta) return `\x1B[1;3${direction}`; // Alt/Option
  if (key.shift) return `\x1B[1;2${direction}`;

  // Plain arrow key
  return `\x1B[${direction}`;
}

export type SendInputFn = (input: string, key?: Partial<KeyModifiers>, rawHex?: string) => void;

/**
 * Creates a unified input helper that emits both raw stdin data and simulates Ink input.
 * This is useful for testing components that use StdinContext and useInput together.
 *
 * The helper handles two modes:
 * - With rawHex: Emits the raw hex sequence directly to StdinSubscriptionManager
 *   (useful for testing specific terminal sequences like Home key variants)
 * - Without rawHex: Generates the appropriate sequence from input/key and emits it
 *
 * @param stdinManager - The StdInSubscriptionManager instance
 * @param inkStdin - The Ink stdin object from render result
 * @returns A function that sends input through both channels
 *
 * @example
 * const stdinManager = new StdInSubscriptionManager();
 * const { stdin } = render(<Component />, { wrapper: (props) => <StdinContext.Provider value={stdinManager} {...props} /> });
 * const sendInput = createSendInputFn(stdinManager, stdin);
 * // Regular input
 * sendInput('h');
 * sendInput('', { backspace: true });
 * // Raw hex sequence (e.g., for testing specific terminal sequences)
 * sendInput('', { home: true }, '1b5b48'); // ESC[H (Home key)
 */
export function createSendInputFn(
  stdinManager: StdInSubscriptionManager,
  inkStdin: Stdin,
): SendInputFn {
  return (input, key, rawHex) => {
    // Emit raw hex to StdinSubscriptionManager if provided
    if (rawHex) {
      stdinManager.emitData(Buffer.from(rawHex, 'hex'));
    } else {
      const str = getSimulatedInputString(input, key ?? {});
      stdinManager.emitData(Buffer.from(str, 'utf8'));
    }

    // Simulate input for Ink
    simulateInput(inkStdin, input, key);
  };
}
