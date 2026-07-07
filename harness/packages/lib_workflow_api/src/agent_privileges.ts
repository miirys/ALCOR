// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum AGENT_PRIVILEGES {
  READ_WRITE_FILES = 1,
  READ_ONLY_GITLAB = 2,
  READ_WRITE_GITLAB = 3,
  RUN_COMMANDS = 4,
  USE_GIT = 5,
  RUN_MCP_TOOLS = 6,
  START_FLOWS = 7,
  READ_ONLY_FILES = 8,
}
/* eslint-enable @typescript-eslint/naming-convention */

export const defaultAgentPrivileges = [
  AGENT_PRIVILEGES.READ_WRITE_FILES,
  AGENT_PRIVILEGES.READ_ONLY_GITLAB,
  AGENT_PRIVILEGES.READ_WRITE_GITLAB,
  AGENT_PRIVILEGES.RUN_COMMANDS,
  AGENT_PRIVILEGES.RUN_MCP_TOOLS,
  AGENT_PRIVILEGES.USE_GIT,
];

export const HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES = [
  AGENT_PRIVILEGES.READ_WRITE_FILES,
  AGENT_PRIVILEGES.READ_ONLY_GITLAB,
  AGENT_PRIVILEGES.READ_WRITE_GITLAB,
  AGENT_PRIVILEGES.RUN_COMMANDS,
  AGENT_PRIVILEGES.RUN_MCP_TOOLS,
  AGENT_PRIVILEGES.USE_GIT,
];

/**
 * Read-only privilege set for "plan" mode so the agent can investigate without
 * mutating any state.
 *
 * FIXME: plan mode's toolset (PLAN_ALLOWED_TOOLS in
 * packages/cli/src/agents/agents.ts) still exposes `run_git_command`, but this
 * set omits USE_GIT (and RUN_COMMANDS). Once privilege gating is authoritative,
 * git inspection in plan mode will be rejected server-side. Either add USE_GIT
 * here (read-only git inspection is intended) or drop `run_git_command` from the
 * plan toolset so the two agree.
 */
export const PLAN_AGENT_PRIVILEGES = [
  AGENT_PRIVILEGES.READ_ONLY_FILES,
  AGENT_PRIVILEGES.READ_ONLY_GITLAB,
];
