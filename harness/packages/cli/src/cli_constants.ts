export const DUO_CLI_APP_NAME = 'Duo CLI';

export const DUO_CLI_APP_VENDOR = 'GitLab';

/** Keep the literal `/feedback` substring so the user can report the bug. */
export const buildFatalErrorMessage = (errorMessage: string): string =>
  `ALCOR encountered an unexpected error and had to close.\n\n${errorMessage}\n\nPlease start a new session and run /feedback to report this bug.`;
