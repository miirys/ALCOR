import type { ChatPage } from './chat_page';

export class HistorySearchPanel {
  static readonly #SEARCH_INPUT = /Type to filter history/;

  static readonly #NO_HISTORY = /No prompt history yet/;

  static readonly #NO_RESULTS = /No matching history items found/;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForOpen(): Promise<void> {
    await this.#chat.terminal.waitForMatch(HistorySearchPanel.#SEARCH_INPUT);
  }

  async waitForEmptyStateMessage(): Promise<void> {
    await this.#chat.terminal.waitForMatch(HistorySearchPanel.#NO_HISTORY);
  }

  async waitForNoMatchingResultsMessage(): Promise<void> {
    await this.#chat.terminal.waitForMatch(HistorySearchPanel.#NO_RESULTS);
  }

  async search(query: string): Promise<void> {
    await this.#chat.terminal.writeText(query);
  }

  async waitForResult(pattern: RegExp): Promise<void> {
    await this.#chat.terminal.waitForMatch(pattern);
  }

  async waitForResultAbsent(pattern: RegExp): Promise<void> {
    await this.#chat.terminal.waitForAbsence(pattern);
  }

  async selectFirst(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Enter');
    await this.#chat.terminal.waitForAbsence(HistorySearchPanel.#SEARCH_INPUT);
    return this.#chat;
  }

  async dismiss(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Escape');
    await this.#chat.terminal.waitForAbsence(HistorySearchPanel.#SEARCH_INPUT);
    return this.#chat;
  }
}
