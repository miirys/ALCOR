import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestEnv, assertTestToken, getTestToken, INPUT_PLACEHOLDER } from './test_utils';
import { ChatPage } from './pages/chat_page';
import { type RecordedTestContext, recordedTest } from './recorded_test';

const TEST_TIMEOUT = 60000;

let tmpBase: string;

/**
 * Create a GLAB_CONFIG_DIR with a pre-populated prompt history file.
 *
 * The storage key must match the CLI's working directory. Since
 * `TmuxTerminalTest` defaults its tmux session cwd to `process.cwd()`
 * and the CLI's `--cwd` option defaults the same way, we use
 * `process.cwd()` as the key here.
 */
function createHistoryDir(historyItems: string[], workspacePath = process.cwd()): string {
  const glabConfigDir = mkdtempSync(join(tmpBase, 'glab-cfg-'));
  writeFileSync(
    join(glabConfigDir, 'duo-cli-prompt-history.json'),
    JSON.stringify({ [workspacePath]: historyItems }),
    { mode: 0o600 },
  );
  return glabConfigDir;
}

function createEmptyGlabConfigDir(): string {
  return mkdtempSync(join(tmpBase, 'glab-empty-'));
}

function launchCli(ctx: RecordedTestContext, glabConfigDir: string): ChatPage {
  return ctx.launchChat({
    cliOptions: { gitlabAuthToken: getTestToken() },
    env: createTestEnv({ GLAB_CONFIG_DIR: glabConfigDir }),
    cols: 120,
    rows: 30,
  });
}

describe('CLI Prompt History E2E', () => {
  const ctx = recordedTest();
  let chat: ChatPage;

  beforeAll(() => {
    assertTestToken();
    tmpBase = mkdtempSync(join(tmpdir(), 'duo-prompt-history-e2e-'));
  });

  afterAll(() => {
    if (tmpBase) rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('up/down arrow navigation', () => {
    it(
      'navigates through history with up/down arrows',
      async () => {
        const glabConfigDir = createHistoryDir(['hello world', 'second message']);
        chat = launchCli(ctx, glabConfigDir);
        await chat.waitForInitialisation();
        await chat.waitForWelcomeMessage();
        await chat.waitForInputReady();

        // Up shows most recent item
        await chat.terminal.sendKey('up');
        await expect(chat.terminal).toEventuallyMatchOutput(/second message/);

        // Up again shows oldest item
        await chat.terminal.sendKey('up');
        await expect(chat.terminal).toEventuallyMatchOutput(/hello world/);

        // Down returns to more recent item
        await chat.terminal.sendKey('down');
        await expect(chat.terminal).toEventuallyMatchOutput(/second message/);

        // Down again clears input back to placeholder
        await chat.terminal.sendKey('down');
        await expect(chat.terminal).toEventuallyMatchOutput(INPUT_PLACEHOLDER);
      },
      TEST_TIMEOUT,
    );

    it(
      'pressing up with empty history does not change the input',
      async () => {
        const glabConfigDir = createEmptyGlabConfigDir();
        chat = launchCli(ctx, glabConfigDir);
        await chat.waitForInitialisation();
        await chat.waitForWelcomeMessage();
        await chat.waitForInputReady();

        await chat.terminal.sendKey('up');
        await expect(chat.terminal).toEventuallyMatchOutput(INPUT_PLACEHOLDER);
      },
      TEST_TIMEOUT,
    );
  });

  describe('ctrl+r history search', () => {
    it(
      'searches, filters, selects, and dismisses history',
      async () => {
        const glabConfigDir = createHistoryDir(['fix the bug', 'write a test', 'explain code']);
        chat = launchCli(ctx, glabConfigDir);
        await chat.waitForInitialisation();
        await chat.waitForWelcomeMessage();

        // Open search and filter
        const search = await chat.openHistorySearch();
        await search.search('test');
        await search.waitForResult(/write a test/);
        await search.waitForResultAbsent(/fix the bug/);
        await search.waitForResultAbsent(/explain code/);

        // Dismiss and verify we're back to normal input
        chat = await search.dismiss();
        await expect(chat.terminal).toEventuallyMatchOutput(INPUT_PLACEHOLDER);

        // Reopen, filter, and select
        const search2 = await chat.openHistorySearch();
        await search2.search('test');
        await search2.waitForResult(/write a test/);
        chat = await search2.selectFirst();
        await expect(chat.terminal).toEventuallyMatchOutput(/write a test/);
      },
      TEST_TIMEOUT,
    );

    it(
      'shows empty state message when history is empty',
      async () => {
        const glabConfigDir = createEmptyGlabConfigDir();
        chat = launchCli(ctx, glabConfigDir);
        await chat.waitForInitialisation();
        await chat.waitForWelcomeMessage();

        const search = await chat.openHistorySearch();
        await search.waitForEmptyStateMessage();
      },
      TEST_TIMEOUT,
    );
  });
});
