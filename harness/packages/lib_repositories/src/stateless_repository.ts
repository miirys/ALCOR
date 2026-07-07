import { GrepResult, GitGrepQuery } from 'simple-git';
import { GitRemote } from './repository';

export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'renamed'
  | 'copied'
  | 'conflicted';

export interface GitStatusFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  from?: string;
}

export interface GitStatus {
  files: GitStatusFile[];
  branch: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
}

export interface GrepParams {
  caseInsensitive: boolean;
  searchQuery: string | string[];
  /** Relative to the repository root */
  searchDirectory: string;
  /** Accelerate grep on large projects by limiting search depth */
  maxDepth?: number;
  /** Add context before and after the target line to potentially increase the quality of the search */
  context?: number;
  /** Limit the max number of matched target lines per file */
  maxCountFile?: number;
}

export type { GrepResult, GitGrepQuery };

export interface StatelessRepository {
  readonly fsPath: string;
  listRemotes(): Promise<GitRemote[]>;
  getCurrentCommit(): Promise<string | null>;
  /** Returns list of paths that are ignored */
  checkIgnore(filePaths: string[]): Promise<string[]>;
  /** Returns tracked and untracked non-ignored files, optionally filtered by glob pattern(s) */
  getFiles(glob?: string | string[]): Promise<string[]>;
  /** Searches for pattern in tracked and untracked files */
  grep(params: GrepParams): Promise<GrepResult>;
  getCurrentBranchName(): Promise<string | null>;
  /** Returns the current git status */
  getStatus(): Promise<GitStatus>;
}
