import { Injectable } from '@gitlab/needle';
import { URI } from 'vscode-uri';
import { GitConfigCommand } from './git_config';

@Injectable(GitConfigCommand, [])
export class BrowserGitConfigCommand implements GitConfigCommand {
  async getRemoteUrl(
    _gitConfigUri: URI,
    _remoteName: string,
    fallbackUrl: string,
  ): Promise<string> {
    return fallbackUrl;
  }
}
