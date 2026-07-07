import type { ChatPage } from './chat_page';

export class ToolApprovalPrompt {
  static readonly APPROVE_OPTION = /Approve/;

  static readonly REJECT_OPTION = /Reject/;

  // Selected state patterns (› indicates selection in the TUI)
  static readonly SELECTED_APPROVE = /›\s+Approve(?!\s+for\s+[Ss]ession)/;

  static readonly SELECTED_SESSION = /›\s+Approve for [Ss]ession/;

  static readonly SELECTED_REJECT = /›\s+Reject/;

  static readonly CONTROLS_HINT = /arrows to navigate/;

  static readonly REASON_PROMPT = /Reason for rejecting .+ \(optional, Enter to skip\):/;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForVisible(timeout?: number): Promise<void> {
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.APPROVE_OPTION, timeout);
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.REJECT_OPTION, timeout);
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.CONTROLS_HINT, timeout);
  }

  async waitForDismissed(timeout?: number): Promise<void> {
    await this.#chat.terminal.waitForAbsence(ToolApprovalPrompt.APPROVE_OPTION, timeout);
  }

  async expectApproveSelected(): Promise<void> {
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.SELECTED_APPROVE);
  }

  async expectRejectSelected(): Promise<void> {
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.SELECTED_REJECT);
  }

  /**
   * Selects "Approve" option using state-based navigation.
   * Checks current selection and navigates accordingly, making this robust
   * to changes in option order or number of options.
   */
  async selectApprove(): Promise<void> {
    const output = this.#chat.terminal.getOutput();

    // Already on Approve? Done.
    if (ToolApprovalPrompt.SELECTED_APPROVE.test(output)) {
      return;
    }

    // Currently on "Approve for Session"? Go up once.
    if (ToolApprovalPrompt.SELECTED_SESSION.test(output)) {
      await this.#chat.terminal.sendKey('up');
      await this.expectApproveSelected();
      return;
    }

    // Currently on "Reject"? Go up twice (assuming 3 options: Approve, Session, Reject).
    if (ToolApprovalPrompt.SELECTED_REJECT.test(output)) {
      await this.#chat.terminal.sendKey('up');
      await this.#chat.terminal.sendKey('up');
      await this.expectApproveSelected();
      return;
    }

    // Unknown state - try going up until we find Approve (with safety limit)
    await this.#navigateUntilSelected('up', ToolApprovalPrompt.SELECTED_APPROVE, 5);
    if (!this.#isSelected(ToolApprovalPrompt.SELECTED_APPROVE)) {
      throw new Error('Could not navigate to Approve option');
    }
  }

  /**
   * Selects "Reject" option using state-based navigation.
   * Checks current selection and navigates accordingly, making this robust
   * to changes in option order or number of options.
   */
  async selectReject(): Promise<void> {
    const output = this.#chat.terminal.getOutput();

    // Already on Reject? Done.
    if (ToolApprovalPrompt.SELECTED_REJECT.test(output)) {
      return;
    }

    // Currently on "Approve for Session"? Go down once.
    if (ToolApprovalPrompt.SELECTED_SESSION.test(output)) {
      await this.#chat.terminal.sendKey('down');
      await this.expectRejectSelected();
      return;
    }

    // Currently on "Approve"? Go down twice (assuming 3 options: Approve, Session, Reject).
    if (ToolApprovalPrompt.SELECTED_APPROVE.test(output)) {
      await this.#chat.terminal.sendKey('down');
      await this.#chat.terminal.sendKey('down');
      await this.expectRejectSelected();
      return;
    }

    // Unknown state - try going down until we find Reject (with safety limit)
    await this.#navigateUntilSelected('down', ToolApprovalPrompt.SELECTED_REJECT, 5);
    if (!this.#isSelected(ToolApprovalPrompt.SELECTED_REJECT)) {
      throw new Error('Could not navigate to Reject option');
    }
  }

  async approve(timeout?: number): Promise<ChatPage> {
    await this.expectApproveSelected();
    await this.#chat.terminal.sendKey('enter');
    await this.waitForDismissed(timeout);
    return this.#chat;
  }

  async reject(timeout?: number): Promise<void> {
    await this.selectReject();
    await this.#chat.terminal.sendKey('enter');
    await this.#waitForReasonPrompt(timeout);
  }

  async submitReason(reason: string, timeout?: number): Promise<ChatPage> {
    await this.#chat.terminal.writeText(reason);
    await this.#chat.terminal.sendKey('enter');
    await this.#waitForReasonClosed(timeout);
    return this.#chat;
  }

  async skipReason(timeout?: number): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('enter');
    await this.#waitForReasonClosed(timeout);
    return this.#chat;
  }

  async cancelReason(timeout?: number): Promise<void> {
    await this.#chat.terminal.sendKey('escape');
    await this.waitForVisible(timeout);
  }

  async rejectAndSkipReason(timeout?: number): Promise<ChatPage> {
    await this.reject(timeout);
    return this.skipReason(timeout);
  }

  async rejectWithReason(reason: string, timeout?: number): Promise<ChatPage> {
    await this.reject(timeout);
    return this.submitReason(reason, timeout);
  }

  #isSelected(pattern: RegExp): boolean {
    return pattern.test(this.#chat.terminal.getOutput());
  }

  /**
   * Helper to navigate in a direction until a pattern is found, with a limit.
   * Avoids await-in-loop by using recursive promises.
   */
  async #navigateUntilSelected(
    direction: 'up' | 'down',
    pattern: RegExp,
    maxAttempts: number,
  ): Promise<void> {
    const navigate = async (remaining: number): Promise<void> => {
      if (remaining <= 0) return;
      if (this.#isSelected(pattern)) return;

      await this.#chat.terminal.sendKey(direction);
      if (this.#isSelected(pattern)) return;

      await navigate(remaining - 1);
    };

    await navigate(maxAttempts);
  }

  async #waitForReasonPrompt(timeout?: number): Promise<void> {
    await this.#chat.terminal.waitForMatch(ToolApprovalPrompt.REASON_PROMPT, timeout);
  }

  async #waitForReasonClosed(timeout?: number): Promise<void> {
    await this.#chat.terminal.waitForAbsence(ToolApprovalPrompt.REASON_PROMPT, timeout);
  }
}
