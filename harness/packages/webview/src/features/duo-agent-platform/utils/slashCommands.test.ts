import { describe, it, expect } from 'vitest';
import {
  defaultSlashCommands,
  rewriteSkillSlashCommand,
  resolveSlashCommandMessage,
  NEW_CHAT_MESSAGE,
  SKILLS_MESSAGE,
  SKILLS_PROMPT,
  type GitlabChatSlashCommand,
} from './slashCommands';

describe('defaultSlashCommands', () => {
  it('returns the pre-defined set of slash commands aligned with the agentic chat', () => {
    expect(defaultSlashCommands).toEqual([
      expect.objectContaining({ name: '/new' }),
      expect.objectContaining({ name: '/tests' }),
      expect.objectContaining({ name: '/refactor' }),
      expect.objectContaining({ name: '/fix' }),
      expect.objectContaining({ name: '/explain' }),
      expect.objectContaining({ name: '/include' }),
      expect.objectContaining({ name: '/skills' }),
      expect.objectContaining({ name: '/help' }),
    ]);
  });
});

describe('rewriteSkillSlashCommand', () => {
  const slashCommands: GitlabChatSlashCommand[] = [
    { name: '/deploy', description: 'Deploy skill', isSkill: true, skillName: 'deploy' },
    {
      name: '/test-runner',
      description: 'Test runner',
      isSkill: true,
      skillName: 'test-runner',
    },
    { name: '/help', description: 'Help command' },
  ];

  it('rewrites a skill command without a goal', () => {
    expect(rewriteSkillSlashCommand('/deploy', slashCommands)).toBe('Use the deploy skill');
  });

  it('appends a goal when present', () => {
    expect(rewriteSkillSlashCommand('/deploy to staging', slashCommands)).toBe(
      "Use the deploy skill to 'to staging'",
    );
  });

  it('preserves multi-word goals', () => {
    expect(rewriteSkillSlashCommand('/test-runner run all unit tests', slashCommands)).toBe(
      "Use the test-runner skill to 'run all unit tests'",
    );
  });

  it('returns null for non-skill commands', () => {
    expect(rewriteSkillSlashCommand('/help', slashCommands)).toBeNull();
  });

  it('returns null for plain messages', () => {
    expect(rewriteSkillSlashCommand('hello world', slashCommands)).toBeNull();
  });
});

describe('resolveSlashCommandMessage', () => {
  it('routes /new to a new chat', () => {
    expect(resolveSlashCommandMessage(NEW_CHAT_MESSAGE, defaultSlashCommands)).toEqual({
      kind: 'new-chat',
    });
  });

  it('rewrites /skills to the skills prompt', () => {
    expect(resolveSlashCommandMessage(SKILLS_MESSAGE, defaultSlashCommands)).toEqual({
      kind: 'submit',
      message: SKILLS_PROMPT,
    });
  });

  it('rewrites /help to the help prompt', () => {
    expect(resolveSlashCommandMessage('/help', defaultSlashCommands)).toEqual({
      kind: 'submit',
      message: 'help',
    });
  });

  it('rewrites skill commands using rewriteSkillSlashCommand', () => {
    const commands: GitlabChatSlashCommand[] = [
      ...defaultSlashCommands,
      { name: '/deploy', description: 'Deploy', isSkill: true, skillName: 'deploy' },
    ];
    expect(resolveSlashCommandMessage('/deploy to prod', commands)).toEqual({
      kind: 'submit',
      message: "Use the deploy skill to 'to prod'",
    });
  });

  it('prefers the built-in /skills command over a skill of the same name', () => {
    const commands: GitlabChatSlashCommand[] = [
      ...defaultSlashCommands,
      { name: SKILLS_MESSAGE, description: 'Skills skill', isSkill: true, skillName: 'skills' },
    ];
    expect(resolveSlashCommandMessage(SKILLS_MESSAGE, commands)).toEqual({
      kind: 'submit',
      message: SKILLS_PROMPT,
    });
  });

  it('passes through other messages unchanged', () => {
    expect(resolveSlashCommandMessage('hello world', defaultSlashCommands)).toEqual({
      kind: 'submit',
      message: 'hello world',
    });
  });
});
