import { EventEmitterImpl, type Event } from '@gitlab-org/core';
import { Key } from '../../kitty-protocol';
import { normalizeKittyInput } from './handle_kitty_input';
import { parseKeypress } from './opentui_parser';
import type { ParsedKey } from './types';

const START_PASTED_CONTENT_MARKER = '[200~';
const END_PASTED_CONTENT_MARKER = '[201~';

// Terminal focus reporting (DEC mode ?1004): ESC[I = focus in, ESC[O = focus out.
// Note: ESC[O (CSI O) is unambiguously focus-out — SS3 keys are ESC O (no bracket).
const FOCUS_IN_SEQUENCE = '\x1b[I';
const FOCUS_OUT_SEQUENCE = '\x1b[O';

/**
 * Unified input system that normalizes all input sources into a single event stream
 */
export class UnifiedInputSystem {
  #emitter: EventEmitterImpl<ParsedKey>;

  #isPasting = false;

  #pasteBuffer = '';

  #isKittyProtocol = false;

  #focusEmitter: EventEmitterImpl<boolean>;

  #isFocused = true;

  #suspendEmitter: EventEmitterImpl<void>;

  onKey: Event<ParsedKey>;

  /**
   * Fires when Ctrl+Z is pressed, so the host can restore the terminal and raise SIGTSTP.
   * Raw mode keeps the kernel from seeing the byte, so suspend must be driven from here.
   */
  onSuspend: Event<void>;

  /**
   * Fires with the new focus state whenever the terminal gains or loses focus.
   *
   * OpenTUI seam: this is the single integration point for terminal focus. Today it is fed
   * by parsing DEC 1004 sequences below; after the OpenTUI migration it can be fed by the
   * renderer's focus handler instead, with no change required for consumers.
   */
  onFocusChange: Event<boolean>;

  constructor() {
    this.#emitter = new EventEmitterImpl<ParsedKey>();
    this.onKey = this.#emitter.event;
    this.#focusEmitter = new EventEmitterImpl<boolean>();
    this.onFocusChange = this.#focusEmitter.event;
    this.#suspendEmitter = new EventEmitterImpl<void>();
    this.onSuspend = this.#suspendEmitter.event;
  }

  get isFocused(): boolean {
    return this.#isFocused;
  }

  setKittyProtocol(enabled: boolean): void {
    this.#isKittyProtocol = enabled;
  }

  get isKittyProtocol(): boolean {
    return this.#isKittyProtocol;
  }

  /**
   * Process raw stdin bytes
   *
   * This is the main entry point for processing keyboard input.
   * It handles:
   * - Bracketed paste mode detection and buffering
   * - Routing to Kitty or standard parser based on protocol
   * - Emitting normalized ParsedKey events
   */
  processRawInput(buffer: Buffer): void {
    const rawInput = buffer.toString();

    // Focus events are delivered on stdin but are not keypresses — surface them on a
    // dedicated channel and stop so they never reach key listeners.
    if (rawInput === FOCUS_IN_SEQUENCE || rawInput === FOCUS_OUT_SEQUENCE) {
      this.#setFocused(rawInput === FOCUS_IN_SEQUENCE);
      return;
    }

    const pasteResult = this.#parsePaste(rawInput);

    if (pasteResult.isPasting) {
      if (!pasteResult.isFullyParsed) {
        return;
      }

      if (pasteResult.text) {
        this.#emitPasteEvent(pasteResult.text);
      }
      return;
    }

    if (this.#isKittyProtocol) {
      let remaining = buffer as Uint8Array;
      while (remaining.length > 0) {
        const result = Key.parse(remaining);
        if (!result) break;
        const [key, consumed] = result;
        const parsedKey = normalizeKittyInput(key);
        this.#fireKey(parsedKey);
        remaining = remaining.subarray(consumed);
      }
    } else {
      // For standard terminal, handle escape sequences vs plain text differently
      const isEscapeSequence = rawInput.startsWith('\x1b');
      if (isEscapeSequence) {
        // Parse as a single escape sequence
        const parsedKey = parseKeypress(rawInput);
        if (parsedKey) {
          this.#fireKey(parsedKey);
        }
      } else {
        // Parse each character individually (for tmux and other terminals that send multiple chars)
        for (const char of rawInput) {
          const parsedKey = parseKeypress(char);
          if (parsedKey) {
            this.#fireKey(parsedKey);
          }
        }
      }
    }
  }

  /**
   * Process a Kitty protocol Key directly (for testing or direct use)
   */
  processKittyInput(key: Key): void {
    const parsedKey = normalizeKittyInput(key);
    this.#fireKey(parsedKey);
  }

  /**
   * Process paste event directly (for testing or direct use)
   */
  processPasteEvent(text: string): void {
    this.#emitPasteEvent(text);
  }

  /** Process a focus change directly (for testing or direct use). */
  processFocusEvent(focused: boolean): void {
    this.#setFocused(focused);
  }

  /**
   * Emit a parsed key, except Ctrl+Z, which is redirected to a suspend request so the
   * process can be backgrounded like a standard Unix terminal application. Only the initial
   * press suspends — auto-repeat and release events (Kitty protocol) are ignored.
   */
  #fireKey(parsedKey: ParsedKey): void {
    const isSuspend = parsedKey.ctrl && parsedKey.name === 'z' && parsedKey.eventType === 'press';
    if (isSuspend) {
      this.#suspendEmitter.fire();
      return;
    }
    this.#emitter.fire(parsedKey);
  }

  #setFocused(focused: boolean): void {
    if (this.#isFocused === focused) return;
    this.#isFocused = focused;
    this.#focusEmitter.fire(focused);
  }

  #emitPasteEvent(text: string): void {
    const pasteKey: ParsedKey = {
      name: 'paste',
      sequence: text,
      raw: text,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      number: false,
      eventType: 'press',
      source: this.#isKittyProtocol ? 'kitty' : 'raw',
      timestamp: Date.now(),
    };
    this.#emitter.fire(pasteKey);
  }

  #normalizeInput(input: string): string {
    return input
      .replace(/(\r\n|\n|\r)/g, '\n')
      .replace('\u001b', '')
      .replace('\x1b', '')
      .replace(/\[200~/g, '')
      .replace(/\[201~/g, '');
  }

  #parsePaste(rawInput: string): {
    isPasting: boolean;
    isFullyParsed?: boolean;
    text?: string;
  } {
    const hasStartPasteBracket = rawInput.includes(START_PASTED_CONTENT_MARKER);
    const hasEndPasteBracket = rawInput.includes(END_PASTED_CONTENT_MARKER);

    if (!this.#isPasting && !(hasStartPasteBracket || hasEndPasteBracket)) {
      return { isPasting: false };
    }

    if (hasStartPasteBracket && !hasEndPasteBracket) {
      this.#isPasting = true;
      this.#pasteBuffer = rawInput;
      return { isPasting: true, isFullyParsed: false };
    }

    if (this.#isPasting && !hasEndPasteBracket) {
      this.#pasteBuffer += rawInput;
      return { isPasting: true, isFullyParsed: false };
    }

    if (this.#isPasting && hasEndPasteBracket) {
      const text = this.#normalizeInput(this.#pasteBuffer + rawInput);
      this.#isPasting = false;
      this.#pasteBuffer = '';
      return { isPasting: true, isFullyParsed: true, text };
    }

    return {
      isPasting: true,
      isFullyParsed: true,
      text: this.#normalizeInput(rawInput),
    };
  }

  /**
   * Reset paste state (useful for testing)
   */
  resetPasteState(): void {
    this.#isPasting = false;
    this.#pasteBuffer = '';
  }

  dispose(): void {
    this.#emitter.dispose();
    this.#focusEmitter.dispose();
    this.#suspendEmitter.dispose();
  }
}
