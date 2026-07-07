import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@gitlab-org/logging';
import { convertToHttpUrl } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';

export type GitCommandResult = { output: string; exitCode: number | null };

export abstract class BaseGitCommand {
  protected logger: Logger;

  #configService: ConfigService;

  #secretRedactor: SecretRedactor;

  constructor(logger: Logger, configService: ConfigService, secretRedactor: SecretRedactor) {
    this.logger = logger;
    this.#configService = configService;
    this.#secretRedactor = secretRedactor;
  }

  protected async buildGitArgs(
    command: string,
    commandArgs: string[],
    repositoryUrl: string,
    basePath: string,
    gitDir?: string,
  ): Promise<string[]> {
    const defaultArgs = await this.defaultGitArgs(repositoryUrl, basePath);

    // Worktree support: explicitly set git metadata dir when provided.
    // When using --git-dir, also set --work-tree to ensure git operates on the intended checkout.
    const gitDirArgs: string[] = [];
    if (gitDir) {
      gitDirArgs.push('--git-dir', gitDir, '--work-tree', basePath);
    }

    return [...defaultArgs, ...gitDirArgs, command, ...commandArgs];
  }

  protected async defaultGitArgs(repositoryUrl: string, basePath: string): Promise<string[]> {
    const args: string[] = [];
    const defaultGitHttpsUser = 'auth';

    const configGitHttpUser = this.#configService.get('gitHttpUser');

    const gitHttpsUser = configGitHttpUser || defaultGitHttpsUser;
    const gitIgnoreDirOwners = true;

    const gitUserEmail = this.#configService.get('gitUserEmail') || '';
    const gitUserName = this.#configService.get('gitUserName') || '';

    let baseURL: string;
    try {
      baseURL = this.extractBaseURL(repositoryUrl);
    } catch (error) {
      this.logger.error(
        `Failed to get baseURL for git repo from repositoryUrl "${repositoryUrl}"`,
        error,
      );
      throw error;
    }

    /* Configure credential helper explicitly to avoid relying on Git's fallback
       behavior, which changed in Git 2.47+ and causes "unable to get password
       from user" errors in non-interactive environments.

       The helper reads the password from the GIT_PASSWORD environment variable,
       building on the existing askpass behaviour.
    */

    if (baseURL.length) {
      if (gitHttpsUser) {
        const credentialHelper = `!f() { echo username=${gitHttpsUser}; echo password=$GIT_PASSWORD; }; f`;
        args.push(`-c`, `credential.helper=${credentialHelper}`);
      }
      const ciRepoBaseURL = this.#extractCIRepositoryBaseURL();
      if (ciRepoBaseURL) {
        args.push(`-c`, `url.${baseURL}/.insteadOf=${ciRepoBaseURL}`);
      } else {
        const domain = baseURL.replace(/^https?:\/\//, '');
        args.push(`-c`, `url.${baseURL}/.insteadOf=git@${domain}:`);
      }
    }

    if (gitIgnoreDirOwners) {
      args.push(`-c`, `safe.directory=${basePath}`);
    }
    // These committer params are overridden by env variables in runGitCommand if set
    args.push(`-c`, `user.email=${gitUserEmail}`);
    if (gitUserName) {
      args.push('-c', `user.name=${gitUserName}`);
    }
    return args;
  }

  protected extractBaseURL(url: string): string {
    if (url === '') {
      return '';
    }

    try {
      // Convert SSH URLs to HTTP format before parsing
      const httpUrl = convertToHttpUrl(url);
      const parsedUrl = new URL(httpUrl);

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error(`unsupported protocol: ${parsedUrl.protocol}`);
      }

      if (!parsedUrl.origin) {
        throw new Error(`invalid URL format: ${url}`);
      }

      return parsedUrl.origin;
    } catch (error) {
      throw new Error(
        `invalid URL: ${url}, ${error instanceof Error ? error.message : 'parsing failed'}`,
      );
    }
  }

  /**
   * Extracts the base URL from CI_REPOSITORY_URL for GitLab CI authentication compatibility.
   *
   * When workflows run in GitLab CI pipelines, the CI environment automatically sets CI_REPOSITORY_URL
   * with an embedded CI job token (e.g., `http://gitlab-ci-token:TOKEN@gdk.test:3000/project.git`).
   *
   * The workflow executor uses an OAuth token with `ai_features` scope for git operations.
   * This OAuth token cannot authenticate using the CI token-embedded URL because:
   * 1. The git remote URL is configured with the CI job token credentials
   * 2. The OAuth token has different permissions and cannot use the CI token auth mechanism
   * 3. Attempting to push results in: "You are not allowed to push code to this project" (HTTP 403)
   *
   * So we use Git's URL rewriting feature (`url.<base>.insteadOf=<other>`) to transparently replace
   * the CI token-embedded URL with the clean base URL. This allows authentication to happen via
   * GIT_ASKPASS using the OAuth token instead of the embedded CI token.
   *
   * **Example:**
   * - Input: `http://gitlab-ci-token:foo-token-bar@gdk.test:3000/gitlab-duo/project.git`
   * - Output: `http://gitlab-ci-token:foo-token-bar@gdk.test:3000`
   * - Git config: `url.https://gitlab.com/.insteadOf=http://gitlab-ci-token:foo-token-bar@gdk.test:3000`
   */
  #extractCIRepositoryBaseURL(): string | null {
    const ciRepositoryUrl = process.env.CI_REPOSITORY_URL;
    if (!ciRepositoryUrl) return null;

    try {
      const parsedUrl = new URL(ciRepositoryUrl); // we assume it will always be http, never ssh

      let baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      if (parsedUrl.username || parsedUrl.password) {
        const userInfo = parsedUrl.password
          ? `${parsedUrl.username}:${parsedUrl.password}`
          : parsedUrl.username;
        baseUrl = `${parsedUrl.protocol}//${userInfo}@${parsedUrl.host}`;
      }

      return baseUrl;
    } catch (error) {
      throw new Error(
        `Failed to parse CI_REPOSITORY_URL, does it contain the expected structure? ${error instanceof Error ? error.message : 'parsing failed'}`,
      );
    }
  }

  /**
   * @deprecated No longer needed - credential helper is now inline in git args.
   * Kept for backward compatibility with existing callers.
   */
  protected async createGitAskPass(): Promise<string> {
    const tempFilePath = join(tmpdir(), `git-askpass-${uuidv4()}`);
    const contents = '#!/bin/sh\necho $GIT_PASSWORD';
    await writeFile(tempFilePath, contents, { mode: 0o700 });
    return tempFilePath;
  }

  /**
   * @deprecated No longer needed - credential helper is now inline in git args.
   * Kept for backward compatibility with existing callers.
   */
  protected async removeGitAskPass(tempFilePath: string) {
    if (!tempFilePath) return;

    try {
      await rm(tempFilePath, { force: true });
    } catch (cleanupError) {
      // If the cleanup fails, don't report this entire action execution as failed, just log
      this.logger.warn(
        `Failed to clean up temporary git askpass file: "${tempFilePath}"`,
        cleanupError,
      );
    }
  }

  protected runGitCommand(
    gitArgs: string[],
    basePath: string,
    gitPassword: string,
    abortSignal?: AbortSignal,
  ): Promise<GitCommandResult> {
    // We expect these can contain tokens via CI_REPOSITORY_URL so redact before logging
    const redactedGitArgs = this.#secretRedactor.redactSecrets(
      JSON.stringify(gitArgs),
      'git-command-args',
    );
    this.logger.debug(`Running git command with the following argument: ${redactedGitArgs}`);

    return new Promise((resolve, reject) => {
      const child = spawn('git', gitArgs, {
        shell: false,
        cwd: basePath,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME || process.env.USERPROFILE,
          GIT_EXEC_PATH: process.env.GIT_EXEC_PATH,
          // Password passed via env var for the inline credential helper in defaultGitArgs
          GIT_PASSWORD: this.#configService.get('gitHttpPassword') || gitPassword,
          GIT_TERMINAL_PROMPT: '0', // disable interactivity
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_NOGLOBAL: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: this.#configService.get('gitAuthorName') || '',
          GIT_AUTHOR_EMAIL: this.#configService.get('gitAuthorEmail') || '',
          GIT_COMMITTER_NAME: this.#configService.get('gitUserName') || '',
          GIT_COMMITTER_EMAIL: this.#configService.get('gitUserEmail') || '',

          // critical for sandbox networking:
          http_proxy: process.env.http_proxy || process.env.HTTP_PROXY,
          https_proxy: process.env.https_proxy || process.env.HTTPS_PROXY,
          all_proxy: process.env.all_proxy || process.env.ALL_PROXY,
          no_proxy: process.env.no_proxy || process.env.NO_PROXY,
        },
        signal: abortSignal,
      });

      let combinedOutput = '';
      child.stdout.on('data', (chunk) => {
        combinedOutput += chunk;
      });
      child.stderr.on('data', (chunk) => {
        combinedOutput += chunk;
      });

      child.on('error', (err) => {
        this.logger.debug('Git command error spawning process', {
          error: err.message,
        });
        reject(err);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.debug(`Git command exited with code ${code}`);
        }
        resolve({ output: combinedOutput, exitCode: code });
      });
    });
  }
}
