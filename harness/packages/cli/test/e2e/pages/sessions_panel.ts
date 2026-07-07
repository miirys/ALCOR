import type { ChatPage } from './chat_page';

export class SessionsPanel {
  static readonly #SESSIONS_SEARCH = /Type to search sessions/;

  static readonly #SESSIONS_CONTROLS = /to select|Esc.*cancel/;

  static readonly #LOAD_MORE = /Load more\.\.\./;

  static readonly #SCROLL_INDICATOR = /▼/;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForOpen(): Promise<void> {
    await this.#chat.terminal.waitForMatch(SessionsPanel.#SESSIONS_SEARCH);
    await this.#chat.terminal.waitForMatch(SessionsPanel.#SESSIONS_CONTROLS);
  }

  async search(query: string): Promise<void> {
    await this.#chat.terminal.writeText(query);
  }

  async selectFirst(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Enter');
    return this.#chat;
  }

  async scrollToLoadMore(itemCount: number): Promise<void> {
    await this.#chat.terminal.repeatKey('down', itemCount);
    await this.#chat.terminal.waitForMatch(SessionsPanel.#LOAD_MORE, 5000);
  }

  async selectLoadMore(): Promise<void> {
    await this.#chat.terminal.sendKey('Enter');
    await this.#chat.terminal.waitForMatch(SessionsPanel.#SCROLL_INDICATOR);
  }

  async dismiss(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Escape');
    return this.#chat;
  }
}
