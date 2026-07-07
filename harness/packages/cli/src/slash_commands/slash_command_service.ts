import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { CommandComponentRegistry } from '@gitlab-org/tui';
import type { ControllerApi } from '../commands/tui/controller_api';
import { SlashCommandHandler, type SlashCommand } from './slash_command_handler';

export interface SearchResult {
  name: string;
  displayName: string;
  description: string;
}

export interface SlashCommandService {
  getCommands(): SlashCommand[];

  isCommand(prompt: string): boolean;

  execute(prompt: string, api: ControllerApi): Promise<void>;

  searchCommands(query: string): SearchResult[];

  isDynamicCommand(prompt: string): boolean;

  registerDynamicCommands(commands: SlashCommand[]): void;

  removeDynamicCommands(): void;

  /**
   * Builds a CommandComponentRegistry by collecting each handler's registered
   * component and callbacks, keyed by the handler's inputType.
   * Used by TUIController to pass the registry to the TUI App.
   */
  buildComponentRegistry(api: ControllerApi): CommandComponentRegistry;
}

export const SlashCommandService = createInterfaceId<SlashCommandService>('SlashCommandService');

@Injectable(SlashCommandService, [Logger, collection(SlashCommandHandler)])
export class DefaultSlashCommandService implements SlashCommandService {
  #logger: Logger;

  #commands: Map<string, SlashCommand> = new Map();

  #dynamicCommands: Map<string, SlashCommand> = new Map();

  #aliases: Map<string, string> = new Map();

  #handlers: Map<string, SlashCommandHandler> = new Map();

  constructor(logger: Logger, handlers: SlashCommandHandler[]) {
    this.#logger = withPrefix(logger, '[SlashCommandService]');
    this.#registerHandlers(handlers);
  }

  #registerHandlers(handlers: SlashCommandHandler[]): void {
    handlers.forEach((handler) => {
      this.#evictCollidingAlias(handler.command.name);
      this.#commands.set(handler.command.name, handler.command);
      this.#handlers.set(handler.command.action, handler);
      this.#registerAliases(handler.command);
      this.#logger.debug(
        `Registered slash command: ${handler.command.name} (action: ${handler.command.action})`,
      );
    });
  }

  // Drop any alias whose key equals this command name. Symmetric to the
  // collision check in #registerAliases — without it, an alias registered
  // before its colliding command lingers in the map and surfaces as a
  // misleading display hint in the autocomplete dropdown.
  #evictCollidingAlias(name: string): void {
    const owner = this.#aliases.get(name);
    if (owner !== undefined) {
      this.#logger.warn(
        `Dropping alias "${name}" of ${owner}: conflicts with command name registered later`,
      );
      this.#aliases.delete(name);
    }
  }

  #registerAliases(command: SlashCommand): void {
    command.aliases?.forEach((alias) => {
      if (!alias.startsWith('/') || /\s/.test(alias)) {
        this.#logger.warn(
          `Skipping alias "${alias}" for ${command.name}: invalid name (must start with / and contain no whitespace)`,
        );
        return;
      }
      if (this.#commands.has(alias) || this.#dynamicCommands.has(alias)) {
        this.#logger.warn(
          `Skipping alias "${alias}" for ${command.name}: conflicts with a command name`,
        );
        return;
      }
      if (this.#aliases.has(alias)) {
        this.#logger.warn(`Skipping alias "${alias}" for ${command.name}: alias already in use`);
        return;
      }
      this.#aliases.set(alias, command.name);
    });
  }

  #resolveCommandName(name: string): string {
    if (this.#commands.has(name) || this.#dynamicCommands.has(name)) return name;
    return this.#aliases.get(name) ?? name;
  }

  getCommands(): SlashCommand[] {
    return [
      ...Array.from(this.#commands.values()),
      ...Array.from(this.#dynamicCommands.values()),
    ].filter((command) => !command.internal);
  }

  isCommand(prompt: string): boolean {
    const trimmed = prompt.trim();

    if (!trimmed.startsWith('/')) {
      return false;
    }

    const parts = trimmed.split(/\s+/);
    const commandName = this.#resolveCommandName(parts[0]);

    return this.#commands.has(commandName) || this.#dynamicCommands.has(commandName);
  }

  async execute(prompt: string, api: ControllerApi): Promise<void> {
    const trimmed = prompt.trim();
    const parts = trimmed.split(/\s+/);
    const commandName = this.#resolveCommandName(parts[0]);
    const args = parts.slice(1);

    const isDynamic = this.#dynamicCommands.has(commandName);
    const command = this.#commands.get(commandName) || this.#dynamicCommands.get(commandName);

    if (!command) {
      throw new Error(`Unknown command: ${parts[0]}`);
    }

    this.#logger.info(`Executing slash command: ${command.name} (action: ${command.action})`);

    const handler = this.#handlers.get(command.action);
    if (!handler) {
      throw new Error(`No handler registered for action: ${command.action}`);
    }

    let effectiveArgs: string[] | undefined;
    if (isDynamic) {
      effectiveArgs = [commandName.slice(1), ...args];
    } else if (args.length > 0) {
      effectiveArgs = args;
    }

    await handler.execute(api, effectiveArgs);
  }

  isDynamicCommand(prompt: string): boolean {
    const trimmed = prompt.trim();
    if (!trimmed.startsWith('/')) return false;
    const commandName = this.#resolveCommandName(trimmed.split(/\s+/)[0]);
    return this.#dynamicCommands.has(commandName);
  }

  registerDynamicCommands(commands: SlashCommand[]): void {
    commands.forEach((command) => {
      if (!command.name.startsWith('/') || /\s/.test(command.name)) {
        this.#logger.warn(
          `Skipping dynamic command "${command.name}": invalid name (must start with / and contain no whitespace)`,
        );
        return;
      }
      if (this.#commands.has(command.name)) {
        this.#logger.debug(
          `Skipping dynamic command ${command.name}: conflicts with built-in command`,
        );
        return;
      }
      this.#evictCollidingAlias(command.name);
      this.#dynamicCommands.set(command.name, command);
      this.#logger.debug(`Registered dynamic slash command: ${command.name}`);
    });
  }

  removeDynamicCommands(): void {
    this.#dynamicCommands.clear();
  }

  buildComponentRegistry(api: ControllerApi): CommandComponentRegistry {
    const registry: CommandComponentRegistry = new Map();
    for (const handler of this.#handlers.values()) {
      if (handler.getComponent) {
        const { inputType, component, callbacks, footerHint } = handler.getComponent(api);
        registry.set(inputType, { component, callbacks, footerHint });
      }
    }
    return registry;
  }

  searchCommands(query: string): SearchResult[] {
    const allCommands = this.getCommands();

    if (!query) {
      return allCommands
        .map((cmd) => this.#createSearchResult(cmd))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const lowerQuery = this.#stripSlash(query).toLowerCase();
    const descRegex = this.#buildDescriptionRegex(lowerQuery);

    return allCommands
      .map((cmd) => this.#scoreCommand(cmd, lowerQuery, descRegex))
      .filter(({ score }) => score !== Infinity)
      .sort(this.#compareCommandResults)
      .map(({ cmd, matchedAlias }) => this.#createSearchResult(cmd, matchedAlias));
  }

  #stripSlash(s: string): string {
    return s.startsWith('/') ? s.slice(1) : s;
  }

  // Single-character queries should only match command names; longer queries
  // fall through to a word-boundary description match.
  #buildDescriptionRegex(lowerQuery: string): RegExp | null {
    if (lowerQuery.length < 2) return null;
    return new RegExp(`(?:^|\\s)${lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  }

  #scoreCommand(
    cmd: SlashCommand,
    lowerQuery: string,
    descRegex: RegExp | null,
  ): { cmd: SlashCommand; score: number; matchedAlias?: string } {
    const nameMatch = this.#stripSlash(cmd.name).toLowerCase();
    const descMatch = cmd.description.toLowerCase();

    const nameMatches = nameMatch.startsWith(lowerQuery);
    // Only look up an alias when the canonical name doesn't already prefix-match,
    // and only consider aliases that resolved to *this* command at registration —
    // rejected/colliding aliases must not surface as display hints.
    const matchedAlias = nameMatches
      ? undefined
      : this.#findBestMatchingAlias(this.#registeredAliasesFor(cmd), lowerQuery);

    // Calculate priority score (lower = better)
    let score = Infinity;

    if (nameMatches || matchedAlias !== undefined) {
      // Prefix match on name or alias (highest priority)
      score = 0;
    } else if (nameMatch.includes(lowerQuery)) {
      // Substring match on name
      score = 1;
    } else if (descRegex !== null && descRegex.test(descMatch)) {
      // Description word-boundary match (lowest priority)
      score = 2;
    }

    return { cmd, score, matchedAlias };
  }

  #registeredAliasesFor(cmd: SlashCommand): readonly string[] | undefined {
    return cmd.aliases?.filter((alias) => this.#aliases.get(alias) === cmd.name);
  }

  // Shortest match wins: longer aliases sharing the prefix surface as the user types more.
  #findBestMatchingAlias(
    aliases: readonly string[] | undefined,
    lowerQuery: string,
  ): string | undefined {
    return aliases
      ?.filter((alias) => this.#stripSlash(alias).toLowerCase().startsWith(lowerQuery))
      .sort((a, b) => this.#stripSlash(a).length - this.#stripSlash(b).length)[0];
  }

  #compareCommandResults(
    a: { cmd: SlashCommand; score: number },
    b: { cmd: SlashCommand; score: number },
  ): number {
    // Sort by score, then alphabetically by name
    if (a.score !== b.score) return a.score - b.score;
    return a.cmd.name.localeCompare(b.cmd.name);
  }

  #formatCommandName(cmd: SlashCommand, matchedAlias?: string): string {
    if (matchedAlias === undefined) return cmd.name;
    return `${cmd.name} (${this.#stripSlash(matchedAlias)})`;
  }

  #createSearchResult(cmd: SlashCommand, matchedAlias?: string): SearchResult {
    return {
      name: cmd.name,
      displayName: this.#formatCommandName(cmd, matchedAlias),
      description: cmd.description,
    };
  }
}
