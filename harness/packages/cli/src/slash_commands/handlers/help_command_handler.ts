import { Injectable } from '@gitlab/needle';
import {
  CLI_INPUT_TYPES,
  HelpDialog,
  helpFooterHint,
  type HelpDialogCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { HelpController } from '../../help';
import { SlashCommandHandler, type CommandComponentEntry } from '../slash_command_handler';

/**
 * Handler for the /help slash command.
 * Opens a help dialog showing available commands and keyboard shortcuts.
 */
@Injectable(SlashCommandHandler, [HelpController])
export class DefaultHelpCommandHandler implements SlashCommandHandler<HelpDialogCallbacks> {
  #helpController: HelpController;

  constructor(helpController: HelpController) {
    this.#helpController = helpController;
  }

  command = {
    name: '/help',
    description: 'Show available commands and keyboard shortcuts',
    action: 'help',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    this.#helpController.openHelp(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<HelpDialogCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.HELP_DIALOG,
      component: HelpDialog,
      footerHint: helpFooterHint,
      callbacks: this.#helpController.getCallbacks(api),
    };
  }
}
