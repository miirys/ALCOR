import { ChatRecordType } from './gitlab_chat_record';

export type PromptType = Exclude<ChatRecordType, 'general'>;
type PromptTypeWithSlashCommand = Exclude<PromptType, 'focusChat'>;

export const commandToContentMap: Record<PromptTypeWithSlashCommand, string> = {
  explainCode: '/explain',
  fixCode: '/fix',
  generateTests: '/tests',
  refactorCode: '/refactor',
  newConversation: '/reset',

  // Explain terminal output does not trigger a slash command (e.g. turned into a prompt on the serverside).
  // The prompt content is defined here and sent as regular message content.
  explainTerminalOutput: 'Explain this terminal output',
} as const;

export const validPromptTypes: PromptType[] = [
  'explainCode',
  'explainTerminalOutput',
  'generateTests',
  'refactorCode',
  'newConversation',
  'fixCode',
  'focusChat',
] as const;
