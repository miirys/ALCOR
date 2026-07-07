// Must be the very FIRST import: installs the targeted Node deprecation-warning
// filter before any dependency can emit (DEP0040 punycode / DEP0169 url.parse).
import './suppress_node_warnings';
// Must be FIRST functional import: registers embedded sandbox-worker re-exec support (see guard at EOF).
import '@gitlab-org/sandbox/worker';
import { Command } from 'commander';

import { SanitizedError } from '@gitlab-org/errors';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { CommandBootstrapper } from './commands/command_bootstrapper';
import { RootCommand } from './commands/root_command';
import { ExitHandler } from './utils/exit';
import { buildFatalErrorMessage } from './cli_constants';
import { type CliGlobalExtensions } from './di';

// Create exit handler early - registers SIGINT/SIGTERM handlers immediately
const exitHandler = new ExitHandler();

const program = new Command();

const logAndExit = async (error: unknown) => {
  const errorHandler = (global as CliGlobalExtensions).__errorHandler; // eslint-disable-line no-underscore-dangle

  if (errorHandler) {
    // DI has initialised - use ErrorHandler which logs and tracks the error.
    const sanitizedError = new SanitizedError('GitLab Duo CLI uncaught exception', error);
    errorHandler.handleError(sanitizedError.message, sanitizedError);
    // Flush Sentry (and any other resources) before exiting so in-flight
    // error reports are not dropped by the process terminating too early.
    await errorHandler.dispose?.();
  } else {
    // DI not yet initialised: no logger/tracker exists, so write the full
    // error (with stack) to stderr to keep a pre-DI crash debuggable.
    // eslint-disable-next-line no-console
    console.error('GitLab Duo CLI uncaught exception', error);
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  await exitHandler.exit(1, { finalMessage: buildFatalErrorMessage(errorMessage) });
};
process.on('unhandledRejection', logAndExit);
process.on('uncaughtException', logAndExit);

const root = new RootCommand({
  version: getLanguageServerVersion(),
  exitHandler,
  program,
});

root.register(program);
new CommandBootstrapper().attach(program, root.children ?? []);

if (process.env.GITLAB_SANDBOX_WORKER !== 'true') {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    await logAndExit(error);
  }
}
