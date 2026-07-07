import { Injectable } from '@gitlab/needle';
import {
  DropdownProvider,
  getWordAtCursor,
  isWordAtLineStart,
  type CursorPosition,
  type DropdownItem,
} from '@gitlab-org/tui';
import { SlashCommandService } from '../slash_commands';

/**
 * Provides slash command items for the `/` trigger at the start of a line.
 */
@Injectable(DropdownProvider, [SlashCommandService])
export class SlashCommandDropdownProvider implements DropdownProvider {
  id = 'slash-command';

  #slashCommandService: SlashCommandService;

  constructor(slashCommandService: SlashCommandService) {
    this.#slashCommandService = slashCommandService;
  }

  async getItems(text: string, position: CursorPosition): Promise<DropdownItem[]> {
    const word = getWordAtCursor(text, position);
    if (!word.startsWith('/') || !isWordAtLineStart(text, position)) return [];

    const query = word.substring(1);
    return this.#slashCommandService.searchCommands(query).map(
      (cmd): DropdownItem => ({
        id: cmd.name,
        label: cmd.displayName,
        description: cmd.description,
        enabled: true,
        replaceWith: `${cmd.name} `,
        submitAfterSelect: true,
      }),
    );
  }
}
