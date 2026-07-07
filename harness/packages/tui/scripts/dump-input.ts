#!/usr/bin/env npx tsx
/**
 * Simple keyboard input dump tool
 *
 * Shows the raw bytes received from keyboard input.
 * Useful for debugging and understanding what different terminals send.
 *
 * Usage:
 *   bun run dump-input           # From packages/tui directory
 *   bun run dump-input:kitty     # With Kitty protocol enabled
 *   npx tsx scripts/dump-input.ts [--kitty]  # Alternative from packages/tui
 *
 * Press Ctrl+C to exit.
 */

// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

// Kitty keyboard protocol escape sequences
const KITTY_ENABLE = '\x1b[>1u';
const KITTY_DISABLE = '\x1b[<u';

// Ctrl+C in Kitty protocol: ESC [99;5u (99 = 'c', 5 = 1 + ctrl modifier)
const KITTY_CTRL_C = '\x1b[99;5u';

function formatByte(b: number): string {
  if (b === 0x1b) return `${YELLOW}ESC${RESET}`;
  if (b === 0x0d) return `${YELLOW}CR${RESET}`;
  if (b === 0x0a) return `${YELLOW}LF${RESET}`;
  if (b === 0x09) return `${YELLOW}TAB${RESET}`;
  if (b === 0x7f) return `${YELLOW}DEL${RESET}`;
  if (b >= 32 && b < 127) return `${GREEN}'${String.fromCharCode(b)}'${RESET}`;
  return `${DIM}0x${b.toString(16).padStart(2, '0')}${RESET}`;
}

function formatAsEscapeSequence(bytes: number[]): string {
  return bytes
    .map((b) => {
      if (b === 0x1b) return '\\x1b';
      if (b === 0x0d) return '\\r';
      if (b === 0x0a) return '\\n';
      if (b === 0x09) return '\\t';
      if (b === 0x7f) return '\\x7f';
      if (b >= 32 && b < 127) return String.fromCharCode(b);
      return `\\x${b.toString(16).padStart(2, '0')}`;
    })
    .join('');
}

function formatAsArray(bytes: number[]): string {
  return `[${bytes.map((b) => b.toString()).join(', ')}]`;
}

function main() {
  const kitty = process.argv.includes('--kitty');

  if (!process.stdin.isTTY) {
    console.error('Error: stdin must be a TTY');
    process.exit(1);
  }

  console.log(`${BOLD}${CYAN}Keyboard Input Dump${RESET}\n`);
  console.log(`Terminal: ${process.env.TERM_PROGRAM || process.env.TERM || 'unknown'}`);
  console.log(`Kitty Protocol: ${kitty ? 'Enabled' : 'Disabled'}`);
  console.log(`\nPress keys to see their raw bytes. ${DIM}Ctrl+C to exit.${RESET}\n`);
  console.log(`${'─'.repeat(70)}`);

  process.stdin.setRawMode(true);
  process.stdin.resume();

  if (kitty) {
    process.stdout.write(KITTY_ENABLE);
  }

  const cleanup = () => {
    if (kitty) {
      process.stdout.write(KITTY_DISABLE);
    }
    process.stdin.setRawMode(false);
    process.stdin.pause();
    console.log('\n\nBye!');
    process.exit(0);
  };

  process.stdin.on('data', (data: Buffer) => {
    const bytes = Array.from(data);
    const str = data.toString();

    // Format output
    const bytesFmt = bytes.map(formatByte).join(' ');
    const escSeq = formatAsEscapeSequence(bytes);
    const arr = formatAsArray(bytes);

    console.log(`\n${BOLD}Received:${RESET}`);
    console.log(`  Bytes:    ${bytesFmt}`);
    console.log(`  Escape:   "${escSeq}"`);
    console.log(`  Array:    ${arr}`);
    console.log(`  Length:   ${bytes.length}`);

    // Exit on Ctrl+C (raw byte or Kitty protocol sequence)
    if ((bytes.length === 1 && bytes[0] === 0x03) || str === KITTY_CTRL_C) {
      cleanup();
      return;
    }
  });

  // Handle Ctrl+C via signal as backup
  process.on('SIGINT', cleanup);
}

main();
