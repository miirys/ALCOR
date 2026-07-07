import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import * as git from 'isomorphic-git';
import { FsClient } from '@gitlab-org/fs';
import { GitLsFiles, isUnsupportedDircacheError } from './git_ls_files';

@Injectable(GitLsFiles, [Logger, FsClient])
export class BrowserGitLsFiles implements GitLsFiles {
  #logger: Logger;

  #fsClient: FsClient;

  constructor(logger: Logger, fsClient: FsClient) {
    this.#logger = withPrefix(logger, '[BrowserGitLsFiles]');
    this.#fsClient = fsClient;
  }

  async execute(
    basePath: string,
    _repositoryUrl?: string,
    _gitPassword?: string,
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
        this.#logger.debug(
          `Repository "${basePath}" has an unsupported dircache version configured. "isomorphic-git" cannot work with anything other than dircache "2". Returning empty file list.`,
        );
      } else {
        this.#logger.error(
          `An error occurred while using isomorphic-git to list files in "${basePath}". Returning empty file list.`,
          err,
        );
      }

      return [];
    }
  }
}
