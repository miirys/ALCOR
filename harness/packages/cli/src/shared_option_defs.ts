import { z } from 'zod';
import { LOG_LEVEL, type LogLevel } from '@gitlab-org/logging';
import { resolveCwdPath } from './utils/path';
import type { OptionDefMap } from './option_def';
import { CONFIG_FIELD_METADATA } from './commands/config/config_metadata';

/** Coerce string/boolean to boolean, treating undefined/null/'' as undefined. */
export const coerceOptionalBoolean = (v: unknown): boolean | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string') return v !== 'false' && v !== '0';
  return Boolean(v);
};

/** Coerce string/boolean to boolean (never undefined). */
export const coerceBoolean = (v: unknown): boolean => {
  if (typeof v === 'string') return v !== 'false' && v !== '0';
  return Boolean(v);
};

export const sharedOptionDefs = {
  cwd: {
    flags: '-C, --cwd <path>',
    description: 'Change the working directory.',
    default: process.cwd(),
    parse: (value: string) => resolveCwdPath(value),
    zod: z.string(),
  },
  gitlabBaseUrl: {
    flags: '--gitlab-base-url <url>',
    description: CONFIG_FIELD_METADATA.gitlabBaseUrl.description,
    env: 'GITLAB_URL',
    default: process.env.GITLAB_BASE_URL,
    zod: z.string().optional(),
  },
  gitlabAuthToken: {
    flags: '--gitlab-auth-token <token>',
    description: CONFIG_FIELD_METADATA.gitlabAuthToken.description,
    env: 'GITLAB_TOKEN',
    default: process.env.GITLAB_OAUTH_TOKEN,
    zod: z.string().optional(),
  },
  logLevel: {
    flags: '--log-level <level>',
    description: 'Set the logging level.',
    choices: Object.values(LOG_LEVEL),
    env: 'LOG_LEVEL',
    default: LOG_LEVEL.DEBUG,
    zod: z.enum(Object.values(LOG_LEVEL) as [string, ...string[]]).transform((v) => v as LogLevel),
  },
  gitHttpUser: {
    flags: '--git-http-user <user>',
    description: 'Username for Git HTTP authentication credentials.',
    env: 'DUO_WORKFLOW_GIT_HTTP_USER',
    zod: z.string().optional(),
  },
  gitHttpPassword: {
    flags: '--git-http-password <password>',
    description: 'Password for Git HTTP authentication credentials.',
    env: 'DUO_WORKFLOW_GIT_HTTP_PASSWORD',
    zod: z.string().optional(),
  },
  gitUserEmail: {
    flags: '--git-user-email <email>',
    description: 'Email for Git commit attribution.',
    env: 'DUO_WORKFLOW_GIT_USER_EMAIL',
    zod: z.string().optional(),
  },
  gitUserName: {
    flags: '--git-user-name <name>',
    description: 'Name for Git commit attribution.',
    env: 'DUO_WORKFLOW_GIT_USER_NAME',
    zod: z.string().optional(),
  },
  // DUO_WORKFLOW_GIT_AUTHOR_EMAIL and DUO_WORKFLOW_GIT_AUTHOR_USER_NAME are required in addition
  // to the DUO_WORKFLOW_GIT_USER_EMAIL and DUO_WORKFLOW_GIT_USER_NAME parameters because they are
  // used to attribute commits to both the User and Duo.
  // The git Author will be set to DUO_WORKFLOW_GIT_AUTHOR_USER_NAME and
  // the git Committer will be set to DUO_WORKFLOW_GIT_USER_NAME
  // More information can be found in:
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2835
  gitAuthorEmail: {
    flags: '--git-author-email <email>',
    description: 'Email for Git author attribution.',
    env: 'DUO_WORKFLOW_GIT_AUTHOR_EMAIL',
    zod: z.string().optional(),
  },
  gitAuthorName: {
    flags: '--git-author-name <name>',
    description: 'Name for Git author attribution.',
    env: 'DUO_WORKFLOW_GIT_AUTHOR_USER_NAME',
    zod: z.string().optional(),
  },
  sessionTrackingEnabled: {
    flags: '--session-tracking-enabled [value]',
    description: 'Add a GitLab Duo agent session URL trailer to Git commits.',
    env: 'DUO_SESSION_TRACKING_ENABLED',
    zod: z.preprocess(coerceOptionalBoolean, z.boolean().optional()),
  },
  telemetryEnabled: {
    flags: '--telemetry-enabled <value>',
    description: 'Enable collection of telemetry and error events.',
    env: 'DUO_WORKFLOW_TELEMETRY_ENABLED',
    zod: z.preprocess(coerceOptionalBoolean, z.boolean().optional()),
  },
  dangerouslySkipPermissions: {
    flags: '--dangerously-skip-permissions',
    description: 'Auto-confirm all tool calls without prompting for approval.',
    env: 'GITLAB_DANGEROUSLY_SKIP_PERMISSIONS',
    default: false,
    zod: z.preprocess(coerceBoolean, z.boolean()),
  },
  enableGlobalSkills: {
    flags: '--enable-global-skills <value>',
    description:
      '(EXPERIMENTAL) Enable discovery of global agent skills from `~/.agents/skills/` and `~/.gitlab/duo/skills/.`',
    env: 'GITLAB_ENABLE_GLOBAL_SKILLS',
    zod: z.preprocess(coerceOptionalBoolean, z.boolean().optional()),
  },
  sandbox: {
    flags: '--sandbox <value>',
    hidden: true,
    description: '(EXPERIMENTAL) Enable sandboxing for tool execution and MCP servers',
    env: 'DUO_SANDBOX_ENABLED',
    zod: z.preprocess(coerceOptionalBoolean, z.boolean().optional()),
  },
  skipTokenCheck: {
    flags: '--skip-token-check',
    hidden: true,
    description: 'Skip token validation during authentication.',
    env: 'GITLAB_SKIP_TOKEN_CHECK',
    default: false,
    zod: z.preprocess(coerceBoolean, z.boolean()),
  },
  enableProjectHooks: {
    flags: '--enable-project-hooks',
    description:
      'Enable loading hooks from the project-level configuration. Disabled by default to prevent running arbitrary code from checked-out projects.',
    env: 'GITLAB_ENABLE_PROJECT_HOOKS',
    default: false,
    zod: z.preprocess(coerceBoolean, z.boolean()),
  },
} satisfies OptionDefMap;
