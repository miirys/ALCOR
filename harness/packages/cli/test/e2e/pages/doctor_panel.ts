import type { ChatPage } from './chat_page';

export class DoctorPanel {
  static readonly #TITLE = /GitLab Duo CLI.*Diagnostics/;

  static readonly #CONTROLS = /Esc.*close/;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForOpen(): Promise<void> {
    await this.#chat.terminal.waitForMatch(DoctorPanel.#TITLE);
    await this.#chat.terminal.waitForMatch(DoctorPanel.#CONTROLS);
  }

  async dismiss(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Escape');
    return this.#chat;
  }

  getOutput(): string {
    return this.#chat.terminal.getFullOutput();
  }
}
