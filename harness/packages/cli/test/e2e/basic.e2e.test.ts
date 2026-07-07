import { createTestEnv, getTestToken } from './test_utils';
import { ChatPage } from './pages/chat_page';
import { recordedTest } from './recorded_test';

describe('CLI Basic E2E', () => {
  const ctx = recordedTest();
  let chat: ChatPage | undefined;

  it('should show welcome and respond to greeting', async () => {
    chat = ctx.launchChat({
      cliOptions: { gitlabAuthToken: getTestToken() },
    });

    await chat.waitForWelcomeMessage();

    await chat.sendMessage('hi');
    await chat.waitForDuoResponse();
  }, 60000);

  describe('when pressing Ctrl+C after TUI is ready', () => {
    it('exits the process cleanly', async () => {
      chat = ctx.launchChat({
        cliOptions: { gitlabAuthToken: getTestToken() },
      });
      await chat.waitForInputReady();

      await chat.terminal.sendKey('ctrl+c');

      // asciinema appends "::: asciinema session ended" to the scrollback
      // when the recorded process exits — reliable cross-platform exit sentinel.
      await chat.terminal.waitForMatch(/asciinema session ended/, 15000);

      const output = chat.terminal.getFullOutput();
      expect(output).not.toMatch(/uncaught exception/i);
    }, 60000);

    it('prints session resume command after a session has been established', async () => {
      chat = ctx.launchChat({
        cliOptions: { gitlabAuthToken: getTestToken() },
      });

      // Wait for input ready before sending — ensures the CLI is fully
      // initialised and a session will be created on first message.
      await chat.waitForInputReady();
      await chat.sendMessage('hi');
      await chat.waitForDuoResponse();

      await chat.terminal.sendKey('ctrl+c');

      // asciinema appends "::: asciinema session ended" when the process exits.
      await chat.terminal.waitForMatch(/asciinema session ended/, 15000);

      const output = chat.terminal.getFullOutput();
      expect(output).toMatch(/To resume, run: (glab duo cli|duo) --existing-session-id \S+/);
    }, 60000);
  });

  describe('prompt input', () => {
    const SMALL_TERMINAL_ROWS = 15;
    const SMALL_TERMINAL_COLS = 80;
    const WAIT_TIMEOUT = 30000;

    beforeEach(async () => {
      chat = ctx.launchChat({
        cliOptions: { gitlabAuthToken: getTestToken() },
        cols: SMALL_TERMINAL_COLS,
        rows: SMALL_TERMINAL_ROWS,
        env: createTestEnv({
          GLAB_CONFIG_DIR: process.env.HOME ? `${process.env.HOME}/.config/glab-cli` : '',
        }),
      });
      await chat.waitForInputReady();
    }, WAIT_TIMEOUT);

    describe('text editing and navigation', () => {
      it('inserts and deletes characters', async () => {
        await chat!.terminal.writeText('abcdef');
        await expect(chat!.terminal).toEventuallyMatchOutput(/abcdef/);

        await chat!.terminal.repeatKey('backspace', 2);
        await expect(chat!.terminal).toEventuallyMatchOutput(/abcd/);
        expect(chat!.terminal.getOutput()).not.toContain('abcdef');

        await chat!.terminal.writeText('XY');
        await expect(chat!.terminal).toEventuallyMatchOutput(/abcdXY/);

        await chat!.terminal.repeatKey('left', 2);
        await chat!.terminal.sendKey('ctrl+d');
        await expect(chat!.terminal).toEventuallyMatchOutput(/abcdY/);

        await chat!.terminal.sendKey('backspace');
        await expect(chat!.terminal).toEventuallyMatchOutput(/abcY/);
      }, 60000);

      it('moves cursor with Home, End, Ctrl+A, Ctrl+E, and arrow keys', async () => {
        await chat!.terminal.writeText('HELLO WORLD');

        // Home key moves cursor to start of line
        await chat!.terminal.sendKey('home');
        await chat!.terminal.writeText('X');
        await expect(chat!.terminal).toEventuallyMatchOutput(/XHELLO WORLD/);

        // End key moves cursor to end of line
        await chat!.terminal.sendKey('end');
        await chat!.terminal.writeText('Y');
        await expect(chat!.terminal).toEventuallyMatchOutput(/XHELLO WORLDY/);

        // Ctrl+A is alias for Home
        await chat!.terminal.sendKey('ctrl+a');
        await chat!.terminal.writeText('Z');
        await expect(chat!.terminal).toEventuallyMatchOutput(/ZXHELLO WORLDY/);

        // Ctrl+E is alias for End
        await chat!.terminal.sendKey('ctrl+e');
        await chat!.terminal.writeText('W');
        await expect(chat!.terminal).toEventuallyMatchOutput(/ZXHELLO WORLDYW/);

        // Left arrow moves cursor back, inserting proves position
        // "ZXHELLO WORLDYW" = 15 chars, cursor at 15 (end)
        // 7 lefts → position 8 → before W in WORLD
        await chat!.terminal.repeatKey('left', 7);
        await chat!.terminal.writeText('V');
        await expect(chat!.terminal).toEventuallyMatchOutput(/ZXHELLO VWORLDYW/);
      }, 60000);

      it('navigates and deletes by word with Ctrl+Arrow and Ctrl+Delete', async () => {
        await chat!.terminal.writeText('alpha bravo charlie');

        // Ctrl+Left from end: wordLeft lands at start of "charlie" (position 12)
        // Single delete (forward) removes "c", proving cursor is at "charlie"
        await chat!.terminal.sendKey('ctrl+left');
        await chat!.terminal.sendKey('delete');
        await expect(chat!.terminal).toEventuallyMatchOutput(/alpha bravo harlie/);

        // Ctrl+Left again: wordLeft lands at start of "bravo"
        // Ctrl+Delete from start of "bravo" removes the whole word
        await chat!.terminal.sendKey('ctrl+left');
        await chat!.terminal.sendKey('ctrl+delete');
        await expect(chat!.terminal).toEventuallyMatchOutput(/alpha {2}harlie/);
        expect(chat!.terminal.getOutput()).not.toContain('bravo');

        // Ctrl+Right: from the space after "alpha", lands at end of "harlie"
        // (space branch: skip spaces, then skip word chars)
        // Backspace deletes "e" from "harlie", proving cursor is at end
        await chat!.terminal.sendKey('ctrl+right');
        await chat!.terminal.sendKey('backspace');
        await expect(chat!.terminal).toEventuallyMatchOutput(/alpha {2}harli/);
      }, 60000);

      it('handles multi-line editing with newlines and vertical navigation', async () => {
        await chat!.terminal.writeText('AAA');
        await chat!.terminal.sendKey('ctrl+j');
        await chat!.terminal.writeText('BBB');
        await chat!.terminal.sendKey('ctrl+j');
        await chat!.terminal.writeText('CCC');

        await chat!.terminal.waitForMatch(/CCC/, 5000);

        // Navigate up two lines — cursor should be on the AAA line
        await chat!.terminal.sendKey('up');
        await chat!.terminal.sendKey('up');
        await chat!.terminal.writeText('!');
        await chat!.terminal.waitForMatch(/AAA!/, 5000);

        // Navigate down one line to BBB, jump to start, insert marker
        await chat!.terminal.sendKey('down');
        await chat!.terminal.sendKey('home');
        await chat!.terminal.writeText('%');
        await expect(chat!.terminal).toEventuallyMatchOutput(/%BBB/);
      }, 60000);
    });

    describe('when content is larger than the viewport', () => {
      it('constrains the input area so UI chrome remains visible', async () => {
        await chat!.terminal.writeText('line0');

        const newlineCount = SMALL_TERMINAL_ROWS + 5;
        await chat!.terminal.repeatKey('ctrl+j', newlineCount);

        await chat!.terminal.writeText('ENDMARKER');
        await expect(chat!.terminal).toEventuallyMatchOutput(/ENDMARKER/);
        await expect(chat!.terminal).toEventuallyMatchOutput(
          /Get help with code, planning, security/,
        );
      }, 60000);

      it('scrolls the viewport to follow the cursor when navigating up', async () => {
        await chat!.terminal.writeText('TOPLINE');

        const newlineCount = SMALL_TERMINAL_ROWS + 5;
        await chat!.terminal.repeatKey('ctrl+j', newlineCount);

        await chat!.terminal.writeText('BOTTOMLINE');

        await chat!.terminal.repeatKey('up', newlineCount);

        await expect(chat!.terminal).toEventuallyMatchOutput(/TOPLINE/);
      }, 60000);
    });
  });
});
