import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestEnv, getTestToken } from './test_utils';
import { recordedTest } from './recorded_test';
import type { ChatPage } from './pages/chat_page';
import type { McpPanel } from './pages/mcp_panel';

const SERVER_NAME = 'e2e-test-server';
const EDITED_CONFIG = JSON.stringify({
  mcpServers: { [SERVER_NAME]: { type: 'stdio', command: 'echo' } },
});

const NOT_FOUND_EDITOR = 'duo-no-such-editor-xyz';

let tmpBase: string;

function projectConfigPath(workspaceDir: string): string {
  return join(workspaceDir, '.gitlab', 'duo', 'mcp.json');
}

function userConfigPath(xdgConfigHome: string): string {
  return join(xdgConfigHome, 'gitlab', 'duo', 'mcp.json');
}

/** A throwaway temp dir, used both as the CLI `--cwd` and as scratch space. */
function createWorkspaceDir(): string {
  return mkdtempSync(join(tmpBase, 'ws-'));
}

/**
 * A stand-in editor that writes `contents` to the file it's handed and exits 0,
 * so the spawn round-trip runs without a real editor on the runner.
 */
function createFakeEditor(contents: string): string {
  const scriptPath = join(createWorkspaceDir(), 'fake-editor.sh');
  const script = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cat > "$1" <<'EOF'`,
    contents,
    'EOF',
    '',
  ].join('\n');
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/**
 * These tests start from the empty state, so a pre-existing config (e.g. on a
 * workstation rather than a clean CI runner) will fail them. Warn rather than
 * touch the file.
 */
function warnIfConfigExists(...paths: string[]): void {
  for (const configPath of paths) {
    if (existsSync(configPath)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[mcp.e2e] MCP config detected at ${configPath}. These e2e tests expect a ` +
          `clean environment (no pre-existing MCP config) and will likely fail.`,
      );
    }
  }
}

/**
 * Env overrides that point HOME and XDG_CONFIG_HOME at temp dirs, so the real
 * user-scoped config can't leak in, set $EDITOR, and unset stray auth env (the
 * token comes from ChatPage via GITLAB_TOKEN).
 */
function mcpEnv(editor: string, xdgConfigHome: string): Record<string, string> {
  const home = createWorkspaceDir();
  return createTestEnv({
    HOME: home,
    XDG_CONFIG_HOME: xdgConfigHome,
    GITLAB_LSP_STORAGE_DIR: home,
    EDITOR: editor,
    VISUAL: '',
    GITLAB_OAUTH_TOKEN: '',
  });
}

describe('MCP TUI E2E', () => {
  const ctx = recordedTest();

  beforeAll(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'duo-mcp-e2e-'));
  });

  afterAll(() => {
    if (tmpBase) rmSync(tmpBase, { recursive: true, force: true });
  });

  /**
   * Launch the CLI in an isolated temp workspace + config home, with the given
   * `$EDITOR`, and open the MCP panel. Returns the project config path for
   * on-disk assertions.
   * We use an isolated environment so we can clobber mcp.json files without
   * impacting peoples actual configs when running tests locally.
   */
  async function openMcpPanelWith(
    editor: string,
  ): Promise<{ chat: ChatPage; mcp: McpPanel; configPath: string }> {
    const workspace = createWorkspaceDir();
    const xdgConfigHome = createWorkspaceDir();
    const configPath = projectConfigPath(workspace);

    warnIfConfigExists(configPath, userConfigPath(xdgConfigHome));

    const chat = ctx.launchChat({
      cliOptions: { gitlabAuthToken: getTestToken(), cwd: workspace },
      env: mcpEnv(editor, xdgConfigHome),
      cols: 120,
      rows: 40,
    });
    await chat.waitForInputReady();

    const mcp = await chat.openMcpPanel();
    return { chat, mcp, configPath };
  }

  describe('empty state, editing config, and reload', () => {
    it('opens empty, edits config via $EDITOR, reloads, and navigates server detail', async () => {
      const { chat, mcp, configPath } = await openMcpPanelWith(createFakeEditor(EDITED_CONFIG));

      // Empty state: no servers configured, and the project config shows
      // "Create" because the file doesn't exist yet.
      await mcp.waitForEmptyState();
      await mcp.waitForConfigRow('Create', 'project');

      // With no servers, index 0 is the first config row (project) — select
      // it directly. The fake editor writes a server config to the file.
      await mcp.select();

      // Reload effect: the empty-state message clears, the new server is
      // listed, and the config row offers to "Open" the file that now exists.
      await mcp.waitForServerListed(SERVER_NAME);
      await mcp.waitForEmptyStateAbsence();
      await mcp.waitForConfigRow('Open', 'project');

      // The editor actually wrote the file we expected.
      expect(existsSync(configPath)).toBe(true);
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(JSON.parse(EDITED_CONFIG));
      expect(mcp.getOutput()).toMatch(new RegExp(SERVER_NAME));

      // The panel reset to index 0 on reload, which is now the server row —
      // select it to open the detail view, then back out.
      await mcp.select();
      await mcp.waitForServerDetail();

      await mcp.back();
      await mcp.waitForOpen();

      await mcp.dismiss();
      await chat.waitForInputReady();
    }, 90000);
  });

  describe('when $EDITOR cannot be found', () => {
    it('surfaces an error on the panel and does not reload', async () => {
      const { mcp } = await openMcpPanelWith(NOT_FOUND_EDITOR);
      await mcp.waitForEmptyState();
      await mcp.waitForConfigRow('Create', 'project');

      // Index 0 is the project config row — select it directly.
      await mcp.select();

      await mcp.waitForError(new RegExp(`Editor "${NOT_FOUND_EDITOR}" not found`));
      expect(mcp.getOutput()).toMatch(/Set \$VISUAL or \$EDITOR/);
    }, 90000);
  });
});
