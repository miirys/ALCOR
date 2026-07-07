export interface GitlabChatSlashCommand {
  name: string;
  description: string;
  shouldSubmit?: boolean;
  isSkill?: boolean;
  skillName?: string;
}

export const NEW_CHAT_MESSAGE = '/new';
export const INCLUDE_COMMAND = '/include';
export const SKILLS_MESSAGE = '/skills';
export const SKILLS_PROMPT = 'What agent skills are available in this project?';
// There is no /help command. Sending custom message until it's available
const HELP_MESSAGE = '/help';
const HELP_PROMPT = 'help';

const NewChatCommand: GitlabChatSlashCommand = {
  name: '/new',
  description: 'New chat conversation.',
  shouldSubmit: true,
};

const TestsCommand: GitlabChatSlashCommand = {
  name: '/tests',
  description: 'Generate tests for the selected snippet.',
  shouldSubmit: true,
};

const RefactorCommand: GitlabChatSlashCommand = {
  name: '/refactor',
  description: 'Refactor the selected snippet.',
  shouldSubmit: true,
};

const ExplainCommand: GitlabChatSlashCommand = {
  name: '/explain',
  description: 'Explain the selected snippet.',
  shouldSubmit: true,
};

const FixCommand: GitlabChatSlashCommand = {
  name: '/fix',
  description: 'Fix the selected code snippet.',
  shouldSubmit: true,
};

const IncludeCommand: GitlabChatSlashCommand = {
  name: INCLUDE_COMMAND,
  description: 'Include additional context in the conversation.',
};

const SkillsCommand: GitlabChatSlashCommand = {
  name: '/skills',
  description: 'List available agent skills in this project.',
  shouldSubmit: true,
};

const HelpCommand: GitlabChatSlashCommand = {
  name: '/help',
  description: 'Learn what Chat can do.',
  shouldSubmit: true,
};

export const defaultSlashCommands: GitlabChatSlashCommand[] = [
  NewChatCommand,
  TestsCommand,
  RefactorCommand,
  FixCommand,
  ExplainCommand,
  IncludeCommand,
  SkillsCommand,
  HelpCommand,
];

export function rewriteSkillSlashCommand(
  message: string,
  slashCommands: GitlabChatSlashCommand[],
): string | null {
  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);
  const commandName = parts[0];
  const goal = parts.slice(1).join(' ').trim();

  const matchedCommand = slashCommands.find((cmd) => cmd.isSkill && cmd.name === commandName);
  if (!matchedCommand) {
    return null;
  }

  const base = `Use the ${matchedCommand.skillName} skill`;
  return goal ? `${base} to '${goal}'` : base;
}

export function resolveSlashCommandMessage(
  message: string,
  slashCommands: GitlabChatSlashCommand[],
): { kind: 'new-chat' } | { kind: 'submit'; message: string } {
  if (message === NEW_CHAT_MESSAGE) {
    return { kind: 'new-chat' };
  }

  if (message === HELP_MESSAGE) {
    return { kind: 'submit', message: HELP_PROMPT };
  }

  if (message === SKILLS_MESSAGE) {
    return { kind: 'submit', message: SKILLS_PROMPT };
  }

  const skillRewrite = rewriteSkillSlashCommand(message, slashCommands);
  if (skillRewrite) {
    return { kind: 'submit', message: skillRewrite };
  }

  return { kind: 'submit', message };
}
