import type { ChatPage } from './chat_page';

export class McpPanel {
  static readonly #TITLE = /MCP Servers/;

  static readonly #LIST_CONTROLS = /navigate.*select.*close/;

  static readonly #DETAIL_CONTROLS = /Esc.*back/;

  static readonly #EMPTY_STATE = /No MCP servers configured/;

  static readonly #DETAIL_TOOLS_HEADING = /Tools \(\d+\)/;

  static readonly #CONFIG_ROW = {
    'Create:project': /Create:.*\(project\)/,
    'Create:user': /Create:.*\(user\)/,
    'Open:project': /Open:.*\(project\)/,
    'Open:user': /Open:.*\(user\)/,
  } as const;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForOpen(): Promise<void> {
    await this.#chat.terminal.waitForMatch(McpPanel.#TITLE);
    await this.#chat.terminal.waitForMatch(McpPanel.#LIST_CONTROLS, { visibleOnly: true });
  }

  async waitForConfigRow(action: 'Create' | 'Open', label: 'project' | 'user'): Promise<void> {
    await this.#chat.terminal.waitForMatch(McpPanel.#CONFIG_ROW[`${action}:${label}`]);
  }

  async waitForEmptyState(): Promise<void> {
    await this.#chat.terminal.waitForMatch(McpPanel.#EMPTY_STATE, { visibleOnly: true });
  }

  async waitForEmptyStateAbsence(): Promise<void> {
    await this.#chat.terminal.waitForAbsence(McpPanel.#EMPTY_STATE);
  }

  async waitForServerListed(name: string): Promise<void> {
    await this.#chat.terminal.waitForMatch(name);
  }

  async waitForServerDetail(): Promise<void> {
    await this.#chat.terminal.waitForMatch(McpPanel.#DETAIL_TOOLS_HEADING, { visibleOnly: true });
    await this.#chat.terminal.waitForMatch(McpPanel.#DETAIL_CONTROLS, { visibleOnly: true });
  }

  async waitForError(pattern: RegExp): Promise<void> {
    await this.#chat.terminal.waitForMatch(pattern, { visibleOnly: true });
  }

  async select(): Promise<void> {
    await this.#chat.terminal.sendKey('Enter');
  }

  async back(): Promise<void> {
    await this.#chat.terminal.sendKey('Escape');
  }

  async dismiss(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Escape');
    return this.#chat;
  }

  getOutput(): string {
    return this.#chat.terminal.getOutput();
  }
}
