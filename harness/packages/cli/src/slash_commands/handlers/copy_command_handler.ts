import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandHandler } from '../slash_command_handler';
import { SessionManager, type Session } from '../../sessions';
import { ClipboardService } from '../../utils/clipboard';

/**
 * Handler for the /copy slash command.
 * Copies the last assistant message to the system clipboard.
 */
@Injectable(SlashCommandHandler, [SessionManager, ClipboardService, Logger])
export class DefaultCopyCommandHandler implements SlashCommandHandler {
  #logger: Logger;

  #sessionManager: SessionManager;

  #clipboard: ClipboardService;

  constructor(sessionManager: SessionManager, clipboard: ClipboardService, logger: Logger) {
    this.#logger = withPrefix(logger, '[CopyCommandHandler]');
    this.#sessionManager = sessionManager;
    this.#clipboard = clipboard;
  }

  command = {
    name: '/copy',
    description: 'Copy last GitLab Duo message to clipboard',
    action: 'copy',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    this.#logger.info('Executing /copy command');

    const session = this.#sessionManager.getActiveSession();
    if (!session) {
      api.showError('No active session.');
      return;
    }

    const lastAssistantMessage = this.#getLastAssistantMessage(session);
    if (!lastAssistantMessage) {
      api.showError('No assistant messages to copy yet.');
      return;
    }

    try {
      this.#clipboard.copy(lastAssistantMessage);
      this.#logger.info('Copied last assistant message to clipboard');
      api.showInfo('Copied last GitLab Duo message to clipboard.');
    } catch (error) {
      this.#logger.error('Failed to copy to clipboard', error);
      api.showError('Failed to copy to clipboard. Make sure a clipboard tool is available.');
    }
  }

  #getLastAssistantMessage(session: Session): string | undefined {
    const { elements } = session;

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'message' && el.role === 'assistant' && el.content) {
        return el.content;
      }
    }

    return undefined;
  }
}
