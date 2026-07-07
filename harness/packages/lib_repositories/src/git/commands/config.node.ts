import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import SSHConfig from 'ssh-config';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { URI } from 'vscode-uri';
import { GitConfigCommand } from './git_config';

@Injectable(GitConfigCommand, [Logger])
export class NodeGitConfigCommand implements GitConfigCommand {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[NodeGitConfigCommand]');
  }

  async getRemoteUrl(
    _gitConfigUri: URI,
    _remoteName: string,
    fallbackUrl: string,
  ): Promise<string> {
    try {
      const hostname = this.#extractHostname(fallbackUrl);

      if (!hostname) {
        return fallbackUrl;
      }

      const resolvedHostname = this.#resolveSSHHostname(hostname);

      if (resolvedHostname !== hostname) {
        this.#logger.debug(`Resolved SSH hostname: '${hostname}' -> '${resolvedHostname}'`);
        // Replace only the hostname part of the URL
        if (fallbackUrl.startsWith('git@')) {
          return fallbackUrl.replace(`git@${hostname}:`, `git@${resolvedHostname}:`);
        }
        try {
          const url = new URL(fallbackUrl);
          url.hostname = resolvedHostname;
          return url.toString();
        } catch {
          return fallbackUrl.replace(hostname, resolvedHostname);
        }
      }

      return fallbackUrl;
    } catch {
      return fallbackUrl;
    }
  }

  #extractHostname(url: string): string | null {
    try {
      const gitMatch = url.match(/^git@([^:]+):/);
      if (gitMatch) {
        return gitMatch[1] ?? null;
      }

      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      return null;
    }
  }

  #resolveSSHHostname(hostname: string): string {
    try {
      const sshConfigPath = join(homedir(), '.ssh', 'config');
      const configContent = readFileSync(sshConfigPath, 'utf8');
      const config = SSHConfig.parse(configContent);

      const computed = config.compute(hostname);

      if (computed.HostName) {
        return computed.HostName as string;
      }

      return hostname;
    } catch {
      return hostname;
    }
  }
}
