import { supportsHyperlinks, hyperlink, resetHyperlinkCache } from './hyperlinks';

describe('hyperlinks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetHyperlinkCache();
    // Start with a clean env for each test
    process.env = { ...originalEnv };
    // Remove all terminal-detection vars so tests are isolated
    delete process.env.FORCE_HYPERLINK;
    delete process.env.TMUX;
    delete process.env.STY;
    delete process.env.WT_SESSION;
    delete process.env.TERM_PROGRAM;
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.ALACRITTY_SOCKET;
    delete process.env.TERM;
    delete process.env.VTE_VERSION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('supportsHyperlinks', () => {
    it('returns false by default (no terminal env vars)', () => {
      expect(supportsHyperlinks()).toBe(false);
    });

    it('caches the result', () => {
      process.env.KITTY_WINDOW_ID = '1';
      expect(supportsHyperlinks()).toBe(true);
      // Even after removing the env var, cached result persists
      delete process.env.KITTY_WINDOW_ID;
      expect(supportsHyperlinks()).toBe(true);
    });

    describe('FORCE_HYPERLINK', () => {
      it('returns true when FORCE_HYPERLINK=1', () => {
        process.env.FORCE_HYPERLINK = '1';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('returns true when FORCE_HYPERLINK=true', () => {
        process.env.FORCE_HYPERLINK = 'true';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('returns false when FORCE_HYPERLINK=0', () => {
        process.env.FORCE_HYPERLINK = '0';
        expect(supportsHyperlinks()).toBe(false);
      });

      it('returns false when FORCE_HYPERLINK=false', () => {
        process.env.FORCE_HYPERLINK = 'false';
        expect(supportsHyperlinks()).toBe(false);
      });

      it('returns false when FORCE_HYPERLINK is empty string', () => {
        process.env.FORCE_HYPERLINK = '';
        expect(supportsHyperlinks()).toBe(false);
      });

      it('overrides even in tmux', () => {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
        process.env.FORCE_HYPERLINK = '1';
        expect(supportsHyperlinks()).toBe(true);
      });
    });

    describe('terminal multiplexers', () => {
      it('returns false when TMUX is set', () => {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
        process.env.KITTY_WINDOW_ID = '1';
        expect(supportsHyperlinks()).toBe(false);
      });

      it('returns false when STY (GNU Screen) is set', () => {
        process.env.STY = '12345.pts-0.host';
        process.env.KITTY_WINDOW_ID = '1';
        expect(supportsHyperlinks()).toBe(false);
      });
    });

    describe('terminal detection', () => {
      it('detects iTerm', () => {
        process.env.TERM_PROGRAM = 'iTerm.app';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects WezTerm', () => {
        process.env.TERM_PROGRAM = 'WezTerm';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects VS Code', () => {
        process.env.TERM_PROGRAM = 'vscode';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Ghostty', () => {
        process.env.TERM_PROGRAM = 'ghostty';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Hyper', () => {
        process.env.TERM_PROGRAM = 'Hyper';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Kitty via KITTY_WINDOW_ID', () => {
        process.env.KITTY_WINDOW_ID = '1';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Alacritty via TERM', () => {
        process.env.TERM = 'alacritty';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Alacritty via ALACRITTY_SOCKET', () => {
        process.env.ALACRITTY_SOCKET = '/tmp/alacritty.sock';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects Windows Terminal via WT_SESSION', () => {
        process.env.WT_SESSION = 'some-guid';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('detects VTE >= 5000', () => {
        process.env.VTE_VERSION = '5200';
        expect(supportsHyperlinks()).toBe(true);
      });

      it('rejects VTE < 5000', () => {
        process.env.VTE_VERSION = '4900';
        expect(supportsHyperlinks()).toBe(false);
      });

      it('returns false for unknown TERM_PROGRAM', () => {
        process.env.TERM_PROGRAM = 'SomeUnknownTerminal';
        expect(supportsHyperlinks()).toBe(false);
      });
    });
  });

  describe('hyperlink', () => {
    it('returns OSC 8 sequence when supported', () => {
      process.env.FORCE_HYPERLINK = '1';
      const result = hyperlink('Click here', 'https://example.com');
      expect(result).toBe('\x1b]8;;https://example.com\x1b\\Click here\x1b]8;;\x1b\\');
    });

    it('returns plain text when not supported', () => {
      const result = hyperlink('Click here', 'https://example.com');
      expect(result).toBe('Click here');
    });

    it('strips ESC characters from URL to prevent injection', () => {
      process.env.FORCE_HYPERLINK = '1';
      // URL with embedded ESC that could break out of the OSC 8 sequence
      const malicious = `https://evil.com\x1b\\payload`;
      const result = hyperlink('Click', malicious);
      // Extract the URL portion between the OSC 8 open and its ST
      // eslint-disable-next-line no-control-regex
      const urlMatch = result.match(/\x1b]8;;(.+?)\x1b\\/);
      expect(urlMatch).not.toBeNull();
      // The embedded ESC byte must be gone from the URL
      expect(urlMatch![1]).not.toContain('\x1b');
      expect(urlMatch![1]).toBe('https://evil.com\\payload');
    });
  });
});
