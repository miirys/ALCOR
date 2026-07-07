import { IGNORED_DIRECTORY_NAMES as BASE_IGNORED_DIRECTORY_NAMES } from '@gitlab-org/repositories';

// Git-specific paths that are only relevant for glob-based filtering in the original repository service
const gitSpecificIgnoredPaths = [
  'githooks',
  '.git/lfs',
  '.git/logs',
  '.git/objects',
  '.git/fsmonitor--daemon',
  '.git/worktrees',
  '.git/refs/remotes',
];

// Combine base ignored paths with git-specific paths for the original repository service
const allIgnoredPaths = [...BASE_IGNORED_DIRECTORY_NAMES, ...gitSpecificIgnoredPaths];

// Build the negated glob pattern using negative lookahead for the original repository service
export const COMMON_PATHS_PATTERN = `**/{${allIgnoredPaths.join(',')}}/**`;
