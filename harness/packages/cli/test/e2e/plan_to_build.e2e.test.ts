import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getTestToken, assertTestToken, INPUT_PLACEHOLDER } from './test_utils';
import { ChatPage } from './pages/chat_page';
import { recordedTest } from './recorded_test';
import { ToolApprovalPrompt } from './pages/tool_approval_prompt';

const PLAN_PROMPT = "let's create a plan for adding a simple index.html to the project root";
const BUILD_PROMPT = 'implement';

const LONG_TIMEOUT = 300_000;
const WAIT_TIMEOUT = 120_000;

// The temp project below is a fresh `git init` repo with no GitLab remote, so
// project/namespace detection (needed to create a workflow) would otherwise
// fail with "404 Namespace Not Found". Give it an `origin` remote pointing at
// the same project the e2e job's QA token can access, matching how the CI job
// sets `origin` for the repo-root tests.
const GITLAB_REMOTE_URL = 'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp.git';

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('Plan-to-Build mode switch E2E (--developer)', () => {
  const ctx = recordedTest();
  let projectRoot: string;

  beforeAll(() => {
    assertTestToken();
  });

  beforeEach(() => {
    // The CLI's write tools reject paths outside a git repository, so the
    // project root must be an initialised repo.
    projectRoot = mkdtempSync(join(tmpdir(), 'duo-plan-build-'));
    execFileSync('git', ['init'], { cwd: projectRoot });
    execFileSync('git', ['config', 'user.email', 'e2e@example.com'], { cwd: projectRoot });
    execFileSync('git', ['config', 'user.name', 'E2E'], { cwd: projectRoot });
    execFileSync('git', ['remote', 'add', 'origin', GITLAB_REMOTE_URL], { cwd: projectRoot });
  });

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it(
    'plans in plan mode, then builds index.html after switching to build mode',
    async () => {
      const chat: ChatPage = ctx.launchChat({
        cliOptions: { gitlabAuthToken: getTestToken(), developer: true },
        cwd: projectRoot,
        cols: 120,
        rows: 40,
      });

      await chat.waitForWelcomeMessage();
      await chat.waitForInputReady();

      // Switch from the default build mode to plan mode via Tab.
      await chat.switchAgentMode('plan');
      await expect(chat.terminal).toEventuallyMatchOutput(/plan.*tab to switch/);

      // Ask Duo to produce a plan. Plan mode runs on the same developer flow as
      // build mode, so read-only tool calls still go through HITL approval —
      // approve them until the turn completes and the input is ready again.
      await chat.sendMessage(PLAN_PROMPT);
      await approveUntilInputReady(chat, WAIT_TIMEOUT);

      // Switch to build mode and ask Duo to implement the plan.
      await chat.switchAgentMode('build');
      await expect(chat.terminal).toEventuallyMatchOutput(/build.*tab to switch/);

      await chat.sendMessage(BUILD_PROMPT);

      // Approve any file-changing tool calls until index.html appears on disk.
      const indexPath = join(projectRoot, 'index.html');
      await approveUntilFileExists(chat, indexPath, LONG_TIMEOUT);

      expect(existsSync(indexPath)).toBe(true);
    },
    LONG_TIMEOUT,
  );
});

/**
 * Poll the terminal: whenever a tool-approval prompt is shown, approve it.
 * Resolves once the agent's turn completes and the input is ready again.
 * Throws on timeout.
 */
async function approveUntilInputReady(chat: ChatPage, timeout: number): Promise<void> {
  const approval = new ToolApprovalPrompt(chat);
  const start = Date.now();
  let started = false;

  while (Date.now() - start < timeout) {
    const output = chat.terminal.getOutput();
    const thinking = /GitLab Duo is thinking/.test(output);
    const approvalShown = ToolApprovalPrompt.APPROVE_OPTION.test(output);

    if (thinking || approvalShown) started = true;

    if (approvalShown) {
      // eslint-disable-next-line no-await-in-loop
      await approval.approve(WAIT_TIMEOUT);
    } else if (started && !thinking && INPUT_PLACEHOLDER.test(output)) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await waitMs(500);
  }

  throw new Error(`Timed out waiting for plan response after ${timeout}ms`);
}

/**
 * Poll the terminal: whenever a tool-approval prompt is shown, approve it.
 * Resolves as soon as `filePath` exists on disk. Throws on timeout.
 */
async function approveUntilFileExists(
  chat: ChatPage,
  filePath: string,
  timeout: number,
): Promise<void> {
  const approval = new ToolApprovalPrompt(chat);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (existsSync(filePath)) return;

    const output = chat.terminal.getOutput();
    if (ToolApprovalPrompt.APPROVE_OPTION.test(output)) {
      // eslint-disable-next-line no-await-in-loop
      await approval.approve(WAIT_TIMEOUT);
    }

    // eslint-disable-next-line no-await-in-loop
    await waitMs(500);
  }

  if (!existsSync(filePath)) {
    throw new Error(`Timed out waiting for ${filePath} to be created after ${timeout}ms`);
  }
}
