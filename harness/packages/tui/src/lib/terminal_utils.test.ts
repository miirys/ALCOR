import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { detectTerminal, isKittyProtocolSupported } from './terminal_utils';

describe('detectTerminal', () => {
  const terminalEnvVars = [
    'TERM_PROGRAM',
    'TERM',
    'KITTY_WINDOW_ID',
    'ALACRITTY_SOCKET',
    'GNOME_TERMINAL_SCREEN',
    'WT_SESSION',
    'WT_PROFILE_ID',
    'ConEmuPID',
    'ConEmuANSI',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    terminalEnvVars.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    terminalEnvVars.forEach((key) => {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    });
  });

  it('detects Windows Terminal via WT_SESSION', () => {
    process.env.WT_SESSION = '00000000-0000-0000-0000-000000000000';
    expect(detectTerminal()).toBe('WindowsTerminal');
  });

  it('detects Windows Terminal via WT_PROFILE_ID', () => {
    process.env.WT_PROFILE_ID = '{00000000-0000-0000-0000-000000000000}';
    expect(detectTerminal()).toBe('WindowsTerminal');
  });

  it('detects ConEmu via ConEmuPID', () => {
    process.env.ConEmuPID = '1234';
    expect(detectTerminal()).toBe('ConEmu');
  });

  it('prefers TERM_PROGRAM over Windows Terminal markers', () => {
    process.env.TERM_PROGRAM = 'vscode';
    process.env.WT_SESSION = '00000000-0000-0000-0000-000000000000';
    expect(detectTerminal()).toBe('vscode');
  });

  it('returns Unknown when no markers are present', () => {
    expect(detectTerminal()).toBe('Unknown');
  });
});

describe('isKittyProtocolSupported', () => {
  const originalPlatform = process.platform;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns false on Windows without probing the terminal', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // If the Windows guard fails, the next line in isKittyProtocolSupported
    // calls stdin.setRawMode, which is undefined under Jest's mocked stdin and
    // would throw — so returning false here implies the guard short-circuited.
    await expect(isKittyProtocolSupported()).resolves.toBe(false);
  });
});
