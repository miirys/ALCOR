import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { AppState } from '@gitlab-org/tui';
import { CLI_INPUT_TYPES, SkillsDialog, defaultInputState, defaultAppState } from '@gitlab-org/tui';
import type { AgentSkill, AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import type { ControllerApi, StateMutation } from '../../commands/tui/controller_api';
import { UserActionType } from '../../backend/backend';
import { SlashCommandAction } from '../slash_command_handler';
import { DefaultSkillsCommandHandler } from './skills_command_handler';

const skills: AgentSkill[] = [
  { name: 'cli-development', description: 'Build and test the Duo CLI' },
  { name: 'di', description: 'Register a new service' },
];

describe('SkillsCommandHandler', () => {
  let handler: DefaultSkillsCommandHandler;
  let mockApi: ControllerApi;
  let mockResolver: AgentSkillsResolver;
  let logger: TestLogger;
  let currentState: AppState;

  beforeEach(() => {
    logger = new TestLogger();
    currentState = { ...defaultAppState };

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest
        .fn<ControllerApi['mutateState']>()
        .mockImplementation((mutation: StateMutation) => {
          currentState = mutation(currentState);
          return currentState;
        }),
      sendPrompt: jest.fn<ControllerApi['sendPrompt']>().mockResolvedValue(undefined),
    });

    mockResolver = createFakePartial<AgentSkillsResolver>({
      getSkills: jest.fn<AgentSkillsResolver['getSkills']>().mockResolvedValue(skills),
    });

    handler = new DefaultSkillsCommandHandler(logger, mockResolver);
  });

  it('has the correct command metadata', () => {
    expect(handler.command.name).toBe('/skills');
    expect(handler.command.action).toBe(SlashCommandAction.Skills);
  });

  describe('execute', () => {
    describe('when called without arguments', () => {
      beforeEach(async () => {
        await handler.execute(mockApi);
      });

      it('opens the skills dialog instead of sending a prompt', () => {
        expect(mockApi.sendPrompt).not.toHaveBeenCalled();
        expect(currentState.input.inputType).toBe(CLI_INPUT_TYPES.SKILLS_DIALOG);
      });

      it('passes all resolved skills (not just slash-command ones) to the dialog', () => {
        expect(mockResolver.getSkills).toHaveBeenCalled();
        expect(currentState.input).toMatchObject({
          inputType: CLI_INPUT_TYPES.SKILLS_DIALOG,
          skills,
        });
      });
    });

    describe('when called with undefined arguments', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, undefined);
      });

      it('opens the skills dialog instead of sending a prompt', () => {
        expect(mockApi.sendPrompt).not.toHaveBeenCalled();
        expect(currentState.input.inputType).toBe(CLI_INPUT_TYPES.SKILLS_DIALOG);
      });
    });

    describe('when no skills are resolved', () => {
      beforeEach(async () => {
        jest.mocked(mockResolver.getSkills).mockResolvedValue([]);
        await handler.execute(mockApi);
      });

      it('opens the dialog with an empty skill list', () => {
        expect(currentState.input).toMatchObject({
          inputType: CLI_INPUT_TYPES.SKILLS_DIALOG,
          skills: [],
        });
      });
    });

    describe('when called with a skill name only', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, ['cli-development']);
      });

      it('sends a prompt to use the skill', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: 'Use the cli-development skill',
        });
      });
    });

    describe('when called with a skill name and goal', () => {
      beforeEach(async () => {
        await handler.execute(mockApi, ['di', 'register', 'a', 'new', 'service']);
      });

      it('sends a prompt to use the skill with the goal', () => {
        expect(mockApi.sendPrompt).toHaveBeenCalledWith({
          type: UserActionType.SendPrompt,
          prompt: "Use the di skill: 'register a new service'",
        });
      });
    });
  });

  describe('getComponent', () => {
    it('registers the SkillsDialog for the skills dialog input type', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.inputType).toBe(CLI_INPUT_TYPES.SKILLS_DIALOG);
      expect(entry.component).toBe(SkillsDialog);
    });

    it('resets to the default input state when closed', async () => {
      await handler.execute(mockApi);
      expect(currentState.input.inputType).toBe(CLI_INPUT_TYPES.SKILLS_DIALOG);

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onClose();
      expect(currentState.input).toEqual(defaultInputState);
    });

    it('runs the selected skill and closes the dialog', async () => {
      await handler.execute(mockApi);

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onSelect('cli-development');

      expect(mockApi.sendPrompt).toHaveBeenCalledWith({
        type: UserActionType.SendPrompt,
        prompt: 'Use the cli-development skill',
      });
      expect(currentState.input).toEqual(defaultInputState);
    });
  });
});
