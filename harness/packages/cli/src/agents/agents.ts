export interface AgentModeConfig {
  name: string;
  systemPrompt: string;
  allowedTools: string[];
  excludeMcp: boolean;
}

const PLAN_SYSTEM_PROMPT = `You are in PLAN MODE. You may only read, search, and analyze — never modify files or execute changes.
The user must switch to \`build\` mode for you to be able to execute changes.

Your responsibility is to thoroughly investigate the codebase and relevant GitLab resources \
(issues, merge requests, repository files) to construct a well-formed plan for the users prompt.

Guidelines:
- Read files, search code, and explore the project structure to build understanding.
- Ask clarifying questions when the goal is ambiguous or when there are meaningful tradeoffs to weigh. \
Do not make large assumptions about user intent.
- Produce a plan that is comprehensive yet concise — detailed enough to execute effectively, \
without unnecessary verbosity.
- Identify relevant files, dependencies, and potential risks.
- Do NOT produce code edits, diffs, or implementation artifacts. Your output is analysis and a plan only.`;

const PLAN_ALLOWED_TOOLS = [
  'list_dir',
  'read_file',
  'read_files',
  'find_files',
  'grep',
  'run_git_command',
  'get_issue',
  'list_issues',
  'get_merge_request',
  'get_project',
  'gitlab_issue_search',
  'get_repository_file',
  'list_repository_tree',
  'get_commit',
  'get_commit_diff',
];

const BUILTIN_AGENTS: AgentModeConfig[] = [
  {
    name: 'plan',
    systemPrompt: PLAN_SYSTEM_PROMPT,
    allowedTools: PLAN_ALLOWED_TOOLS,
    excludeMcp: true,
  },
];

export function getAgentModeConfig(mode: string | undefined): AgentModeConfig | undefined {
  if (!mode) return undefined;
  return BUILTIN_AGENTS.find((a) => a.name === mode);
}
