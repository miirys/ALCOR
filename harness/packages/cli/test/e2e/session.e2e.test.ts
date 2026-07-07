import { randomUUID } from 'node:crypto';
import { getTestToken } from './test_utils';
import { ChatPage } from './pages/chat_page';
import { recordedTest } from './recorded_test';

const WAIT_TIMEOUT = 60000;

/**
 * Random alphabetic string derived from UUIDs. GitLab's workflow search
 * tokenizes on hyphens and ignores tokens starting with a digit, so we use a
 * purely alpha string to reliably to create a unique, searchable marker.
 */
function randomAlpha(length = 12): string {
  let alpha = '';
  while (alpha.length < length) {
    alpha += randomUUID().replace(/[0-9-]/g, '');
  }
  return alpha.slice(0, length);
}

describe('CLI Sessions E2E', () => {
  const ctx = recordedTest();
  let chat: ChatPage;

  beforeEach(async () => {
    chat = ctx.launchChat({
      cliOptions: { gitlabAuthToken: getTestToken() },
      cols: 120,
      rows: 100,
    });
    await chat.waitForInitialisation();
  }, WAIT_TIMEOUT * 2);

  describe('session lifecycle', () => {
    it('sends messages, creates new session, browses session history, and rehydrates a session', async () => {
      // Unique marker lets us find this exact session later via search.
      const uniqueMarker = `e2e-session-${randomAlpha()}`;

      await chat.sendMessage(`Say the following back to me verbatim: "${uniqueMarker}"`);
      await chat.waitForDuoResponse(new RegExp(uniqueMarker));

      await chat.submitSlashCommand('/new');
      await chat.waitForDuoResponse(/Hi!/);

      await chat.sendMessage('What is 2 + 2?');
      await chat.waitForDuoResponse();

      const sessions = await chat.openSessionsPanel();
      await sessions.waitForOpen();

      await sessions.search(uniqueMarker);

      await chat.terminal.waitForMatch(new RegExp(`${uniqueMarker}.*#\\d+`), WAIT_TIMEOUT);

      const rehydrated = await sessions.selectFirst();

      await rehydrated.terminal.waitForMatch(new RegExp(uniqueMarker), WAIT_TIMEOUT);

      const output = rehydrated.terminal.getOutput();
      expect(output).not.toMatch(/Type to search sessions/);
    }, 180000);
  });

  describe('session history navigation', () => {
    it('opens /sessions and can dismiss with Escape', async () => {
      const sessions = await chat.openSessionsPanel();
      await sessions.waitForOpen();

      const dismissed = await sessions.dismiss();

      await dismissed.waitForInputReady();
    }, 60000);

    it('scrolls to bottom and loads more sessions', async () => {
      const sessions = await chat.openSessionsPanel();
      await sessions.waitForOpen();

      await sessions.scrollToLoadMore(51);
      await sessions.selectLoadMore();

      await sessions.dismiss();
    }, 60000);

    it('shows "No matching sessions found" for nonsense search', async () => {
      const sessions = await chat.openSessionsPanel();
      await sessions.waitForOpen();

      await sessions.search(`zzz-nonexistent-${randomUUID()}`);

      await chat.terminal.waitForMatch(/No matching sessions found/, WAIT_TIMEOUT);

      await sessions.dismiss();
    }, 60000);
  });
});
