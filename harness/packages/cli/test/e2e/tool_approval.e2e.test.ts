import { getTestToken, assertTestToken } from './test_utils';
import { ChatPage } from './pages/chat_page';
import { type RecordedTestContext, recordedTest } from './recorded_test';
import { ToolApprovalPrompt } from './pages/tool_approval_prompt';

const TOOL_PROMPT =
  'Run the following shell command and tell me the output: `echo TOOL_APPROVAL_TEST_OK`';

const LONG_TIMEOUT = 180_000;
const WAIT_TIMEOUT = 90_000;

function launchChat(ctx: RecordedTestContext): ChatPage {
  return ctx.launchChat({
    cliOptions: { gitlabAuthToken: getTestToken() },
    cols: 120,
    rows: 40,
  });
}

describe('Tool Approval E2E', () => {
  const ctx = recordedTest();

  beforeAll(() => {
    assertTestToken();
  });

  describe('when the agent invokes a tool requiring approval', () => {
    let chat: ChatPage | undefined;

    it(
      'renders approval UI, navigates options, cancels a rejection, then approves',
      async () => {
        chat = launchChat(ctx);
        await chat.waitForWelcomeMessage();
        await chat.sendMessage(TOOL_PROMPT);

        const approval = new ToolApprovalPrompt(chat);
        await approval.waitForVisible(WAIT_TIMEOUT);

        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.APPROVE_OPTION);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.REJECT_OPTION);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.CONTROLS_HINT);

        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.SELECTED_APPROVE);
        await approval.selectReject();
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.SELECTED_REJECT);
        await approval.selectApprove();
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.SELECTED_APPROVE);

        await approval.reject(WAIT_TIMEOUT);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.REASON_PROMPT);

        await approval.cancelReason(WAIT_TIMEOUT);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.SELECTED_APPROVE);
        expect(chat.terminal.getOutput()).not.toMatch(ToolApprovalPrompt.REASON_PROMPT);

        await approval.approve(WAIT_TIMEOUT);
        await chat.waitForDuoResponse(undefined, WAIT_TIMEOUT);

        const fullOutput = chat.terminal.getFullOutput();
        expect(fullOutput).toContain('TOOL_APPROVAL_TEST_OK');
      },
      LONG_TIMEOUT,
    );

    it(
      'rejects a tool and skips the reason',
      async () => {
        chat = launchChat(ctx);
        await chat.waitForWelcomeMessage();
        await chat.sendMessage(TOOL_PROMPT);

        const approval = new ToolApprovalPrompt(chat);
        await approval.waitForVisible(WAIT_TIMEOUT);

        await approval.reject(WAIT_TIMEOUT);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.REASON_PROMPT);

        await approval.skipReason(WAIT_TIMEOUT);
        await chat.waitForDuoResponse(undefined, WAIT_TIMEOUT);

        const fullOutput = chat.terminal.getFullOutput();
        const outputLines = fullOutput.split('\n').map((l) => l.trim());
        const markerAsOutput = outputLines.some((line) => line === 'TOOL_APPROVAL_TEST_OK');
        expect(markerAsOutput).toBe(false);
      },
      LONG_TIMEOUT,
    );

    it(
      'rejects a tool with a reason',
      async () => {
        chat = launchChat(ctx);
        await chat.waitForWelcomeMessage();
        await chat.sendMessage(TOOL_PROMPT);

        const approval = new ToolApprovalPrompt(chat);
        await approval.waitForVisible(WAIT_TIMEOUT);

        await approval.reject(WAIT_TIMEOUT);
        await expect(chat.terminal).toEventuallyMatchOutput(ToolApprovalPrompt.REASON_PROMPT);

        await approval.submitReason('too dangerous', WAIT_TIMEOUT);
        await chat.waitForDuoResponse(undefined, WAIT_TIMEOUT);

        const fullOutput = chat.terminal.getFullOutput();
        const outputLines = fullOutput.split('\n').map((l) => l.trim());
        const markerAsOutput = outputLines.some((line) => line === 'TOOL_APPROVAL_TEST_OK');
        expect(markerAsOutput).toBe(false);
      },
      LONG_TIMEOUT,
    );
  });
});
