import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { UserActionType } from '../../backend/backend';
import { SlashCommandHandler, SlashCommandAction } from '../slash_command_handler';

/**
 * Handler for the /compact slash command.
 *
 * Compaction is performed entirely by the backend (Duo Agent Platform). This
 * handler simply forwards the literal `/compact` command (optionally with an
 * instruction) so the backend can detect and execute it.
 */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultCompactCommandHandler implements SlashCommandHandler {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[CompactCommandHandler]');
  }

  command = {
    name: '/compact',
    description: 'Compress conversation history to save context space',
    action: SlashCommandAction.Compact,
  } as const;

  async execute(api: ControllerApi, args?: string[]): Promise<void> {
    const instruction = args?.join(' ').trim();
    const prompt = instruction ? `/compact ${instruction}` : '/compact';

    this.#logger.info('Executing /compact command');
    await api.sendPrompt({
      type: UserActionType.SendPrompt,
      prompt,
    });
  }
}
