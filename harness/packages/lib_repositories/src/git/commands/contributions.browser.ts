import { BrowserGitLsFiles } from './ls_files.browser';
import { BrowserGitConfigCommand } from './config.browser';

export const browserGitCommandsContributions = [
  BrowserGitLsFiles,
  BrowserGitConfigCommand,
] as const;
