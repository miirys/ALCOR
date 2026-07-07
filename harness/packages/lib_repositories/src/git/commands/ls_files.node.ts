import { FsClient } from '@gitlab-org/fs';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import * as git from 'isomorphic-git';
import { BaseGitCommand } from './base_git_command';
import { GitLsFiles, isUnsupportedDircacheError } from './git_ls_files';

@Injectable(GitLsFiles, [Logger, ConfigService, FsClient, SecretRedactor])
export class NodeGitLsFiles extends BaseGitCommand implements GitLsFiles {
  #fsClient: FsClient;

  constructor(
    logger: Logger,
    configService: ConfigService,
    fsClient: FsClient,
    secretRedactor: SecretRedactor,
  ) {
    super(withPrefix(logger, '[NodeGitLsFiles]'), configService, secretRedactor);
    this.#fsClient = fsClient;
  }

  async execute(
    basePath: string,
    repositoryUrl: string = '',
    gitPassword: string = '',
    gitDir?: string,
  ): Promise<string[]> {
    try {
      return await git.listFiles({
        dir: basePath,
        fs: this.#fsClient,
        gitdir: gitDir,
      });
    } catch (err: unknown) {
      if (isUnsupportedDircacheError(err)) {
        this.logger.debug(
          `Repository "${basePath}" has an unsupported dircache version configured. "isomorphic-git" cannot work with anything other than dircache "2". Falling back to direct system git call`,
        );
      }
    }

    try {
      const command = 'ls-files';
      const lsFilesArgs: string[] = []; // This tool does not support any ls-file options

      const gitArgs = await this.buildGitArgs(
        command,
        lsFilesArgs,
        repositoryUrl,
        basePath,
        gitDir,
      );

      const result = await this.runGitCommand(gitArgs, basePath, gitPassword);

      if (result.exitCode !== 0) {
        throw new Error(`git command failed with exit code ${result.exitCode}: ${result.output}`);
      }

      this.logger.debug('Command executed successfully');

      return result.output.split('\n').filter((file) => file.trim() !== '');
    } catch (error) {
      this.logger.error('Command execution error', error);
      throw error;
    }
  }
}
