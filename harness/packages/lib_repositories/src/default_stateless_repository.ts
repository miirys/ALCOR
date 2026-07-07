import { simpleGit, SimpleGit, pathspec, TaskOptions, grepQueryBuilder } from 'simple-git';
import { GitRemote } from './repository';
import {
  GrepParams,
  StatelessRepository,
  GrepResult,
  GitStatus,
  GitStatusFile,
  GitFileStatus,
} from './stateless_repository';

const STATUS_CODE_MAP: Record<string, GitFileStatus | undefined> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflicted',
};

export class DefaultStatelessRepository implements StatelessRepository {
  readonly fsPath: string;

  #git: SimpleGit;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
    this.#git = simpleGit(fsPath);
  }

  async listRemotes(): Promise<GitRemote[]> {
    try {
      const remotes = await this.#git.getRemotes(true);
      return remotes.map((remote) => ({
        remote: remote.name,
        url: remote.refs.fetch || remote.refs.push || '',
      }));
    } catch (error) {
      throw new Error(`Failed to list remotes: ${error}`, { cause: error });
    }
  }

  async getCurrentCommit(): Promise<string | null> {
    try {
      const result = await this.#git.revparse(['HEAD']);
      const commit = result.trim();
      return commit;
    } catch (error) {
      if (error instanceof Error && error.message.includes('unknown revision')) {
        // This means rev-parse errored because there are no commits
        // instead we return null and treat it a valid empty repository
        return null;
      }
      throw new Error(`Failed to get current commit: ${error}`, { cause: error });
    }
  }

  async getCurrentBranchName(): Promise<string | null> {
    try {
      const result = await this.#git.raw(['branch', '--show-current']);
      const branch = result.trim();
      return branch || null;
    } catch (error) {
      throw new Error(`Failed to get current branch name: ${error}`, { cause: error });
    }
  }

  async checkIgnore(filePaths: string[]): Promise<string[]> {
    return this.#git.checkIgnore(filePaths);
  }

  async getFiles(glob?: string | string[]): Promise<string[]> {
    try {
      const args = ['ls-files'];
      if (glob) {
        const patterns = Array.isArray(glob) ? glob : [glob];
        args.push(...patterns);
      }

      // Get tracked files
      const trackedFiles = await this.#git.raw(args);

      // Get untracked non-ignored files
      const untrackedArgs = ['ls-files', '--others', '--exclude-standard'];
      if (glob) {
        const patterns = Array.isArray(glob) ? glob : [glob];
        untrackedArgs.push(...patterns);
      }
      const untrackedFiles = await this.#git.raw(untrackedArgs);

      // Combine and return unique files
      const allFiles = [
        ...trackedFiles.split('\n').filter(Boolean),
        ...untrackedFiles.split('\n').filter(Boolean),
      ];

      return [...new Set(allFiles)];
    } catch (error) {
      throw new Error(`Failed to get files: ${error}`, { cause: error });
    }
  }

  async grep(params: GrepParams): Promise<GrepResult> {
    const options: TaskOptions = {
      '--untracked': null,
      paths: pathspec(params.searchDirectory),
    };

    if (params.caseInsensitive) {
      options['-i'] = null;
    }

    const optionalsMap = {
      maxDepth: '--max-depth',
      context: '--context',
      maxCountFile: '--max-count',
    };

    Object.entries(optionalsMap).forEach(([key, flag]) => {
      const value = params?.[key as keyof typeof optionalsMap];
      if (value !== undefined) {
        options[flag] = value;
      }
    });

    return this.#git.grep(grepQueryBuilder(...params.searchQuery), options);
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status = await this.#git.status();
      const files: GitStatusFile[] = [];

      for (const file of status.files) {
        const isUntracked = file.index === '?' && file.working_dir === '?';
        if (isUntracked) {
          files.push({
            path: file.path,
            status: 'untracked',
            staged: false,
            from: file.from,
          });
        } else {
          const indexStatus = STATUS_CODE_MAP[file.index];
          const workingDirStatus = STATUS_CODE_MAP[file.working_dir];

          if (indexStatus) {
            files.push({
              path: file.path,
              status: indexStatus,
              staged: true,
              from: file.from,
            });
          }

          if (workingDirStatus) {
            files.push({
              path: file.path,
              status: workingDirStatus,
              staged: false,
              from: file.from,
            });
          }
        }
      }

      return {
        files,
        branch: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        isClean: status.isClean(),
      };
    } catch (error) {
      throw new Error(`Failed to get git status: ${error}`, { cause: error });
    }
  }
}
