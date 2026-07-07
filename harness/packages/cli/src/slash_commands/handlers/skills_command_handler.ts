import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  SkillsDialog,
  skillsFooterHint,
  type SkillsDialogCallbacks,
} from '@gitlab-org/tui';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { UserActionType } from '../../backend/backend';
import {
  SlashCommandHandler,
  SlashCommandAction,
  type CommandComponentEntry,
} from '../slash_command_handler';

@Injectable(SlashCommandHandler, [Logger, AgentSkillsResolver])
export class DefaultSkillsCommandHandler implements SlashCommandHandler<SkillsDialogCallbacks> {
  #logger: Logger;

  #agentSkillsResolver: AgentSkillsResolver;

  constructor(logger: Logger, agentSkillsResolver: AgentSkillsResolver) {
    this.#logger = withPrefix(logger, '[SkillsCommandHandler]');
    this.#agentSkillsResolver = agentSkillsResolver;
  }

  command = {
    name: '/skills',
    description: 'List available agent skills in this project.',
    action: SlashCommandAction.Skills,
  } as const;

  async execute(api: ControllerApi, args?: string[]): Promise<void> {
    const skillName = args?.[0];

    if (!skillName) {
      this.#logger.info('Executing /skills command (rendering skills natively)');
      await this.#openSkillsDialog(api);
      return;
    }

    const goal = args.slice(1).join(' ');
    let prompt = `Use the ${skillName} skill`;
    if (goal) {
      prompt += `: '${goal}'`;
    }

    this.#logger.info(`Executing skill command: ${skillName}`);
    await api.sendPrompt({
      type: UserActionType.SendPrompt,
      prompt,
    });
  }

  getComponent(api: ControllerApi): CommandComponentEntry<SkillsDialogCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.SKILLS_DIALOG,
      component: SkillsDialog,
      footerHint: skillsFooterHint,
      callbacks: {
        onClose: () => this.#closeSkillsDialog(api),
        onSelect: (skillName: string) => this.#runSkill(api, skillName),
      },
    };
  }

  #runSkill(api: ControllerApi, skillName: string): void {
    this.#closeSkillsDialog(api);
    api
      .sendPrompt({ type: UserActionType.SendPrompt, prompt: `Use the ${skillName} skill` })
      .catch((error) => this.#logger.debug('Failed to send skill prompt from dialog', error));
  }

  async #openSkillsDialog(api: ControllerApi): Promise<void> {
    const skills = await this.#agentSkillsResolver.getSkills();
    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.SKILLS_DIALOG,
        skills,
      },
    }));
  }

  #closeSkillsDialog(api: ControllerApi): void {
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }
}
