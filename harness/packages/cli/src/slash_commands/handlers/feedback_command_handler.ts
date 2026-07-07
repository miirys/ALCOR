import { Injectable } from '@gitlab/needle';
import {
  CLI_INPUT_TYPES,
  FeedbackInput,
  feedbackFooterHint,
  type FeedbackCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandHandler, type CommandComponentEntry } from '../slash_command_handler';
import { FeedbackController } from '../../feedback';

/**
 * Handler for the /feedback slash command.
 * Opens a multi-step feedback flow for submitting bug reports or feature requests.
 */
@Injectable(SlashCommandHandler, [FeedbackController])
export class DefaultFeedbackCommandHandler implements SlashCommandHandler<FeedbackCallbacks> {
  #feedbackController: FeedbackController;

  constructor(feedbackController: FeedbackController) {
    this.#feedbackController = feedbackController;
  }

  command = {
    name: '/feedback',
    description: 'Submit bug reports or feature requests',
    action: 'feedback',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    await this.#feedbackController.openFeedback(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<FeedbackCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.FEEDBACK,
      component: FeedbackInput,
      footerHint: feedbackFooterHint,
      callbacks: this.#feedbackController.getCallbacks(api),
    };
  }
}
