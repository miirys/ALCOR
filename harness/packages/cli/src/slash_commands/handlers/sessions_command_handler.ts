import { Injectable } from '@gitlab/needle';
import {
  CLI_INPUT_TYPES,
  SessionsSearchInput,
  sessionsSearchFooterHint,
  type SessionsCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SessionsHistoryController } from '../../sessions';
import { SlashCommandHandler, type CommandComponentEntry } from '../slash_command_handler';

@Injectable(SlashCommandHandler, [SessionsHistoryController])
export class DefaultSessionsCommandHandler implements SlashCommandHandler<SessionsCallbacks> {
  #sessionsHistoryController: SessionsHistoryController;

  constructor(sessionsHistoryController: SessionsHistoryController) {
    this.#sessionsHistoryController = sessionsHistoryController;
  }

  command = {
    name: '/sessions',
    description: 'Browse and switch between chat sessions',
    action: 'sessions',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    await this.#sessionsHistoryController.openSearch(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<SessionsCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.SESSIONS_SEARCH,
      component: SessionsSearchInput,
      footerHint: sessionsSearchFooterHint,
      callbacks: this.#sessionsHistoryController.getCallbacks(api),
    };
  }
}
