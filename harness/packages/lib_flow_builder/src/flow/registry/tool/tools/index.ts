import type { ToolDefinition } from '../type';
import { FILE_SYSTEM_TOOLS } from './file_system_tools';
import { GIT_TOOLS } from './git_tools';
import { TESTING_TOOLS } from './testing_tools';
import { GITLAB_CONTEXT_TOOLS } from './gitlab_context_tools';
import { GITLAB_ACTIONS_TOOLS } from './gitlab_actions_tools';
import { GITLAB_SEARCH_TOOLS } from './gitlab_search_tools';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...FILE_SYSTEM_TOOLS,
  ...GIT_TOOLS,
  ...TESTING_TOOLS,
  ...GITLAB_CONTEXT_TOOLS,
  ...GITLAB_ACTIONS_TOOLS,
  ...GITLAB_SEARCH_TOOLS,
];
