import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandAction, SlashCommandHandler } from '../slash_command_handler';

/**
 * Handler for the /exit slash command.
 * Triggers a graceful shutdown of the CLI application.
 */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultExitCommandHandler implements SlashCommandHandler {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[ExitCommandHandler]');
  }

  command = {
    name: '/exit',
    description: 'Exit the application',
    action: SlashCommandAction.Exit,
    aliases: ['/quit'],
  } as const;

  execute(api: ControllerApi): Promise<void> {
    this.#logger.info('Executing /exit command');
    api.exit();
    return Promise.resolve();
  }
}
