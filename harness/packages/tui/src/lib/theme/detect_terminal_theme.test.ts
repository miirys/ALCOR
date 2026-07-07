import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { detectTerminalTheme } from './detect_terminal_theme';

type StdinStub = Pick<
  NodeJS.ReadStream,
  'isTTY' | 'setRawMode' | 'resume' | 'pause' | 'on' | 'off' | 'removeListener'
> & {
  isRaw?: boolean;
  readableFlowing?: boolean | null;
};

function makeStdinStub(overrides: Partial<StdinStub> = {}): StdinStub {
  return {
    isTTY: true,
    isRaw: false,
    readableFlowing: null,
    setRawMode: jest.fn().mockReturnThis() as unknown as NodeJS.ReadStream['setRawMode'],
    resume: jest.fn() as unknown as NodeJS.ReadStream['resume'],
    pause: jest.fn() as unknown as NodeJS.ReadStream['pause'],
    on: jest.fn() as unknown as NodeJS.ReadStream['on'],
    off: jest.fn() as unknown as NodeJS.ReadStream['off'],
    removeListener: jest.fn() as unknown as NodeJS.ReadStream['removeListener'],
    ...overrides,
  };
}

function makeStdoutStub() {
  return {
    write: jest.fn(),
  } as unknown as NodeJS.WriteStream;
}

describe('detectTerminalTheme', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITLAB_DUO_CLI_THEME;
    delete process.env.COLORFGBG;
    delete process.env.STY;
    delete process.env.TERM;
    delete process.env.TMUX;
    delete process.env.SSH_CONNECTION;
    delete process.env.SSH_TTY;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns the default theme without probing stdin on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const stdin = makeStdinStub();
    const stdout = makeStdoutStub();

    const theme = await detectTerminalTheme({
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout,
    });

    expect(theme).toBe('dark');
    expect(stdin.setRawMode).not.toHaveBeenCalled();
    expect(stdin.resume).not.toHaveBeenCalled();
    expect(stdin.pause).not.toHaveBeenCalled();
    expect(stdout.write).not.toHaveBeenCalled();
  });
});
