import type { ChatPage } from './chat_page';

export class SettingsPanel {
  static readonly #TITLE = /Settings/;

  static readonly #CONTROLS = /navigate.*change.*Esc/i;

  static readonly #TELEMETRY_DESC = /Send anonymous usage data/;

  static readonly #GLOBAL_SKILLS_DESC = /Discover global agent skills/;

  #chat: ChatPage;

  constructor(chat: ChatPage) {
    this.#chat = chat;
  }

  async waitForOpen(): Promise<void> {
    await this.#chat.terminal.waitForMatch(SettingsPanel.#TITLE);
    await this.#chat.terminal.waitForMatch(SettingsPanel.#CONTROLS);
  }

  async navigateDown(): Promise<void> {
    await this.#chat.terminal.sendKey('down');
  }

  async navigateUp(): Promise<void> {
    await this.#chat.terminal.sendKey('up');
  }

  async toggle(): Promise<void> {
    await this.#chat.terminal.sendKey('Enter');
  }

  async dismiss(): Promise<ChatPage> {
    await this.#chat.terminal.sendKey('Escape');
    return this.#chat;
  }

  getOutput(): string {
    return this.#chat.terminal.getOutput();
  }

  async waitForTelemetryDescription(): Promise<void> {
    await this.#chat.terminal.waitForMatch(SettingsPanel.#TELEMETRY_DESC);
  }

  async waitForGlobalSkillsDescription(): Promise<void> {
    await this.#chat.terminal.waitForMatch(SettingsPanel.#GLOBAL_SKILLS_DESC);
  }
}
