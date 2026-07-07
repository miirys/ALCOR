import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandHandler } from '../slash_command_handler';
import { SessionManager } from '../../sessions';

/**
 * Handler for the /new slash command.
 * Creates a new chat session and clears the chat history.
 */
@Injectable(SlashCommandHandler, [SessionManager, Logger])
export class DefaultNewSessionCommandHandler implements SlashCommandHandler {
  #logger: Logger;

  #sessionManager: SessionManager;

  constructor(sessionManager: SessionManager, logger: Logger) {
    this.#logger = withPrefix(logger, '[NewSessionCommandHandler]');
    this.#sessionManager = sessionManager;
  }

  command = {
    name: '/new',
    description: 'Start a new chat session',
    action: 'new_session',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    this.#logger.info('Executing /new command');

    const activeSession = this.#sessionManager.getActiveSession();
    if (activeSession?.isLoading) {
      this.#logger.info(
        `Cancelling active session "${activeSession.sessionId}" before starting new session.`,
      );
      activeSession.cancelStream();
    }

    try {
      await this.#sessionManager.createSession();
    } catch (error) {
      this.#logger.error('Failed to create new session', error);
      api.showError('Failed to create new session. Please try again.');
    }
  }
}
