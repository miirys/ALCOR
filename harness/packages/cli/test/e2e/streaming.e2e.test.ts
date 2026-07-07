import { getTestToken } from './test_utils';
import { recordedTest, type RecordedTestContext } from './recorded_test';

const STREAMING_PROMPT =
  'Explain in exhaustive detail, using only plain text and no tools, every step of how a modern CPU executes a single addition instruction from fetch through writeback. Be extremely thorough — aim for at least 1000 words.';

const TEST_TIMEOUT = 90000;

// Use a wide terminal so the status bar hint renders on a single line
// and regex matching works correctly against captured pane output.
function launchChat(ctx: RecordedTestContext) {
  return ctx.launchChat({
    cliOptions: { gitlabAuthToken: getTestToken() },
    cols: 220,
  });
}

describe('CLI Streaming E2E', () => {
  const ctx = recordedTest();

  describe('when Escape is pressed during streaming', () => {
    describe('when pressed once', () => {
      it(
        'shows the confirm cancel hint without cancelling',
        async () => {
          const chat = launchChat(ctx);

          await chat.waitForWelcomeMessage();
          await chat.waitForInputReady();

          await chat.sendMessage(STREAMING_PROMPT);
          await chat.waitForEscCancelHint();

          await chat.terminal.sendKey('escape');
          await chat.waitForEscConfirmHint();

          expect(chat.terminal.getOutput()).toMatch(/Esc again to confirm cancel/);
        },
        TEST_TIMEOUT,
      );
    });

    describe('when pressed twice within 3 seconds', () => {
      it(
        'cancels the response and returns to input ready',
        async () => {
          const chat = launchChat(ctx);

          await chat.waitForWelcomeMessage();
          await chat.waitForInputReady();

          await chat.sendMessage(STREAMING_PROMPT);
          await chat.waitForEscCancelHint();

          await chat.terminal.sendKey('escape');
          await chat.terminal.sendKey('escape');
          await chat.waitForInputReady();

          expect(chat.terminal.getOutput()).not.toMatch(/Esc again to confirm cancel/);
        },
        TEST_TIMEOUT,
      );
    });

    describe('when not pressed again within 3 seconds', () => {
      it(
        'reverts the confirm hint and does not cancel streaming',
        async () => {
          const chat = launchChat(ctx);

          await chat.waitForWelcomeMessage();
          await chat.waitForInputReady();

          await chat.sendMessage(STREAMING_PROMPT);
          await chat.waitForEscCancelHint();

          await chat.terminal.sendKey('escape');
          await chat.waitForEscConfirmHint();

          await new Promise<void>((resolve) => {
            setTimeout(resolve, 3500);
          });

          await chat.waitForEscConfirmHintAbsence();

          expect(chat.terminal.getOutput()).toMatch(/Esc to cancel/);
          expect(chat.terminal.getOutput()).toMatch(/GitLab Duo is thinking/);
        },
        TEST_TIMEOUT,
      );
    });
  });
});
