export interface GitlabChatSlashCommand {
  name: string;
  description: string;
  shouldSubmit?: boolean;
  isSkill?: boolean;
  skillName?: string;
}

const NewChatCommand: GitlabChatSlashCommand = {
  name: '/new',
  description: 'New chat conversation.',
};

const TestsCommand: GitlabChatSlashCommand = {
  name: '/tests',
  description: 'Generate tests for the selected snippet.',
};

const RefactorCommand: GitlabChatSlashCommand = {
  name: '/refactor',
  description: 'Refactor the selected snippet.',
};

const ExplainCommand: GitlabChatSlashCommand = {
  name: '/explain',
  description: 'Explain the selected snippet.',
};

const FixCommand: GitlabChatSlashCommand = {
  name: '/fix',
  description: 'Fix the selected code snippet.',
};

const IncludeCommand: GitlabChatSlashCommand = {
  name: '/include',
  description: 'Include additional context in the conversation.',
};

const SkillsCommand: GitlabChatSlashCommand = {
  name: '/skills',
  description: 'List available agent skills in this project.',
};

const HelpCommand: GitlabChatSlashCommand = {
  name: '/help',
  description: 'Learn what Chat can do.',
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
