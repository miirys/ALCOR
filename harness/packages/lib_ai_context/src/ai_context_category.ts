import z from 'zod';

export type AIContextCategory = z.infer<typeof AIContextCategory>;

export const AIContextCategory = z.enum([
  'file',
  'snippet',
  'terminal',
  'issue',
  'merge_request',
  'dependency',
  'local_git',
  'user_rule',
  'repository',
  'directory',
  'agent_user_environment',
  'os_information',
  'plan_context',
]);
